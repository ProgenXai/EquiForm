import { NextResponse } from "next/server";

import { processDueReportEmails } from "@/lib/email/process-due-report-emails";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization") ?? "";

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const serviceClient = createServiceRoleClient();
    const result = await processDueReportEmails(serviceClient);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cron/report-emails] failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process report emails";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
