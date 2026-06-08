import { NextResponse } from "next/server";
import Stripe from "stripe";

import { findRosettePack } from "@/lib/stripe/rosette-packs";

type BuyRosettesBody = {
  packId?: string;
  userId?: string;
};

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!secretKey) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  if (!appUrl) {
    return NextResponse.json({ error: "App URL is not configured" }, { status: 500 });
  }

  const body = (await request.json()) as BuyRosettesBody;
  const packId = typeof body.packId === "string" ? body.packId.trim() : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";

  if (!packId) {
    return NextResponse.json({ error: "packId is required" }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const pack = findRosettePack(packId);

  if (!pack) {
    return NextResponse.json({ error: "Invalid packId" }, { status: 400 });
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
      cancel_url: `${appUrl}/analyze`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[buy-rosettes] failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create checkout session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
