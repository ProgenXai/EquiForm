import { NextResponse } from "next/server";
import Stripe from "stripe";

import { findRosettePack } from "@/lib/stripe/rosette-packs";
import { USER_FACING } from "@/lib/user-facing-errors";

type CartItem = {
  packId: string;
  quantity: number;
};

type RequestBody = {
  userId?: string;
  items?: CartItem[];
};

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!secretKey || !appUrl) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
  }

  const body = (await request.json()) as RequestBody;
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const items = Array.isArray(body.items) ? body.items : [];

  if (!userId || items.length === 0) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 400 });
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  for (const item of items) {
    const pack = findRosettePack(item.packId);
    if (!pack) {
      return NextResponse.json({ error: USER_FACING.payment }, { status: 400 });
    }
    lineItems.push({ price: pack.stripePriceId, quantity: item.quantity });
  }

  const cartItemsMetadata = JSON.stringify(
    items.map((item) => ({ packId: item.packId, quantity: item.quantity }))
  );

  try {
    const stripe = new Stripe(secretKey);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata: {
        userId,
        cartItems: cartItemsMetadata,
      },
      success_url: `${appUrl}/buy-credits?credits_success=true`,
      cancel_url: `${appUrl}/buy-credits`,
    });

    if (!session.url) {
      return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[buy-credits] stripe session failed:", error);
    return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
  }
}
