import { getResendClient } from "@/lib/email/resend";

export const EMAIL_FROM = "EquiForm <noreply@equiform.app>";

const ACCENT = "#00d4c8";
const BG = "#0a0a0a";
const CARD_BG = "#18181b";
const TEXT = "#f4f4f5";
const MUTED = "#a1a1aa";

function emailLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BG};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:${CARD_BG};border:1px solid #27272a;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:32px 28px 8px;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:700;color:${ACCENT};letter-spacing:-0.02em;">EquiForm</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 32px;color:${TEXT};font-size:15px;line-height:1.65;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;text-align:center;">
              <p style="margin:0;font-size:12px;color:${MUTED};">EquiForm — AI-Powered Horse Conformation Analysis</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string, primary = true): string {
  if (primary) {
    return `<p style="margin:24px 0 0;text-align:center;">
      <a href="${href}" style="display:inline-block;padding:12px 24px;background-color:${ACCENT};color:#000000;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>
    </p>`;
  }

  return `<p style="margin:16px 0 0;text-align:center;">
    <a href="${href}" style="display:inline-block;padding:12px 24px;border:1px solid ${ACCENT};color:${ACCENT};font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>
  </p>`;
}

export function welcomeEmailHtml(_name?: string): string {

  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${TEXT};">Welcome to EquiForm 🐴</h1>
    <p style="margin:0 0 16px;color:${MUTED};">
      Thanks for joining EquiForm! Please verify your email to get started.
    </p>
    ${button("https://equiform.app/verify-email", "Verify Your Email", false)}
    <p style="margin:8px 0 0;text-align:center;color:${MUTED};font-size:13px;">
      Verifying your email helps ensure you receive your reports and account updates.
    </p>
  `;

  return emailLayout("Welcome to EquiForm", body);
}

export function firstReportEmailHtml(horseName?: string): string {
  const horseLine = horseName?.trim()
    ? `Congratulations on completing your first EquiForm report for <strong style="color:${TEXT};">${horseName.trim()}</strong>!`
    : "Congratulations on completing your first EquiForm report!";

  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${TEXT};">Your Report is Ready</h1>
    <p style="margin:0 0 16px;color:${MUTED};">${horseLine}</p>
    <p style="margin:0 0 16px;color:${MUTED};">
      How did the experience go? We hope the analysis gave you useful insight into your horse&apos;s conformation.
      You can run additional analyses anytime you have report credits available.
    </p>
    <p style="margin:0 0 16px;color:${MUTED};">
      Need more reports? Purchase additional report credits anytime.
    </p>
    ${button("https://equiform.app/buy-credits", "Buy Report Credits")}
    <p style="margin:24px 0 0;color:${MUTED};font-size:14px;">
      <strong style="color:${ACCENT};">Coming soon from ProgenXai:</strong> our breeding intelligence platform
      for mare owners who want to find the perfect stallion match. Stay tuned.
    </p>
  `;

  return emailLayout("Your EquiForm Report is Ready", body);
}

export const WELCOME_EMAIL_SUBJECT = "Welcome to EquiForm 🐴";
export const FIRST_REPORT_EMAIL_SUBJECT =
  "Your EquiForm Report is Ready — How Did It Go?";

export function reportReadyEmailSubject(horseName: string): string {
  const name = horseName.trim() || "Your Horse";
  return `Your EquiForm Report is Ready — ${name}`;
}

export function reportReadyEmailHtml(
  greetingName: string,
  horseName: string,
): string {
  const horse = horseName.trim() || "your horse";
  const greeting = greetingName === "there" ? "Hi there," : `Hi ${greetingName},`;

  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:${TEXT};">Your Report is Ready</h1>
    <p style="margin:0 0 16px;color:${MUTED};">${greeting}</p>
    <p style="margin:0 0 16px;color:${MUTED};">
      Your conformation analysis for <strong style="color:${TEXT};">${horse}</strong> is complete!
      Your report is attached. You can also view and download it anytime from My Reports.
    </p>
    ${button("https://equiform.app/my-reports", "View in My Reports")}
  `;

  return emailLayout("Your EquiForm Report is Ready", body);
}

export async function sendWelcomeEmail(options: {
  email: string;
  name?: string;
}): Promise<{ id?: string }> {
  const resend = getResendClient();
  if (!resend) {
    throw new Error("Resend is not configured");
  }

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: options.email,
    subject: WELCOME_EMAIL_SUBJECT,
    html: welcomeEmailHtml(options.name),
  });

  if (error) {
    throw new Error(error.message);
  }

  return { id: data?.id };
}

export async function sendFirstReportEmail(options: {
  email: string;
  horseName?: string;
}): Promise<{ id?: string }> {
  const resend = getResendClient();
  if (!resend) {
    throw new Error("Resend is not configured");
  }

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: options.email,
    subject: FIRST_REPORT_EMAIL_SUBJECT,
    html: firstReportEmailHtml(options.horseName),
  });

  if (error) {
    throw new Error(error.message);
  }

  return { id: data?.id };
}

export async function sendReportEmail(options: {
  email: string;
  greetingName: string;
  horseName: string;
  pdfBase64: string;
  pdfFilename: string;
}): Promise<{ id?: string }> {
  const resend = getResendClient();
  if (!resend) {
    throw new Error("Resend is not configured");
  }

  const horseName = options.horseName.trim() || "Your Horse";

  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: options.email,
    subject: reportReadyEmailSubject(horseName),
    html: reportReadyEmailHtml(options.greetingName, horseName),
    attachments: [
      {
        filename: options.pdfFilename,
        content: options.pdfBase64,
      },
    ],
  });

  if (error) {
    throw new Error(error.message);
  }

  return { id: data?.id };
}
