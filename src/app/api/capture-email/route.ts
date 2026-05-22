import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

type CaptureEmailBody = {
  email?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CaptureEmailBody;
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (email && email.includes("@") && email.includes(".")) {
      const { error } = await supabaseAdmin.from("email_captures").insert({ email });

      if (error) {
        console.error("[capture-email] insert failed:", error);
      }
    }
  } catch (error) {
    console.error("[capture-email] request failed:", error);
  }

  return NextResponse.json({ success: true });
}
