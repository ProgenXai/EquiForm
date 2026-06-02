"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  FULL_REPORT_PACKS,
  SINGLE_VIEW_PACKS,
  type RosettePack,
} from "@/lib/stripe/rosette-packs";
import { createClient } from "@/lib/supabase/client";

type BalanceResponse = {
  single_view_balance?: number;
  full_report_balance?: number;
};

function PackCard({
  pack,
  loadingPackId,
  onBuy,
  highlight,
}: {
  pack: RosettePack;
  loadingPackId: string | null;
  onBuy: (packId: string) => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-xl border bg-zinc-900/60 p-6 ${
        highlight ? "border-accent" : "border-zinc-800"
      }`}
    >
      {highlight ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
          Best Value
        </span>
      ) : null}

      <p className="mt-1 text-3xl font-bold text-accent">
        {pack.rosettes}
      </p>
      <p className="text-xs text-zinc-500">
        report{pack.rosettes === 1 ? "" : "s"}
      </p>

      <div className="mt-4 flex-1 space-y-1">
        <p className="text-xl font-semibold text-zinc-100">{pack.priceDisplay}</p>
        <p className="text-sm text-zinc-400">{pack.perReport}</p>
      </div>

      <button
        type="button"
        onClick={() => onBuy(pack.id)}
        disabled={loadingPackId !== null}
        className="mt-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loadingPackId === pack.id ? "Redirecting…" : "Buy Now"}
      </button>
    </div>
  );
}

function PackSection({
  title,
  subtext,
  balance,
  balanceLabel,
  packs,
  loadingPackId,
  onBuy,
  highlightPackId,
}: {
  title: string;
  subtext: string;
  balance: number | null;
  balanceLabel: string;
  packs: RosettePack[];
  loadingPackId: string | null;
  onBuy: (packId: string) => void;
  highlightPackId?: string;
}) {
  return (
    <section className="mb-14">
      <div className="mb-6 text-center sm:text-left">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm text-zinc-400">{subtext}</p>
        {balance !== null ? (
          <p className="mt-4 inline-block rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
            Your balance: {balance} {balanceLabel}
            {balance === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {packs.map((pack) => (
          <PackCard
            key={pack.id}
            pack={pack}
            loadingPackId={loadingPackId}
            onBuy={onBuy}
            highlight={pack.id === highlightPackId}
          />
        ))}
      </div>
    </section>
  );
}

export default function BuyRosettesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [singleViewBalance, setSingleViewBalance] = useState<number | null>(null);
  const [fullReportBalance, setFullReportBalance] = useState<number | null>(null);
  const [loadingPackId, setLoadingPackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUserAndBalance() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setUserId(null);
        setSingleViewBalance(null);
        setFullReportBalance(null);
        return;
      }

      setUserId(session.user.id);

      const balanceResponse = await fetch("/api/get-balance", {
        headers: {
          Authorization: `Bearer ${session.access_token ?? ""}`,
        },
      });

      const balanceData = (await balanceResponse.json()) as BalanceResponse;
      setSingleViewBalance(balanceData.single_view_balance ?? 0);
      setFullReportBalance(balanceData.full_report_balance ?? 0);
    }

    void loadUserAndBalance();
  }, []);

  async function handleBuyNow(packId: string) {
    setError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      router.push("/auth");
      return;
    }

    setLoadingPackId(packId);

    try {
      const response = await fetch("/api/buy-rosettes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packId,
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
      setLoadingPackId(null);
    }
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <button
        type="button"
        onClick={() => router.push("/analyze")}
        className="px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        ← Back
      </button>
      <header className="border-b border-zinc-800 bg-black px-6 py-4 text-center sm:py-8">
        <div className="flex justify-center">
          <Image
            src="/equiform-logo.png"
            alt="EquiForm"
            width={300}
            height={300}
            priority
            className="h-52 w-52 object-contain sm:h-[300px] sm:w-[300px]"
          />
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          The most advanced AI equine conformation analysis available
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold text-white">Buy Report Credits</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Purchase single view or full report credits for your horse
            conformation analyses
          </p>
          {!userId ? (
            <p className="mt-4 text-sm text-zinc-500">
              Sign in to see your balances and purchase credits
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="mb-6 text-center text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <PackSection
          title="Single View Reports"
          subtext="Analyze one photo at a time — left side, right side, front, or hind"
          balance={singleViewBalance}
          balanceLabel="single view credit"
          packs={SINGLE_VIEW_PACKS}
          loadingPackId={loadingPackId}
          onBuy={(packId) => void handleBuyNow(packId)}
          highlightPackId="single-5"
        />

        <PackSection
          title="Full Reports"
          subtext="4 views + 3D reconstruction — the complete conformation analysis"
          balance={fullReportBalance}
          balanceLabel="full report credit"
          packs={FULL_REPORT_PACKS}
          loadingPackId={loadingPackId}
          onBuy={(packId) => void handleBuyNow(packId)}
          highlightPackId="full-3"
        />
      </main>
    </div>
  );
}
