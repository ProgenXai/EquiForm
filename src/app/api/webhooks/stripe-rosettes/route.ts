import { NextResponse } from "next/server";
import Stripe from "stripe";

import { ROSETTE_PACKS } from "@/lib/stripe/rosette-packs";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

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

  const pack = ROSETTE_PACKS.find((item) => item.id === packId);

  if (!pack) {
    console.error("[stripe-rosettes] invalid packId:", packId);
    return NextResponse.json({ error: "Invalid packId" }, { status: 400 });
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("user_tokens")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    console.error("[stripe-rosettes] user_tokens lookup failed:", lookupError);
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  const newBalance = (existing?.balance ?? 0) + pack.rosettes;

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("user_tokens")
      .update({ balance: newBalance })
      .eq("user_id", userId);

    if (updateError) {
      console.error("[stripe-rosettes] user_tokens update failed:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabaseAdmin.from("user_tokens").insert({
      user_id: userId,
      balance: pack.rosettes,
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
      amount: pack.rosettes,
      type: "purchase",
      description: pack.name,
    });

  if (transactionError) {
    console.error("[stripe-rosettes] token_transactions insert failed:", transactionError);
    return NextResponse.json({ error: transactionError.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
