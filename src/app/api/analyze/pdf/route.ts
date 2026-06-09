import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getEmailGreetingName, getUserFirstName } from "@/lib/email/get-user-first-name";
import { sendReportEmail } from "@/lib/email/templates";
import {
  generateReportPdfBytes,
  persistReportPdf,
  type ReportPdfRequestBody,
} from "@/lib/pdf/generate-report-pdf";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const maxDuration = 30;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

type PdfRequestBody = ReportPdfRequestBody & {
  reportId?: string;
  sendEmail?: boolean;
};

function sanitizePdfFilename(horseName: string): string {
  const sanitized = horseName
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  return sanitized ? `EquiForm-Report-${sanitized}.pdf` : "EquiForm-Report.pdf";
}

export async function POST(request: Request) {
  let body: PdfRequestBody;

  try {
    body = (await request.json()) as PdfRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reportId =
    typeof body.reportId === "string" ? body.reportId.trim() : "";

  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  if (!user.email) {
    return NextResponse.json({ error: "User email is required" }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  const { data: existingReport, error: existingReportError } =
    await serviceClient
      .from("reports")
      .select("pdf_url, horse_name")
      .eq("id", reportId)
      .eq("user_id", user.id)
      .maybeSingle();

  if (existingReportError) {
    return NextResponse.json(
      { error: "Failed to load report" },
      { status: 500 },
    );
  }

  if (!existingReport) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const shouldRegenerate =
    Boolean(body.model3d_snapshot?.trim()) || body.model3d_placeholder === true;

  if (existingReport.pdf_url && !shouldRegenerate) {
    if (body.sendEmail) {
      try {
        const pdfResponse = await fetch(existingReport.pdf_url);
        if (!pdfResponse.ok) {
          throw new Error("Failed to fetch existing PDF");
        }

        const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
        const firstName = await getUserFirstName(serviceClient, user.id);
        const greetingName = getEmailGreetingName(firstName, user.email);
        const horseName =
          typeof body.horse_name === "string" && body.horse_name.trim()
            ? body.horse_name.trim()
            : typeof existingReport.horse_name === "string" &&
                existingReport.horse_name.trim()
              ? existingReport.horse_name.trim()
              : "Your Horse";

        await sendReportEmail({
          email: user.email,
          greetingName,
          horseName,
          pdfBase64: Buffer.from(pdfBytes).toString("base64"),
          pdfFilename: sanitizePdfFilename(horseName),
        });
      } catch (emailError) {
        console.error("[analyze/pdf] report-ready email failed:", emailError);
      }
    }

    return NextResponse.json({ pdfUrl: existingReport.pdf_url });
  }

  if (!body.report) {
    return NextResponse.json({ error: "report is required" }, { status: 400 });
  }

  try {
    const pdfBytes = await generateReportPdfBytes(body);
    const pdfUrl = await persistReportPdf(
      pdfBytes,
      user.id,
      reportId,
      serviceClient,
    );

    if (body.sendEmail) {
      try {
        const firstName = await getUserFirstName(serviceClient, user.id);
        const greetingName = getEmailGreetingName(firstName, user.email);
        const horseName =
          typeof body.horse_name === "string" && body.horse_name.trim()
            ? body.horse_name.trim()
            : typeof existingReport.horse_name === "string" &&
                existingReport.horse_name.trim()
              ? existingReport.horse_name.trim()
              : "Your Horse";

        await sendReportEmail({
          email: user.email,
          greetingName,
          horseName,
          pdfBase64: Buffer.from(pdfBytes).toString("base64"),
          pdfFilename: sanitizePdfFilename(horseName),
        });
      } catch (emailError) {
        console.error("[analyze/pdf] report-ready email failed:", emailError);
      }
    }

    return NextResponse.json({ pdfUrl });
  } catch (error) {
    console.error("[analyze/pdf] PDF generation failed:", error);

    const message =
      error instanceof Error ? error.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
