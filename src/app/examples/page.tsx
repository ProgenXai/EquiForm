import Image from "next/image";
import Link from "next/link";

const GOOD_EXAMPLES = ["good-1.jpg", "good-2.jpg", "good-3.jpg", "good-4.jpg"] as const;
const BAD_EXAMPLES = ["bad-1.jpg", "bad-2.jpg", "bad-3.jpg", "bad-4.jpg"] as const;

const GUIDELINES = [
  "Full side profile required — the horse must be fully visible from head to hoof, standing squarely on level ground, facing left or right. Angled, 3/4, or front-facing photos will not work.",
  "One horse, no obstructions — only one horse in the frame, with no people, fences, gates, or objects blocking any part of the body. Legs, shoulders, and hindquarters must be fully visible.",
  "Horse must be standing still and square — no motion, no cocked legs, no stretched halter poses, no camped-out stance. All four feet should be planted naturally on the ground.",
  "Good lighting and contrast — the horse must be clearly visible against the background. Avoid dark horses in dark settings, heavy shadows across the body, or overexposed/washed-out photos.",
  "No text or graphics overlaid on the horse — watermarks, logos, or graphics printed directly over the horse's body will confuse the analysis. Text in the background or around the horse is fine.",
  "Photo quality — image must be in focus, reasonably high resolution, and not a video screenshot. Blurry, pixelated, or heavily compressed photos will produce poor results.",
];

export default function ExamplesPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
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
          AI-powered equine conformation analysis from a single side profile photo
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold text-white">Photo Guidelines</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Great reports start with great photos. Here&apos;s what works and what
            doesn&apos;t.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-lg font-semibold text-green-400">Good Examples</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {GOOD_EXAMPLES.map((filename, index) => (
                <div
                  key={filename}
                  className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
                >
                  <Image
                    src={`/examples/${filename}`}
                    alt={`Good example ${index + 1}`}
                    width={400}
                    height={300}
                    className="h-36 w-full object-cover sm:h-44"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-lg font-semibold text-red-400">Bad Examples</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {BAD_EXAMPLES.map((filename, index) => (
                <div
                  key={filename}
                  className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
                >
                  <Image
                    src={`/examples/${filename}`}
                    alt={`Bad example ${index + 1}`}
                    width={400}
                    height={300}
                    className="h-36 w-full object-cover sm:h-44"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <ul className="list-inside list-disc space-y-3 text-sm text-zinc-300">
            {GUIDELINES.map((guideline) => (
              <li key={guideline}>{guideline}</li>
            ))}
          </ul>
        </section>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/analyze"
            className="rounded-lg bg-accent px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover"
          >
            Analyze a Horse
          </Link>
          <Link
            href="/buy-rosettes"
            className="rounded-lg border border-accent bg-transparent px-6 py-3 text-center text-sm font-semibold text-accent transition hover:bg-accent/10"
          >
            Buy Report Tokens
          </Link>
        </div>
      </main>
    </div>
  );
}
