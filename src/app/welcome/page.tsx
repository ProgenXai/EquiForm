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
  "rounded-xl border-2 border-accent bg-zinc-900/70 p-6 sm:p-8";

export default function WelcomePage() {
  return (
    <div className="relative min-h-screen bg-black font-sans text-zinc-100 antialiased">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,212,200,0.09)_0%,transparent_52%),radial-gradient(ellipse_at_bottom,rgba(0,212,200,0.05)_0%,transparent_48%)]"
        aria-hidden="true"
      />

      <div className="relative">
        <AppHamburgerMenu />

        <header className="bg-black/40 px-6 pb-3 pt-4 text-center backdrop-blur-sm sm:pb-4 sm:pt-5">
          <div className="mx-auto max-w-4xl">
            <div className="flex justify-center">
              <Image
                src="/equiform-logo.png"
                alt="EquiForm"
                width={300}
                height={300}
                priority
                className="h-48 w-48 object-contain sm:h-64 sm:w-64"
              />
            </div>
            <div className="relative mx-auto mt-6 max-w-3xl">
              <div
                className="pointer-events-none absolute inset-0 overflow-visible"
                aria-hidden="true"
              >
                <div className="absolute left-1/2 top-1/2 h-40 w-[min(100%,36rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(0,212,200,0.28)] blur-[96px] sm:h-52 sm:blur-[120px] md:h-56" />
              </div>
              <h1 className="relative text-5xl font-bold leading-tight tracking-tight text-white sm:text-6xl md:text-7xl">
                Welcome to EquiForm!
              </h1>
            </div>
            <p className="mt-4 text-base text-zinc-300 sm:text-lg">
              The most advanced AI equine conformation analysis available
            </p>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 pb-12 pt-3 sm:px-6 sm:pb-14 sm:pt-4">
          <p className="text-center text-2xl font-semibold text-accent sm:text-3xl">
            How does your horse measure up?
          </p>

          <p className="mx-auto mt-6 max-w-2xl text-center text-base leading-relaxed text-zinc-200 sm:text-lg">
            Conformation affects soundness, performance, breeding, and resale
            value — but professional evaluations are often expensive, hard to
            access, or subjective. EquiForm gives horse owners an objective,
            AI-powered assessment using the same rule-of-thirds framework judges
            rely on, instantly and affordably.
          </p>

          <section className={`mt-10 ${ACCENT_CARD_CLASS}`}>
            <h2 className="text-center text-xl font-semibold text-white">
              What does your score mean?
            </h2>
            <p className="mt-3 text-center text-base leading-relaxed text-zinc-200 sm:text-lg">
              EquiForm uses AI to evaluate your horse&apos;s conformation from
              your photos.
            </p>
            <p className="mt-4 text-center text-base font-medium text-zinc-100 sm:text-lg">
              Here&apos;s a breakdown:
            </p>
            <ul className="mt-3 space-y-3">
              {SCORE_EXPLAINER_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex gap-2 text-base leading-relaxed text-zinc-200 sm:text-lg"
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
              <p className="text-base font-medium text-zinc-200 sm:text-lg">
                Demo video coming soon
              </p>
              <p className="mt-2 max-w-sm text-sm text-zinc-400">
                A walkthrough of EquiForm will appear here.
              </p>
            </div>
          </section>

          <div className="mx-auto mt-12 grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <Link
              href="/examples"
              className="rounded-lg bg-accent px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              See Our Photo Guidelines
            </Link>
            <Link
              href="/buy-credits"
              className="rounded-lg bg-accent px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Buy Report Credits
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
