import { buildReportPdfBodyFromStoredReport } from "@/lib/email/build-report-pdf-body";
import { deliverReportReadyEmail } from "@/lib/email/deliver-report-ready-email";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type DueReportRow = {
  id: string;
  user_id: string;
  horse_name: string | null;
  breed: string | null;
  age: string | null;
  sex: string | null;
  coat_color: string | null;
  discipline: string | null;
  report_text: string | null;
  overlay_url: string | null;
  balance_score: number | null;
  shoulder_score: number | null;
  hip_score: number | null;
  topline_score: number | null;
  leg_score: number | null;
  overall_score: number | null;
};

export async function processDueReportEmails(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<{ processed: number; sent: number; failed: number }> {
  const now = new Date().toISOString();

  const { data: dueReports, error } = await serviceClient
    .from("reports")
    .select(
      "id, user_id, horse_name, breed, age, sex, coat_color, discipline, report_text, overlay_url, balance_score, shoulder_score, hip_score, topline_score, leg_score, overall_score",
    )
    .is("report_email_sent_at", null)
    .not("report_email_due_at", "is", null)
    .lte("report_email_due_at", now)
    .limit(25);

  if (error) {
    throw new Error(`Failed to load due report emails: ${error.message}`);
  }

  let sent = 0;
  let failed = 0;

  for (const report of (dueReports ?? []) as DueReportRow[]) {
    try {
      const { data: userData, error: userError } =
        await serviceClient.auth.admin.getUserById(report.user_id);

      if (userError || !userData.user?.email) {
        console.error("[report-emails] missing user email:", {
          reportId: report.id,
          userId: report.user_id,
          error: userError?.message,
        });
        failed += 1;
        continue;
      }

      const pdfBody = buildReportPdfBodyFromStoredReport(report, {
        model3dPlaceholder: true,
      });

      if (!pdfBody) {
        console.error("[report-emails] unable to build PDF body:", {
          reportId: report.id,
        });
        failed += 1;
        continue;
      }

      const result = await deliverReportReadyEmail({
        serviceClient,
        userId: report.user_id,
        userEmail: userData.user.email,
        reportId: report.id,
        horseName: report.horse_name?.trim() || "Your Horse",
        pdfBody,
      });

      if (result.sent) {
        sent += 1;
      }
    } catch (processError) {
      failed += 1;
      console.error("[report-emails] failed to send due report email:", {
        reportId: report.id,
        error:
          processError instanceof Error
            ? processError.message
            : String(processError),
      });
    }
  }

  return {
    processed: dueReports?.length ?? 0,
    sent,
    failed,
  };
}
