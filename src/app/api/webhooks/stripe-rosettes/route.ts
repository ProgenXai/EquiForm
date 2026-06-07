import { NextResponse } from "next/server";
import Stripe from "stripe";

import { findRosettePack } from "@/lib/stripe/rosette-packs";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type BalanceColumn =
  | "single_view_balance"
  | "single_view_3d_balance"
  | "full_report_balance"
  | "full_report_3d_balance";

const PACK_ID_TO_BALANCE_COLUMN: Record<string, BalanceColumn> = {
  single_view_no3d_1: "single_view_balance",
  single_view_no3d_3: "single_view_balance",
  single_view_no3d_5: "single_view_balance",
  single_view_3d_1: "single_view_3d_balance",
  single_view_3d_3: "single_view_3d_balance",
  single_view_3d_5: "single_view_3d_balance",
  full_report_no3d_1: "full_report_balance",
  full_report_no3d_3: "full_report_balance",
  full_report_no3d_5: "full_report_balance",
  full_report_3d_1: "full_report_3d_balance",
  full_report_3d_3: "full_report_3d_balance",
  full_report_3d_5: "full_report_3d_balance",
  "sv-1": "single_view_balance",
  "sv-3": "single_view_balance",
  "sv-5": "single_view_balance",
  "sv3d-1": "single_view_3d_balance",
  "sv3d-3": "single_view_3d_balance",
  "sv3d-5": "single_view_3d_balance",
  "fv-1": "full_report_balance",
  "fv-3": "full_report_balance",
  "fv-5": "full_report_balance",
  "fv3d-1": "full_report_3d_balance",
  "fv3d-3": "full_report_3d_balance",
  "fv3d-5": "full_report_3d_balance",
};

function getCreditsForPackId(
  packId: string,
  pack: ReturnType<typeof findRosettePack>,
): number {
  if (pack) {
    return pack.rosettes;
  }

  const suffixMatch = packId.match(/(?:^|[_-])(\d+)$/);
  return suffixMatch ? Number(suffixMatch[1]) : 0;
}

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secretKey || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await request.text();
  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    console.error("[stripe-rosettes] signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const packId = session.metadata?.packId?.trim();
  const userId = session.metadata?.userId?.trim();

  if (!packId || !userId) {
    console.error("[stripe-rosettes] missing metadata:", session.metadata);
    return NextResponse.json({ error: "Missing session metadata" }, { status: 400 });
  }

  const pack = findRosettePack(packId);
  const balanceColumn = PACK_ID_TO_BALANCE_COLUMN[packId];

  if (!balanceColumn) {
    console.error("[stripe-rosettes] unknown packId:", packId);
    return NextResponse.json({ error: "Invalid packId" }, { status: 400 });
  }

  const credits = getCreditsForPackId(packId, pack);

  if (credits <= 0) {
    console.error("[stripe-rosettes] invalid packId:", packId);
    return NextResponse.json({ error: "Invalid packId" }, { status: 400 });
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("user_tokens")
    .select(
      "single_view_balance, single_view_3d_balance, full_report_balance, full_report_3d_balance",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    console.error("[stripe-rosettes] user_tokens lookup failed:", lookupError);
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  const currentBalance = existing?.[balanceColumn] ?? 0;
  const newBalance = currentBalance + credits;

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("user_tokens")
      .update({ [balanceColumn]: newBalance })
      .eq("user_id", userId);

    if (updateError) {
      console.error("[stripe-rosettes] user_tokens update failed:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabaseAdmin.from("user_tokens").insert({
      user_id: userId,
      single_view_balance:
        balanceColumn === "single_view_balance" ? credits : 0,
      single_view_3d_balance:
        balanceColumn === "single_view_3d_balance" ? credits : 0,
      full_report_balance:
        balanceColumn === "full_report_balance" ? credits : 0,
      full_report_3d_balance:
        balanceColumn === "full_report_3d_balance" ? credits : 0,
    });

    if (insertError) {
      console.error("[stripe-rosettes] user_tokens insert failed:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const { error: transactionError } = await supabaseAdmin
    .from("token_transactions")
    .insert({
      user_id: userId,
      amount: credits,
      type: "purchase",
      description: pack?.name ?? packId,
    });

  if (transactionError) {
    console.error("[stripe-rosettes] token_transactions insert failed:", transactionError);
    return NextResponse.json({ error: transactionError.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
