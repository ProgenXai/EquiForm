import { NextResponse } from "next/server";
import Stripe from "stripe";

import { findRosettePack } from "@/lib/stripe/rosette-packs";
import { USER_FACING } from "@/lib/user-facing-errors";

type CartLineItemInput = {
  packId?: string;
  quantity?: number;
};

type BuyCreditsBody = {
  packId?: string;
  userId?: string;
  items?: CartLineItemInput[];
};

type NormalizedCartItem = {
  packId: string;
  quantity: number;
};

function normalizeCartItems(body: BuyCreditsBody): NormalizedCartItem[] | null {
  if (Array.isArray(body.items) && body.items.length > 0) {
    const merged = new Map<string, number>();

    for (const item of body.items) {
      const packId = typeof item.packId === "string" ? item.packId.trim() : "";
      const quantity =
        typeof item.quantity === "number" && Number.isFinite(item.quantity)
          ? Math.floor(item.quantity)
          : 1;

      if (!packId || quantity <= 0) {
        continue;
      }

      merged.set(packId, (merged.get(packId) ?? 0) + quantity);
    }

    const items = Array.from(merged.entries()).map(([packId, quantity]) => ({
      packId,
      quantity,
    }));

    return items.length > 0 ? items : null;
  }

  const packId = typeof body.packId === "string" ? body.packId.trim() : "";
  if (packId) {
    return [{ packId, quantity: 1 }];
  }

  return null;
}

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!secretKey) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
  }

  if (!appUrl) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
  }

  const body = (await request.json()) as BuyCreditsBody;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const items = normalizeCartItems(body);

  if (!userId) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 400 });
  }

  if (!items) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 400 });
  }

  const lineItems: { price: string; quantity: number }[] = [];

  for (const item of items) {
    const pack = findRosettePack(item.packId);

    if (!pack) {
      return NextResponse.json({ error: USER_FACING.payment }, { status: 400 });
    }

    lineItems.push({
      price: pack.stripePriceId,
      quantity: item.quantity,
    });
  }

  try {
    const stripe = new Stripe(secretKey);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata: {
        userId,
        cartItems: JSON.stringify(items),
      },
      success_url: `${appUrl}/buy-credits?credits_success=true`,
      cancel_url: `${appUrl}/buy-credits`,
    });

    if (!session.url) {
      return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[buy-credits] failed:", error);
    return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
  }
}
