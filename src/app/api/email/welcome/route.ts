import { NextResponse } from "next/server";

import { sendWelcomeEmail } from "@/lib/email/templates";

type WelcomeEmailBody = {
  email?: string;
  name?: string;
};

export async function POST(request: Request) {
  let body: WelcomeEmailBody;

  try {
    body = (await request.json()) as WelcomeEmailBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : undefined;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  try {
    const result = await sendWelcomeEmail({ email, name });

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    console.error("[email/welcome] failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to send welcome email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
