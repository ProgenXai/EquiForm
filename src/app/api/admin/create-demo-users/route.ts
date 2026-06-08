import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_USERS = [
  { email: "demo1@equiform.app", password: "EquiForm20261" },
  { email: "demo2@equiform.app", password: "EquiForm20262" },
  { email: "demo3@equiform.app", password: "EquiForm20263" },
  { email: "demo4@equiform.app", password: "EquiForm20264" },
  { email: "demo5@equiform.app", password: "EquiForm20265" },
] as const;

type CreatedDemoUser = { email: string; userId: string };
type FailedDemoUser = { email: string; error: string };

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured" },
      { status: 500 },
    );
  }

  const created: CreatedDemoUser[] = [];
  const failed: FailedDemoUser[] = [];

  for (const demoUser of DEMO_USERS) {
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: demoUser.email,
        password: demoUser.password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      failed.push({
        email: demoUser.email,
        error: authError?.message ?? "Failed to create auth user",
      });
      continue;
    }

    const { error: tokenError } = await supabaseAdmin.from("user_tokens").insert({
      user_id: authData.user.id,
      single_view_balance: 0,
      single_view_3d_balance: 1,
      full_report_balance: 0,
      full_report_3d_balance: 1,
    });

    if (tokenError) {
      failed.push({
        email: demoUser.email,
        error: `User created but token insert failed: ${tokenError.message}`,
      });
      continue;
    }

    created.push({
      email: demoUser.email,
      userId: authData.user.id,
    });
  }

  return NextResponse.json({
    created,
    failed,
    summary: {
      createdCount: created.length,
      failedCount: failed.length,
      total: DEMO_USERS.length,
    },
  });
}
