"use client";

import { useRouter } from "next/navigation";

export default function ExamplesBackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
    >
      ← Back
    </button>
  );
}
