"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import PurchaseTierGrid from "@/components/PurchaseTierGrid";
import AppHamburgerMenu from "@/components/AppHamburgerMenu";
import { createClient } from "@/lib/supabase/client";

export default function BuyRosettesPage() {
  const router = useRouter();
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("credits_success") !== "true") return;

    async function handlePurchaseSuccess() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      window.history.replaceState({}, "", "/buy-credits");

      if (!session?.user) {
        router.replace("/analyze");
        return;
      }

      const { count, error } = await supabase
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id);

      if (error || (count ?? 0) > 0) {
        router.replace("/analyze");
        return;
      }

      if (localStorage.getItem("equiform_welcome_seen") === "true") {
        router.replace("/analyze");
        return;
      }

      localStorage.setItem("equiform_welcome_seen", "true");
      setShowWelcomeModal(true);
    }

    void handlePurchaseSuccess();
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />
      <button
        type="button"
        onClick={() => router.back()}
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

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold text-white">
            Choose Your Report
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Select the analysis package that fits your needs
          </p>
        </div>

        <PurchaseTierGrid authRedirectPath="/auth" checkoutMode="cart" />
      </main>

      {showWelcomeModal ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-white">
              Welcome to EquiForm!
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              For best results, visit our Photo Guide to see what makes a
              great conformation photo before you analyze your first horse.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => router.push("/examples")}
                className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                See Photo Guide
              </button>
              <button
                type="button"
                onClick={() => router.push("/analyze")}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800"
              >
                Skip, Go Analyze
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
