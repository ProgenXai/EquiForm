"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { ROSETTE_PACKS } from "@/lib/stripe/rosette-packs";

export default function BuyRosettesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
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
        setBalance(null);
        return;
      }

      setUserId(session.user.id);

      const { data } = await supabase
        .from("user_tokens")
        .select("balance")
        .eq("user_id", session.user.id)
        .maybeSingle();

      setBalance(data?.balance ?? 0);
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
      <header className="border-b border-zinc-800 bg-black px-6 py-8 text-center">
        <div className="flex justify-center">
          <Image
            src="/equiform-logo.png"
            alt="EquiForm"
            width={300}
            height={300}
            priority
            className="object-contain"
          />
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          AI-powered equine conformation analysis from a single side profile photo
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white">Buy Rosettes</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Purchase packs of reports for your horse conformation analyses
          </p>
          {userId !== null && balance !== null ? (
            <p className="mt-4 inline-block rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
              Your balance: {balance} Rosette{balance === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="mb-6 text-center text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ROSETTE_PACKS.map((pack) => {
            const isPopular = pack.id === "ten";

            return (
              <div
                key={pack.id}
                className={`relative flex flex-col rounded-xl border bg-zinc-900/60 p-6 ${
                  isPopular ? "border-accent" : "border-zinc-800"
                }`}
              >
                {isPopular ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                ) : null}

                <h2 className="text-lg font-semibold text-white">{pack.name}</h2>
                <p className="mt-2 text-3xl font-bold text-accent">{pack.rosettes}</p>
                <p className="text-xs text-zinc-500">Rosettes</p>

                <div className="mt-4 flex-1 space-y-1">
                  <p className="text-xl font-semibold text-zinc-100">{pack.priceDisplay}</p>
                  <p className="text-sm text-zinc-400">{pack.perReport}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleBuyNow(pack.id)}
                  disabled={loadingPackId !== null}
                  className="mt-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loadingPackId === pack.id ? "Redirecting…" : "Buy Now"}
                </button>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
