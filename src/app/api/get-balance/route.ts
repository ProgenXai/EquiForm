import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const EMPTY_BALANCES = {
  single_view_balance: 0,
  full_report_balance: 0,
};

export async function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(EMPTY_BALANCES);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!jwt) {
    return NextResponse.json(EMPTY_BALANCES);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return NextResponse.json(EMPTY_BALANCES);
  }

  const { data: tokenRow } = await supabase
    .from("user_tokens")
    .select("single_view_balance, full_report_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    single_view_balance: tokenRow?.single_view_balance ?? 0,
    full_report_balance: tokenRow?.full_report_balance ?? 0,
  });
}
