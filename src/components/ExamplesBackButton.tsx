"use client";

import { useRouter } from "next/navigation";

export default function ExamplesBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="rounded-lg border border-zinc-700 bg-transparent px-6 py-3 text-center text-sm font-semibold text-zinc-400 transition hover:bg-zinc-800"
    >
      ← Back
    </button>
  );
}
