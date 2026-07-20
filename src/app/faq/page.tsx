"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import AppHamburgerMenu from "@/components/AppHamburgerMenu";

type FaqEntry = {
  id: string;
  question: string;
  answer: React.ReactNode;
};

const FAQ_ENTRIES: FaqEntry[] = [
  {
    id: "landmarks-not-detected",
    question:
      "I got an error saying landmarks couldn't be detected. What does that mean?",
    answer:
      "This usually happens when the horse is too small or zoomed-out in the photo relative to the full image frame. Try cropping the photo tighter around the horse so it fills more of the frame, then re-upload. Make sure the horse is fully visible (no cut-off legs, ears, or tail) and standing as square as possible for the most accurate results.",
  },
  {
    id: "photo-requirements",
    question: "What kind of photo should I use?",
    answer:
      "For the best results, use a photo where your horse is standing square (all four legs visible and evenly positioned), fills most of the frame, and is well-lit with a clear background. Avoid photos taken at an angle, in shadow, or where part of the horse (legs, ears, tail) is cropped out of frame.",
  },
  {
    id: "3d-model-stuck",
    question: "My 3D model isn't showing up, or seems stuck.",
    answer:
      "3D model generation can take a few minutes to process. If you navigated away before it finished, don't worry — it will still complete in the background. Check back on your My Reports page in a few minutes, and your 3D model should appear once it's ready.",
  },
  {
    id: "report-not-visible",
    question: "I ran a report, but I don't see it on My Reports/My Horses.",
    answer: (
      <>
        Try refreshing the page. If it still doesn&apos;t appear after a minute,
        log out and back in, then check again. If the issue persists,{" "}
        <Link
          href="/contact"
          className="font-medium text-accent transition hover:text-accent-hover"
        >
          contact us
        </Link>{" "}
        and we&apos;ll help sort it out.
      </>
    ),
  },
  {
    id: "missing-credit",
    question: "I paid, but I don't see my credit or report.",
    answer: (
      <>
        Payments are typically applied within a minute or two of checkout. Try
        refreshing the page. If your credit still isn&apos;t showing after a
        few minutes,{" "}
        <Link
          href="/contact"
          className="font-medium text-accent transition hover:text-accent-hover"
        >
          contact us
        </Link>{" "}
        with your order confirmation and we&apos;ll get it fixed.
      </>
    ),
  },
];

function FaqItem({ entry }: { entry: FaqEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-zinc-900/80 sm:px-6 sm:py-5"
      >
        <span className="text-base font-semibold text-white sm:text-lg">
          {entry.question}
        </span>
        <span
          className="mt-1 shrink-0 text-xl leading-none text-accent"
          aria-hidden="true"
        >
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="border-t border-zinc-800 px-5 pb-5 pt-4 text-base leading-relaxed text-zinc-300 sm:px-6 sm:pb-6">
          {entry.answer}
        </div>
      ) : null}
    </div>
  );
}

export default function FaqPage() {
  const router = useRouter();

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
        <h1 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
          Frequently Asked Questions
        </h1>
        <p className="mt-3 text-sm text-zinc-400 sm:text-base">
          Quick answers to common questions about reports, photos, and credits.
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="space-y-4">
          {FAQ_ENTRIES.map((entry) => (
            <FaqItem key={entry.id} entry={entry} />
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-zinc-400">
          Still need help?{" "}
          <Link
            href="/contact"
            className="font-medium text-accent transition hover:text-accent-hover"
          >
            Contact &amp; Feedback
          </Link>
        </p>
      </main>
    </div>
  );
}
