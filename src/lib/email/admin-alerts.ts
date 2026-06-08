import { getResendClient } from "@/lib/email/resend";

const ADMIN_ALERT_EMAIL = "EquiFormApp@gmail.com";
const ADMIN_ALERT_FROM = "EquiForm <EquiFormApp@gmail.com>";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendAdminAlert(
  subject: string,
  body: string,
): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    console.error(
      "[admin-alerts] Resend is not configured; alert not sent:",
      subject,
    );
    return;
  }

  const timestamp = new Date().toISOString();
  const html = `
    <p><strong>Timestamp:</strong> ${escapeHtml(timestamp)}</p>
    <pre style="white-space:pre-wrap;font-family:monospace;font-size:13px;">${escapeHtml(body)}</pre>
  `;

  const { error } = await resend.emails.send({
    from: ADMIN_ALERT_FROM,
    to: ADMIN_ALERT_EMAIL,
    subject: `[EquiForm Alert] ${subject}`,
    html,
  });

  if (error) {
    console.error("[admin-alerts] failed to send alert:", error);
  }
}
