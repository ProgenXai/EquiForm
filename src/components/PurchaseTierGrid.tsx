"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { ReportPackageOption, ReportTier } from "@/lib/stripe/report-tiers";
import { REPORT_TIERS } from "@/lib/stripe/report-tiers";
import { findRosettePack } from "@/lib/stripe/rosette-packs";
import { createClient } from "@/lib/supabase/client";
import { formatPaymentError } from "@/lib/user-facing-errors";

type PurchaseTierGridProps = {
  authRedirectPath?: string;
  checkoutMode?: "instant" | "cart";
  singlePackOnly?: boolean;
};

type CartEntry = {
  packId: string;
  quantity: number;
  label: string;
  tierTitle: string;
  unitPriceCents: number;
};

function formatBundleRow(option: ReportPackageOption): string {
  return `${option.label} — ${option.priceDisplay} · Save ${option.savingsDisplay}`;
}

function parsePriceDisplayToCents(value: string): number | null {
  const match = value.match(/\$([\d,]+(?:\.\d{2})?)/);
  if (!match) {
    return null;
  }

  return Math.round(parseFloat(match[1]!.replace(/,/g, "")) * 100);
}

function getPackagePriceCents(
  option: ReportPackageOption,
  tier: ReportTier,
): number {
  const pack = findRosettePack(option.packId);
  if (pack && pack.price > 0) {
    return pack.price;
  }

  if (option.priceDisplay) {
    const parsed = parsePriceDisplayToCents(option.priceDisplay);
    if (parsed !== null) {
      return parsed;
    }
  }

  const parsedSingle = parsePriceDisplayToCents(tier.singlePriceDisplay);
  return parsedSingle ?? 0;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function findPackageInTiers(packId: string): {
  option: ReportPackageOption;
  tier: ReportTier;
} | null {
  for (const tier of REPORT_TIERS) {
    const option = tier.packages.find((entry) => entry.packId === packId);
    if (option) {
      return { option, tier };
    }
  }

  return null;
}

function TierCard({
  tier,
  loadingPriceId,
  onBuy,
  onAddToCart,
  cartQuantities,
  checkoutMode,
  singlePackOnly,
}: {
  tier: ReportTier;
  loadingPriceId: string | null;
  onBuy: (option: ReportPackageOption) => void;
  onAddToCart: (option: ReportPackageOption) => void;
  cartQuantities: Record<string, number>;
  checkoutMode: "instant" | "cart";
  singlePackOnly: boolean;
}) {
  const singleOption = tier.packages[0];
  const bundleOptions = tier.packages.slice(1);
  const isCartMode = checkoutMode === "cart";

  function renderActionButton(option: ReportPackageOption, compact = false) {
    const inCartQty = cartQuantities[option.packId] ?? 0;

    if (isCartMode) {
      return (
        <button
          type="button"
          onClick={() => onAddToCart(option)}
          className={
            compact
              ? "shrink-0 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20"
              : "mt-6 w-full rounded-lg border border-accent/50 bg-accent/10 px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent/20"
          }
        >
          {inCartQty > 0 ? `Add Another (${inCartQty} in cart)` : "Add to Cart"}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={() => onBuy(option)}
        disabled={loadingPriceId !== null}
        className={
          compact
            ? "shrink-0 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
            : "mt-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        }
      >
        {loadingPriceId === option.stripePriceId
          ? compact
            ? "…"
            : "Redirecting…"
          : compact
            ? "Buy Now"
            : `Buy Now — ${option.label}`}
      </button>
    );
  }

  return (
    <div
      className={`relative flex flex-col rounded-xl border bg-zinc-900/60 p-6 ${
        tier.highlighted
          ? "border-accent ring-1 ring-accent/30"
          : "border-zinc-800"
      }`}
    >
      {tier.highlighted ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
          Most Popular
        </span>
      ) : null}

      <h2 className="text-lg font-semibold text-white">{tier.title}</h2>
      <p className="mt-3 text-3xl font-bold text-accent">
        {tier.singlePriceDisplay}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">
        {tier.description}
      </p>

      {singleOption ? renderActionButton(singleOption) : null}

      {!singlePackOnly && bundleOptions.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          {bundleOptions.map((option) => (
            <div
              key={option.packId}
              className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {formatBundleRow(option)}
                  </p>
                </div>
                {renderActionButton(option, true)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CartSummary({
  cartEntries,
  totalCents,
  checkoutLoading,
  onRemove,
  onCheckout,
}: {
  cartEntries: CartEntry[];
  totalCents: number;
  checkoutLoading: boolean;
  onRemove: (packId: string) => void;
  onCheckout: () => void;
}) {
  return (
    <aside className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 lg:sticky lg:top-6">
      <h2 className="text-lg font-semibold text-white">Your Cart</h2>

      {cartEntries.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">
          Add report packages to your cart to checkout in one payment.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {cartEntries.map((entry) => (
              <li
                key={entry.packId}
                className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">
                      {entry.tierTitle}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">{entry.label}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Qty {entry.quantity} · {formatUsd(entry.unitPriceCents)} each
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-accent">
                      {formatUsd(entry.unitPriceCents * entry.quantity)}
                    </p>
                    <button
                      type="button"
                      onClick={() => onRemove(entry.packId)}
                      className="mt-2 text-xs font-medium text-zinc-400 transition hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-4">
            <span className="text-sm font-medium text-zinc-300">Total</span>
            <span className="text-lg font-bold text-accent">
              {formatUsd(totalCents)}
            </span>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onCheckout}
        disabled={cartEntries.length === 0 || checkoutLoading}
        className="mt-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {checkoutLoading ? "Redirecting to checkout…" : "Checkout"}
      </button>
    </aside>
  );
}

export default function PurchaseTierGrid({
  authRedirectPath = "/auth",
  checkoutMode = "instant",
  singlePackOnly = false,
}: PurchaseTierGridProps) {
  const router = useRouter();
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});

  const cartEntries = useMemo(() => {
    return Object.entries(cart)
      .map(([packId, quantity]) => {
        const match = findPackageInTiers(packId);
        if (!match || quantity <= 0) {
          return null;
        }

        return {
          packId,
          quantity,
          label: match.option.label,
          tierTitle: match.tier.title,
          unitPriceCents: getPackagePriceCents(match.option, match.tier),
        } satisfies CartEntry;
      })
      .filter((entry): entry is CartEntry => entry !== null);
  }, [cart]);

  const cartTotalCents = useMemo(
    () =>
      cartEntries.reduce(
        (sum, entry) => sum + entry.unitPriceCents * entry.quantity,
        0,
      ),
    [cartEntries],
  );

  async function handleBuy(option: ReportPackageOption) {
    setError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      router.push(authRedirectPath);
      return;
    }

    setLoadingPriceId(option.stripePriceId);

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: option.stripePriceId,
          userId: session.user.id,
        }),
      });

      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(formatPaymentError(data.error));
      }

      window.location.href = data.url;
    } catch (err) {
      setError(formatPaymentError(err));
      setLoadingPriceId(null);
    }
  }

  function handleAddToCart(option: ReportPackageOption) {
    setError(null);
    setCart((current) => ({
      ...current,
      [option.packId]: (current[option.packId] ?? 0) + 1,
    }));
  }

  function handleRemoveFromCart(packId: string) {
    setCart((current) => {
      const next = { ...current };
      delete next[packId];
      return next;
    });
  }

  async function handleCartCheckout() {
    setError(null);

    if (cartEntries.length === 0) {
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      router.push(authRedirectPath);
      return;
    }

    setCheckoutLoading(true);

    try {
      const response = await fetch("/api/buy-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          items: cartEntries.map((entry) => ({
            packId: entry.packId,
            quantity: entry.quantity,
          })),
        }),
      });

      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(formatPaymentError(data.error));
      }

      window.location.href = data.url;
    } catch (err) {
      setError(formatPaymentError(err));
      setCheckoutLoading(false);
    }
  }

  const tierCards = (
    <div className="grid gap-6 sm:grid-cols-2">
      {REPORT_TIERS.map((tier) => (
        <TierCard
          key={tier.id}
          tier={tier}
          loadingPriceId={loadingPriceId}
          onBuy={(option) => void handleBuy(option)}
          onAddToCart={handleAddToCart}
          cartQuantities={cart}
          checkoutMode={checkoutMode}
          singlePackOnly={singlePackOnly}
        />
      ))}
    </div>
  );

  return (
    <>
      {error ? (
        <p className="mb-6 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {checkoutMode === "cart" ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          {tierCards}
          <CartSummary
            cartEntries={cartEntries}
            totalCents={cartTotalCents}
            checkoutLoading={checkoutLoading}
            onRemove={handleRemoveFromCart}
            onCheckout={() => void handleCartCheckout()}
          />
        </div>
      ) : (
        tierCards
      )}
    </>
  );
}
