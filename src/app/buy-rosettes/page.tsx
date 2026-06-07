"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

type PurchaseTier = {
  id: string;
  title: string;
  price: string;
  description: string;
  highlighted?: boolean;
};

const PURCHASE_TIERS: PurchaseTier[] = [
  {
    id: "single-view",
    title: "Single View Report",
    price: "$10",
    description:
      "One side profile photo, AI conformation analysis with scores and overlay",
  },
  {
    id: "single-view-3d",
    title: "Single View + 3D Model",
    price: "$18",
    description:
      "One side profile photo, AI conformation analysis plus interactive 3D model",
  },
  {
    id: "four-view",
    title: "Four-View Report",
    price: "$20",
    description:
      "Four photos, complete conformation analysis with scores, overlays, and detailed report",
  },
  {
    id: "four-view-3d",
    title: "Four-View + 3D Model",
    price: "$30",
    description:
      "Four photos, complete analysis plus interactive 3D model you can rotate and explore",
    highlighted: true,
  },
];

function TierCard({ tier }: { tier: PurchaseTier }) {
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
      <p className="mt-3 text-3xl font-bold text-accent">{tier.price}</p>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-400">
        {tier.description}
      </p>

      <button
        type="button"
        className="mt-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
      >
        Buy Now
      </button>
    </div>
  );
}

export default function BuyRosettesPage() {
  const router = useRouter();

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

      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold text-white">
            Choose Your Report
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Select the analysis package that fits your needs
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {PURCHASE_TIERS.map((tier) => (
            <TierCard key={tier.id} tier={tier} />
          ))}
        </div>
      </main>
    </div>
  );
}
