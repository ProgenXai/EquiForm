import { getEmailGreetingName, getUserFirstName } from "@/lib/email/get-user-first-name";
import { sendReportEmail } from "@/lib/email/templates";
import {
  generateReportPdfBytes,
  persistReportPdf,
  type ReportPdfRequestBody,
} from "@/lib/pdf/generate-report-pdf";
import type { createServiceRoleClient } from "@/lib/supabase/server";

const REPORT_EMAIL_DELAY_MS = 24 * 60 * 60 * 1000;

function sanitizePdfFilename(horseName: string): string {
  const sanitized = horseName
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return sanitized ? `EquiForm-Report-${sanitized}.pdf` : "EquiForm-Report.pdf";
}

async function isReportEmailAlreadySent(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  reportId: string,
): Promise<boolean> {
  const { data, error } = await serviceClient
    .from("reports")
    .select("report_email_sent_at")
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load report email status: ${error.message}`);
  }

  return Boolean(data?.report_email_sent_at);
}

async function markReportEmailSent(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  reportId: string,
): Promise<boolean> {
  const sentAt = new Date().toISOString();
  const { data, error } = await serviceClient
    .from("reports")
    .update({
      report_email_sent_at: sentAt,
      report_email_due_at: null,
    })
    .eq("id", reportId)
    .is("report_email_sent_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to mark report email sent: ${error.message}`);
  }

  return Boolean(data?.id);
}

export async function scheduleDelayedReportEmail(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  reportId: string,
): Promise<void> {
  const dueAt = new Date(Date.now() + REPORT_EMAIL_DELAY_MS).toISOString();

  const { error } = await serviceClient
    .from("reports")
    .update({ report_email_due_at: dueAt })
    .eq("id", reportId)
    .is("report_email_sent_at", null);

  if (error) {
    throw new Error(`Failed to schedule report email: ${error.message}`);
  }
}

export async function deliverReportReadyEmail(options: {
  serviceClient: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  userEmail: string;
  reportId: string;
  horseName: string;
  pdfBody?: ReportPdfRequestBody;
  pdfBytes?: Uint8Array;
  persistPdf?: boolean;
}): Promise<{ sent: boolean }> {
  if (await isReportEmailAlreadySent(options.serviceClient, options.reportId)) {
    return { sent: false };
  }

  if (!options.pdfBytes && !options.pdfBody) {
    throw new Error("pdfBody or pdfBytes is required to deliver report email");
  }

  const pdfBytes =
    options.pdfBytes ?? (await generateReportPdfBytes(options.pdfBody!));

  if (options.persistPdf !== false) {
    await persistReportPdf(
      pdfBytes,
      options.userId,
      options.reportId,
      options.serviceClient,
    );
  }

  const firstName = await getUserFirstName(options.serviceClient, options.userId);
  const greetingName = getEmailGreetingName(firstName, options.userEmail);

  await sendReportEmail({
    email: options.userEmail,
    greetingName,
    horseName: options.horseName,
    reportId: options.reportId,
    pdfBase64: Buffer.from(pdfBytes).toString("base64"),
    pdfFilename: sanitizePdfFilename(options.horseName),
  });

  const marked = await markReportEmailSent(
    options.serviceClient,
    options.reportId,
  );

  return { sent: marked };
}
