import { getEmailGreetingName, getUserFirstName } from "@/lib/email/get-user-first-name";
import { sendReportEmail } from "@/lib/email/templates";
import {
  generateReportPdfBytes,
  persistReportPdf,
  type ReportPdfRequestBody,
} from "@/lib/pdf/generate-report-pdf";
import type { createServiceRoleClient } from "@/lib/supabase/server";

function sanitizePdfFilename(horseName: string): string {
  const sanitized = horseName
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return sanitized ? `EquiForm-Report-${sanitized}.pdf` : "EquiForm-Report.pdf";
}

export async function deliverReportReadyEmail(options: {
  serviceClient: ReturnType<typeof createServiceRoleClient>;
  userId: string;
  userEmail: string;
  reportId: string;
  horseName: string;
  pdfBody: ReportPdfRequestBody;
}): Promise<void> {
  const pdfBytes = await generateReportPdfBytes(options.pdfBody);
  await persistReportPdf(
    pdfBytes,
    options.userId,
    options.reportId,
    options.serviceClient,
  );

  const firstName = await getUserFirstName(options.serviceClient, options.userId);
  const greetingName = getEmailGreetingName(firstName, options.userEmail);

  await sendReportEmail({
    email: options.userEmail,
    greetingName,
    horseName: options.horseName,
    pdfBase64: Buffer.from(pdfBytes).toString("base64"),
    pdfFilename: sanitizePdfFilename(options.horseName),
  });
}
