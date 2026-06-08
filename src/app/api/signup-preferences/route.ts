import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type SignupPreferencesBody = {
  notifyUpdates?: boolean;
};

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!jwt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SignupPreferencesBody;
  const notifyUpdates = body.notifyUpdates === true;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing, error: lookupError } = await supabase
    .from("user_tokens")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("[signup-preferences] lookup failed:", lookupError);
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("user_tokens")
      .update({ notify_updates: notifyUpdates })
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[signup-preferences] update failed:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabase.from("user_tokens").insert({
      user_id: user.id,
      notify_updates: notifyUpdates,
      single_view_balance: 0,
      single_view_3d_balance: 0,
      full_report_balance: 0,
      full_report_3d_balance: 0,
    });

    if (insertError) {
      console.error("[signup-preferences] insert failed:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
