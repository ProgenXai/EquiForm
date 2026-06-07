"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ReportPackageOption, ReportTier } from "@/lib/stripe/report-tiers";
import { REPORT_TIERS } from "@/lib/stripe/report-tiers";
import { createClient } from "@/lib/supabase/client";

type PurchaseTierGridProps = {
  authRedirectPath?: string;
};

function formatBundleRow(option: ReportPackageOption): string {
  return `${option.label} — ${option.priceDisplay} · Save ${option.savingsDisplay}`;
}

function TierCard({
  tier,
  loadingPriceId,
  onBuy,
}: {
  tier: ReportTier;
  loadingPriceId: string | null;
  onBuy: (option: ReportPackageOption) => void;
}) {
  const singleOption = tier.packages[0];
  const bundleOptions = tier.packages.slice(1);

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

      {singleOption ? (
        <button
          type="button"
          onClick={() => onBuy(singleOption)}
          disabled={loadingPriceId !== null}
          className="mt-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loadingPriceId === singleOption.stripePriceId
            ? "Redirecting…"
            : `Buy Now — ${singleOption.label}`}
        </button>
      ) : null}

      {bundleOptions.length > 0 ? (
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
                <button
                  type="button"
                  onClick={() => onBuy(option)}
                  disabled={loadingPriceId !== null}
                  className="shrink-0 rounded-lg border border-accent/50 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loadingPriceId === option.stripePriceId
                    ? "…"
                    : "Buy Now"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function PurchaseTierGrid({
  authRedirectPath = "/auth",
}: PurchaseTierGridProps) {
  const router = useRouter();
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        throw new Error(data.error ?? "Unable to start checkout");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start checkout");
      setLoadingPriceId(null);
    }
  }

  return (
    <>
      {error ? (
        <p className="mb-6 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        {REPORT_TIERS.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            loadingPriceId={loadingPriceId}
            onBuy={(option) => void handleBuy(option)}
          />
        ))}
      </div>
    </>
  );
}
