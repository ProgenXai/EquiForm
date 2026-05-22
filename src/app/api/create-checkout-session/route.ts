import { NextResponse } from "next/server";
import Stripe from "stripe";

type CreateCheckoutBody = {
  email?: string;
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

  const body = (await request.json()) as CreateCheckoutBody;
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!email.includes("@") || !email.includes(".")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  try {
    const stripe = new Stripe(secretKey);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: 500,
            product_data: {
              name: "EquiForm Horse Conformation Analysis",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/analyze?success=true`,
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
    console.error("[create-checkout-session] failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to create checkout session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
