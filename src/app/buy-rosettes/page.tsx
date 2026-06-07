"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

import PurchaseTierGrid from "@/components/PurchaseTierGrid";
import AppHamburgerMenu from "@/components/AppHamburgerMenu";

export default function BuyRosettesPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />
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

      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold text-white">
            Choose Your Report
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Select the analysis package that fits your needs
          </p>
        </div>

        <PurchaseTierGrid authRedirectPath="/auth" />
      </main>
    </div>
  );
}
