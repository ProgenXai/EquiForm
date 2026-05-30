import { NextResponse } from "next/server";

import { sendFirstReportEmail } from "@/lib/email/templates";

type FirstReportEmailBody = {
  email?: string;
  horseName?: string;
};

export async function POST(request: Request) {
  let body: FirstReportEmailBody;

  try {
    body = (await request.json()) as FirstReportEmailBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const horseName =
    typeof body.horseName === "string" ? body.horseName.trim() : undefined;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  try {
    const result = await sendFirstReportEmail({ email, horseName });
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    console.error("[email/first-report] failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to send first report email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
