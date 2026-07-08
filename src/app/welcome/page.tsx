"use client";

import Image from "next/image";
import Link from "next/link";

import AppHamburgerMenu from "@/components/AppHamburgerMenu";

const SCORE_EXPLAINER_POINTS = [
  "Your overall score (out of 100) reflects how well your horse\u2019s build aligns with the rule of thirds \u2014 the same framework professional horse judges use.",
  "You also receive individual scores for balance, shoulder angle, hip angle, topline quality, and leg alignment.",
  "Scores of 85\u201395 generally indicate excellent conformation for performance horses.",
] as const;

const ACCENT_CARD_CLASS =
  "rounded-xl border border-accent/30 bg-zinc-900/70 p-6 shadow-[0_0_28px_rgba(0,212,200,0.1)] ring-1 ring-accent/20 sm:p-8";

export default function WelcomePage() {
  return (
    <div className="relative min-h-screen bg-black text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,212,200,0.09)_0%,transparent_52%),radial-gradient(ellipse_at_bottom,rgba(0,212,200,0.05)_0%,transparent_48%)]"
        aria-hidden="true"
      />

      <div className="relative">
        <AppHamburgerMenu />

        <header className="border-b border-zinc-800/80 bg-black/40 px-6 py-10 text-center backdrop-blur-sm sm:py-12">
          <div className="mx-auto max-w-3xl">
            <div className="flex justify-center">
              <Image
                src="/equiform-logo.png"
                alt="EquiForm"
                width={300}
                height={300}
                priority
                className="h-40 w-40 object-contain sm:h-52 sm:w-52"
              />
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl">
              Welcome to EquiForm!
            </h1>
            <p className="mt-4 text-sm text-zinc-400 sm:text-base">
              The most advanced AI equine conformation analysis available
            </p>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-14">
          <p className="text-center text-2xl font-semibold text-accent sm:text-3xl">
            How does your horse measure up?
          </p>

          <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-relaxed text-zinc-300 sm:text-base">
            Conformation affects soundness, performance, and resale value — but
            professional evaluations are often expensive, hard to access, or
            subjective. EquiForm gives horse owners an objective, AI-powered
            assessment using the same rule-of-thirds framework judges rely on,
            instantly and affordably.
          </p>

          <section className={`mt-10 ${ACCENT_CARD_CLASS}`}>
            <h2 className="text-xl font-semibold text-white">
              What does your score mean?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              EquiForm uses AI to evaluate your horse&apos;s conformation from
              your photos.
            </p>
            <p className="mt-4 text-sm font-medium text-zinc-200">
              Here&apos;s a breakdown:
            </p>
            <ul className="mt-3 space-y-3">
              {SCORE_EXPLAINER_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex gap-2 text-sm leading-relaxed text-zinc-300"
                >
                  <span className="shrink-0 text-accent" aria-hidden="true">
                    &bull;
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Replace this container with a video embed when the demo is ready */}
          <section
            className="mt-10"
            aria-label="EquiForm demo video"
            data-video-embed-ready="true"
          >
            <div
              className={`flex aspect-video w-full flex-col items-center justify-center ${ACCENT_CARD_CLASS} border-dashed`}
            >
              <p className="text-sm font-medium text-zinc-300">
                Demo video coming soon
              </p>
              <p className="mt-2 max-w-sm text-xs text-zinc-500">
                A walkthrough of EquiForm will appear here.
              </p>
            </div>
          </section>

          <div className="mt-12 flex justify-center">
            <Link
              href="/buy-credits"
              className="w-full max-w-sm rounded-lg bg-accent px-8 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover sm:w-auto"
            >
              Buy Report Credits
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
