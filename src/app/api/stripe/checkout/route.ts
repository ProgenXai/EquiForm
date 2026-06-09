import { NextResponse } from "next/server";
import Stripe from "stripe";

import { findRosettePackByPriceId } from "@/lib/stripe/rosette-packs";
import { USER_FACING } from "@/lib/user-facing-errors";

type CheckoutBody = {
  priceId?: string;
  userId?: string;
};

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!secretKey) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
  }

  if (!appUrl) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
  }

  const body = (await request.json()) as CheckoutBody;
  const priceId = typeof body.priceId === "string" ? body.priceId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (!priceId) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 400 });
  }

  const pack = findRosettePackByPriceId(priceId);

  if (!pack) {
    return NextResponse.json({ error: USER_FACING.payment }, { status: 400 });
  }

  try {
    const stripe = new Stripe(secretKey);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: pack.stripePriceId,
          quantity: 1,
        },
      ],
      metadata: {
        packId: pack.id,
        userId,
        reportType: pack.reportType,
      },
      success_url: `${appUrl}/buy-credits?credits_success=true`,
      cancel_url: `${appUrl}/buy-credits`,
    });

    if (!session.url) {
      return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/checkout] failed:", error);
    return NextResponse.json({ error: USER_FACING.payment }, { status: 500 });
  }
}
