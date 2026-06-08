"use client";

import Image from "next/image";
import Link from "next/link";

import AppHamburgerMenu from "@/components/AppHamburgerMenu";

const STEPS = [
  {
    number: 1,
    icon: "📸",
    title: "Take a great photo or photos",
    image: "/onboarding/step1-examples.png",
    imageAlt: "EquiForm photo examples",
    description:
      "Check our Examples page for photo guidelines to get the best results. Great photos = great reports.",
  },
  {
    number: 2,
    icon: "🐴",
    title: "Upload & analyze",
    image: "/onboarding/step2-analyze.png",
    imageAlt: "EquiForm analyze page",
    description:
      "Upload your photo(s), fill in your horse's details, and let our AI do the work.",
  },
  {
    number: 3,
    icon: "📊",
    title: "Get your full report",
    image: "/onboarding/step3-report.png",
    imageAlt: "EquiForm sample report",
    description:
      "Receive detailed conformation scores and analysis for every view.",
    note:
      "⚠️ Added a 3D model? It takes a few extra minutes to generate — don't close the page!",
    caption:
      "This is just the first page — your full report includes detailed written analysis for every view.",
  },
] as const;

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />

      <header className="border-b border-zinc-800 bg-black px-6 py-8 text-center sm:py-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Welcome to EquiForm!
          </h1>
          <p className="mt-3 text-sm text-zinc-400 sm:text-base">
            The most advanced AI equine conformation analysis available
          </p>
          <p className="mt-2 text-lg font-semibold text-accent">
            How does your horse measure up?
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="space-y-10">
          {STEPS.map((step) => (
            <section
              key={step.number}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8"
            >
              <h2 className="text-xl font-semibold text-white">
                Step {step.number} — {step.icon} {step.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                {step.description}
              </p>
              {"note" in step && step.note ? (
                <p className="mt-3 rounded-lg border border-yellow-600/50 bg-yellow-400/10 px-4 py-3 text-sm font-medium text-yellow-200">
                  {step.note}
                </p>
              ) : null}
              <div className="mt-5 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                <Image
                  src={step.image}
                  alt={step.imageAlt}
                  width={1200}
                  height={800}
                  className="h-auto w-full object-contain"
                />
              </div>
              {"caption" in step && step.caption ? (
                <p className="mt-3 text-xs text-zinc-500">{step.caption}</p>
              ) : null}
            </section>
          ))}
        </div>

        <section className="mt-12 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
          <h2 className="text-center text-2xl font-semibold text-white">
            Sample Report
          </h2>
          <div className="mt-5 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            <Image
              src="/onboarding/step3-report.png"
              alt="EquiForm sample report preview"
              width={1400}
              height={1000}
              className="h-auto w-full object-contain"
            />
          </div>
          <p className="mt-3 text-center text-xs text-zinc-500">
            This is just the first page — your full report includes detailed
            written analysis for every view.
          </p>
        </section>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link
            href="/examples"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-8 py-3 text-center text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800 sm:w-auto"
          >
            See Examples
          </Link>
          <Link
            href="/buy-credits"
            className="w-full rounded-lg bg-accent px-8 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover sm:w-auto"
          >
            I&apos;m Ready, Buy Credits
          </Link>
        </div>
      </main>
    </div>
  );
}
