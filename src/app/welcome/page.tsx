"use client";

import Link from "next/link";

import AppHamburgerMenu from "@/components/AppHamburgerMenu";

const SCORE_EXPLAINER_POINTS = [
  "Your overall score (out of 100) reflects how well your horse\u2019s build aligns with the rule of thirds \u2014 the same framework professional horse judges use.",
  "You also receive individual scores for balance, shoulder angle, hip angle, topline quality, and leg alignment.",
  "Scores of 85\u201395 generally indicate excellent conformation for performance horses.",
] as const;

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />

      <header className="border-b border-zinc-800 bg-black px-6 py-8 text-center sm:py-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl">
            Welcome to EquiForm!
          </h1>
          <p className="mt-3 text-sm text-zinc-400 sm:text-base">
            The most advanced AI equine conformation analysis available
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-white">
            What does your score mean?
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            EquiForm uses AI to evaluate your horse&apos;s conformation from your
            photos. Here&apos;s how to read your results:
          </p>
          <ul className="mt-4 space-y-3">
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
          className="mt-8"
          aria-label="EquiForm demo video"
          data-video-embed-ready="true"
        >
          <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-950/60 px-6 text-center">
            <p className="text-sm font-medium text-zinc-400">
              Demo video coming soon
            </p>
            <p className="mt-2 max-w-sm text-xs text-zinc-500">
              A walkthrough of EquiForm will appear here.
            </p>
          </div>
        </section>

        <div className="mt-10 flex justify-center">
          <Link
            href="/buy-credits"
            className="w-full max-w-sm rounded-lg bg-accent px-8 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover sm:w-auto"
          >
            Buy Report Credits
          </Link>
        </div>
      </main>
    </div>
  );
}
