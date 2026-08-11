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

function sessionIdMarker(sessionId: string): string {
  return `[checkout:${sessionId}]`;
}

function logWebhook(
  level: "info" | "error",
  message: string,
  details: Record<string, unknown>,
) {
  const payload = {
    ts: new Date().toISOString(),
    ...details,
  };
  const line = `[stripe-rosettes] ${message} ${JSON.stringify(payload)}`;
  if (level === "error") {
    console.error(line);
  } else {
    console.info(line);
  }
}

async function sendFulfillmentAlert(
  session: Stripe.Checkout.Session,
  eventType: string,
  userId: string | undefined,
  message: string,
  packIds?: string[],
) {
  await sendAdminAlert(
    "Stripe payment fulfillment failed",
    [
      `What failed: ${message}`,
      `Event type: ${eventType}`,
      `Session ID: ${session.id}`,
      `Timestamp: ${new Date().toISOString()}`,
      userId ? `User ID: ${userId}` : null,
      session.customer_details?.email
        ? `User email: ${session.customer_details.email}`
        : session.customer_email
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
    logWebhook("error", "not configured", {});
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    logWebhook("error", "missing stripe-signature header", {});
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const body = await request.text();
  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWebhook("error", "signature verification failed", {
      error: message,
    });
    await sendAdminAlert(
      "Stripe webhook processing failed",
      [
        "What failed: Webhook signature verification",
        "Event type: unknown",
        `Timestamp: ${new Date().toISOString()}`,
        `Error message: ${message}`,
      ].join("\n"),
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    logWebhook("info", "ignored event type", {
      eventId: event.id,
      eventType: event.type,
    });
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId?.trim();
  const cartItems = parseCartItems(session);
  const packIds = cartItems?.map((item) => item.packId);
  const baseLog = {
    eventId: event.id,
    eventType: event.type,
    sessionId: session.id,
    userId: userId ?? null,
    packIds: packIds ?? null,
    amountTotal: session.amount_total ?? null,
    paymentStatus: session.payment_status ?? null,
    customerEmail:
      session.customer_details?.email ?? session.customer_email ?? null,
  };

  logWebhook("info", "checkout.session.completed received", baseLog);

  if (!userId || !cartItems) {
    logWebhook("error", "missing session metadata", {
      ...baseLog,
      metadata: session.metadata ?? null,
    });
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
    logWebhook("error", "invalid cart items", {
      ...baseLog,
      cartItems,
    });
    await sendFulfillmentAlert(
      session,
      event.type,
      userId,
      "Invalid pack ID or credit amount in cart items",
      packIds,
    );
    return NextResponse.json({ error: "Invalid packId" }, { status: 400 });
  }

  // Idempotency: skip if this checkout.session.id was already fulfilled.
  // Marker is stored on every purchase row for the session (one per pack line).
  const marker = sessionIdMarker(session.id);
  const { data: existingFulfillments, error: idempotencyLookupError } =
    await supabaseAdmin
      .from("token_transactions")
      .select("id")
      .eq("type", "purchase")
      .eq("user_id", userId)
      .ilike("description", `%${marker}%`)
      .limit(1);

  if (idempotencyLookupError) {
    logWebhook("error", "idempotency lookup failed", {
      ...baseLog,
      error: idempotencyLookupError.message,
    });
    await sendFulfillmentAlert(
      session,
      event.type,
      userId,
      "idempotency lookup",
      packIds,
    );
    return NextResponse.json(
      { error: idempotencyLookupError.message },
      { status: 500 },
    );
  }

  if (existingFulfillments && existingFulfillments.length > 0) {
    logWebhook("info", "duplicate checkout session — already fulfilled", baseLog);
    return NextResponse.json({ received: true, duplicate: true });
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("user_tokens")
    .select(
      "single_view_balance, single_view_3d_balance, full_report_balance, full_report_3d_balance",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    logWebhook("error", "user_tokens lookup failed", {
      ...baseLog,
      error: lookupError.message,
    });
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
      logWebhook("error", "user_tokens update failed", {
        ...baseLog,
        error: updateError.message,
      });
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
      logWebhook("error", "user_tokens insert failed", {
        ...baseLog,
        error: insertError.message,
      });
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
        description: `${line.description} ${marker}`,
      });

    if (transactionError) {
      logWebhook("error", "token_transactions insert failed", {
        ...baseLog,
        packId: line.packId,
        error: transactionError.message,
      });
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

  logWebhook("info", "credits granted successfully", {
    ...baseLog,
    creditsGranted: fulfillmentLines.map((line) => ({
      packId: line.packId,
      balanceColumn: line.balanceColumn,
      credits: line.credits,
    })),
    balancesAfter: balanceUpdates,
  });

  return NextResponse.json({ received: true });
}
