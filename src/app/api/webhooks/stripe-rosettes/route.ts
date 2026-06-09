import { NextResponse } from "next/server";
import Stripe from "stripe";

import { sendAdminAlert } from "@/lib/email/admin-alerts";
import { findRosettePack } from "@/lib/stripe/rosette-packs";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type BalanceColumn =
  | "single_view_balance"
  | "single_view_3d_balance"
  | "full_report_balance"
  | "full_report_3d_balance";

type CartItem = {
  packId: string;
  quantity: number;
};

type FulfillmentLine = {
  packId: string;
  balanceColumn: BalanceColumn;
  credits: number;
  description: string;
};

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

function parseCartItems(session: Stripe.Checkout.Session): CartItem[] | null {
  const cartItemsRaw = session.metadata?.cartItems?.trim();

  if (cartItemsRaw) {
    try {
      const parsed = JSON.parse(cartItemsRaw) as unknown;

      if (!Array.isArray(parsed)) {
        return null;
      }

      const items: CartItem[] = [];

      for (const value of parsed) {
        if (!value || typeof value !== "object") {
          continue;
        }

        const record = value as { packId?: unknown; quantity?: unknown };
        const packId =
          typeof record.packId === "string" ? record.packId.trim() : "";
        const quantity =
          typeof record.quantity === "number" && Number.isFinite(record.quantity)
            ? Math.floor(record.quantity)
            : 1;

        if (!packId || quantity <= 0) {
          continue;
        }

        items.push({ packId, quantity });
      }

      return items.length > 0 ? items : null;
    } catch {
      return null;
    }
  }

  const packId = session.metadata?.packId?.trim();
  if (packId) {
    return [{ packId, quantity: 1 }];
  }

  return null;
}

function buildFulfillmentLines(items: CartItem[]): FulfillmentLine[] | null {
  const lines: FulfillmentLine[] = [];

  for (const item of items) {
    const pack = findRosettePack(item.packId);
    const balanceColumn = PACK_ID_TO_BALANCE_COLUMN[item.packId];
    const creditsPerPack = getCreditsForPackId(item.packId, pack);

    if (!balanceColumn || creditsPerPack <= 0) {
      return null;
    }

    lines.push({
      packId: item.packId,
      balanceColumn,
      credits: creditsPerPack * item.quantity,
      description: pack?.name ?? item.packId,
    });
  }

  return lines.length > 0 ? lines : null;
}

async function sendFulfillmentAlert(
  session: Stripe.Checkout.Session,
  eventType: string,
  userId: string | undefined,
  message: string,
  packIds?: string[],
) {
  void sendAdminAlert(
    "Stripe payment fulfillment failed",
    [
      `What failed: ${message}`,
      `Event type: ${eventType}`,
      userId ? `User ID: ${userId}` : null,
      session.customer_email
        ? `User email: ${session.customer_email}`
        : null,
      packIds?.length ? `Pack IDs: ${packIds.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
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
    const message = error instanceof Error ? error.message : String(error);
    console.error("[stripe-rosettes] signature verification failed:", error);
    void sendAdminAlert(
      "Stripe webhook processing failed",
      [
        "What failed: Webhook signature verification",
        "Event type: unknown",
        `Error message: ${message}`,
      ].join("\n"),
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId?.trim();
  const cartItems = parseCartItems(session);
  const packIds = cartItems?.map((item) => item.packId);

  if (!userId || !cartItems) {
    console.error("[stripe-rosettes] missing metadata:", session.metadata);
    await sendFulfillmentAlert(
      session,
      event.type,
      userId,
      "Missing checkout session metadata",
    );
    return NextResponse.json({ error: "Missing session metadata" }, { status: 400 });
  }

  const fulfillmentLines = buildFulfillmentLines(cartItems);

  if (!fulfillmentLines) {
    console.error("[stripe-rosettes] invalid cart items:", cartItems);
    await sendFulfillmentAlert(
      session,
      event.type,
      userId,
      "Invalid pack ID or credit amount in cart items",
      packIds,
    );
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
    await sendFulfillmentAlert(
      session,
      event.type,
      userId,
      "user_tokens lookup",
      packIds,
    );
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  const balanceUpdates: Record<BalanceColumn, number> = {
    single_view_balance: existing?.single_view_balance ?? 0,
    single_view_3d_balance: existing?.single_view_3d_balance ?? 0,
    full_report_balance: existing?.full_report_balance ?? 0,
    full_report_3d_balance: existing?.full_report_3d_balance ?? 0,
  };

  for (const line of fulfillmentLines) {
    balanceUpdates[line.balanceColumn] += line.credits;
  }

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("user_tokens")
      .update(balanceUpdates)
      .eq("user_id", userId);

    if (updateError) {
      console.error("[stripe-rosettes] user_tokens update failed:", updateError);
      await sendFulfillmentAlert(
        session,
        event.type,
        userId,
        "user_tokens balance update",
        packIds,
      );
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabaseAdmin.from("user_tokens").insert({
      user_id: userId,
      ...balanceUpdates,
    });

    if (insertError) {
      console.error("[stripe-rosettes] user_tokens insert failed:", insertError);
      await sendFulfillmentAlert(
        session,
        event.type,
        userId,
        "user_tokens insert",
        packIds,
      );
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  for (const line of fulfillmentLines) {
    const { error: transactionError } = await supabaseAdmin
      .from("token_transactions")
      .insert({
        user_id: userId,
        amount: line.credits,
        type: "purchase",
        description: line.description,
      });

    if (transactionError) {
      console.error(
        "[stripe-rosettes] token_transactions insert failed:",
        transactionError,
      );
      await sendFulfillmentAlert(
        session,
        event.type,
        userId,
        "token_transactions insert",
        packIds,
      );
      return NextResponse.json(
        { error: transactionError.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ received: true });
}
