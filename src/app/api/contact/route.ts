import { NextResponse } from "next/server";

import { EMAIL_FROM } from "@/lib/email/templates";
import { getResendClient } from "@/lib/email/resend";
import { USER_FACING } from "@/lib/user-facing-errors";

const CONTACT_TO = "EquiFormApp@gmail.com";

const CONTACT_SUBJECTS = new Set([
  "General Question",
  "Bug Report",
  "Feature Suggestion",
  "Other",
]);

type ContactRequestBody = {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: Request) {
  let body: ContactRequestBody;

  try {
    body = (await request.json()) as ContactRequestBody;
  } catch {
    return NextResponse.json({ error: USER_FACING.generic }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  if (!CONTACT_SUBJECTS.has(subject)) {
    return NextResponse.json({ error: "Invalid subject" }, { status: 400 });
  }

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const resend = getResendClient();
  if (!resend) {
    return NextResponse.json({ error: USER_FACING.contact }, { status: 500 });
  }

  const html = `
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <p><strong>Message:</strong></p>
    <p style="white-space:pre-wrap;">${escapeHtml(message)}</p>
  `;

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: CONTACT_TO,
    replyTo: email,
    subject: `EquiForm Contact: ${subject}`,
    html,
  });

  if (error) {
    console.error("[contact] failed:", error);
    return NextResponse.json({ error: USER_FACING.contact }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
