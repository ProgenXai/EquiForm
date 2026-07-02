import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { deliverReportReadyEmail } from "@/lib/email/deliver-report-ready-email";
import {
  generateReportPdfBytes,
  persistReportPdf,
  type ReportPdfRequestBody,
} from "@/lib/pdf/generate-report-pdf";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { USER_FACING } from "@/lib/user-facing-errors";

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

export async function POST(request: Request) {
  let body: PdfRequestBody;

  try {
    body = (await request.json()) as PdfRequestBody;
  } catch {
    return NextResponse.json({ error: USER_FACING.generic }, { status: 400 });
  }

  const reportId =
    typeof body.reportId === "string" ? body.reportId.trim() : "";

  if (!reportId) {
    return NextResponse.json({ error: USER_FACING.pdf }, { status: 400 });
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
      { error: USER_FACING.signInRequired },
      { status: 401 },
    );
  }

  if (!user.email) {
    return NextResponse.json({ error: USER_FACING.generic }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  const { data: existingReport, error: existingReportError } =
    await serviceClient
      .from("reports")
      .select("pdf_url, horse_name, report_email_sent_at")
      .eq("id", reportId)
      .eq("user_id", user.id)
      .maybeSingle();

  if (existingReportError) {
    return NextResponse.json({ error: USER_FACING.generic }, { status: 500 });
  }

  if (!existingReport) {
    return NextResponse.json({ error: USER_FACING.reportNotFound }, { status: 404 });
  }

  const shouldRegenerate =
    Boolean(body.model3d_snapshot?.trim()) || body.model3d_placeholder === true;

  if (existingReport.pdf_url && !shouldRegenerate && !body.model3d_snapshot?.trim()) {
    if (body.sendEmail && !existingReport.report_email_sent_at) {
      try {
        const pdfResponse = await fetch(existingReport.pdf_url);
        if (!pdfResponse.ok) {
          throw new Error("Failed to fetch existing PDF");
        }

        const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
        const horseName =
          typeof body.horse_name === "string" && body.horse_name.trim()
            ? body.horse_name.trim()
            : typeof existingReport.horse_name === "string" &&
                existingReport.horse_name.trim()
              ? existingReport.horse_name.trim()
              : "Your Horse";

        await deliverReportReadyEmail({
          serviceClient,
          userId: user.id,
          userEmail: user.email,
          reportId,
          horseName,
          pdfBytes,
          persistPdf: false,
        });
      } catch (emailError) {
        console.error("[analyze/pdf] report-ready email failed:", emailError);
      }
    }

    return NextResponse.json({ pdfUrl: existingReport.pdf_url });
  }

  if (!body.report) {
    return NextResponse.json({ error: USER_FACING.pdf }, { status: 400 });
  }

  try {
    const pdfBytes = await generateReportPdfBytes(body);
    const pdfUrl = await persistReportPdf(
      pdfBytes,
      user.id,
      reportId,
      serviceClient,
    );

    if (body.sendEmail && !existingReport.report_email_sent_at) {
      try {
        const horseName =
          typeof body.horse_name === "string" && body.horse_name.trim()
            ? body.horse_name.trim()
            : typeof existingReport.horse_name === "string" &&
                existingReport.horse_name.trim()
              ? existingReport.horse_name.trim()
              : "Your Horse";

        await deliverReportReadyEmail({
          serviceClient,
          userId: user.id,
          userEmail: user.email,
          reportId,
          horseName,
          pdfBody: body,
          pdfBytes,
          persistPdf: false,
        });
      } catch (emailError) {
        console.error("[analyze/pdf] report-ready email failed:", emailError);
      }
    }

    await serviceClient
      .from("reports")
      .update({ pdf_url: pdfUrl })
      .eq("id", reportId)
      .eq("user_id", user.id);

    return NextResponse.json({ pdfUrl });
  } catch (error) {
    console.error("[analyze/pdf] PDF generation failed:", error);

    return NextResponse.json({ error: USER_FACING.pdf }, { status: 500 });
  }
}
