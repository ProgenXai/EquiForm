import Image from "next/image";
import Link from "next/link";

import AppHamburgerMenu from "@/components/AppHamburgerMenu";
import ExamplesBackButton from "@/components/ExamplesBackButton";

const GOOD_EXAMPLES = ["good-1.jpg", "good-2.jpg", "good-3.jpg", "good-4.jpg"] as const;
const BAD_EXAMPLES = ["bad-1.jpg", "bad-2.jpg", "bad-3.jpg", "bad-4.jpg"] as const;

const FRONT_GOOD = ["good-5.jpg", "good-6.jpg"] as const;
const FRONT_BAD = ["bad-5.jpg", "bad-6.jpg"] as const;
const HIND_GOOD = ["good-7.jpg", "good-8.jpg"] as const;
const HIND_BAD = ["bad-7.jpg", "bad-8.jpg"] as const;

const SIDE_GOOD_CAPTIONS = [
  "Clean side profile, standing square on level ground, all four feet visible",
  "Full body visible from head to hoof, good contrast against background",
  "Horse standing still and square, no obstructions, clear lighting",
  "Full side view, relaxed natural stance, legs and topline clearly visible",
] as const;

const FRONT_GOOD_CAPTIONS = [
  "Facing camera straight on, standing square, all four feet visible on level ground",
  "AI landmark detection — clean front view produces accurate shoulder and leg alignment analysis",
] as const;

const HIND_GOOD_CAPTIONS = [
  "Tail tied up, standing square — hocks and hind legs clearly visible",
  "Square stance, tail out of the way, unobstructed view of hindquarters and hooves",
] as const;

const SIDE_BAD_CAPTIONS: Record<(typeof BAD_EXAMPLES)[number], string> = {
  "bad-1.jpg":
    "Dim lighting and barn clutter — horse is hard to see clearly against the background",
  "bad-2.jpg":
    "Head down eating hay — angled view, not standing square on level ground",
  "bad-3.jpg":
    "Busy background and uneven stance — horse not standing square for analysis",
  "bad-4.jpg":
    "Head down in hay net inside a stall — not standing square on level ground",
};

const FRONT_BAD_CAPTIONS: Record<(typeof FRONT_BAD)[number], string> = {
  "bad-5.jpg":
    "Horse is angled — must be standing square and facing directly toward the camera",
  "bad-6.jpg":
    "Wrong angle and feet partially obscured — horse must face the camera straight on with all four feet visible",
};

const HIND_BAD_CAPTIONS: Record<(typeof HIND_BAD)[number], string> = {
  "bad-7.jpg":
    "Tail covering the hind legs — tie or braid tail to the side so legs are fully visible",
  "bad-8.jpg":
    "Horse is angled — must be standing square with hindquarters facing directly toward the camera",
};

const DO_GUIDELINES = [
  "Full side profile, head to hoof fully visible",
  "Standing square on level ground",
  "All four feet planted naturally",
  "Good lighting, horse clearly visible against background",
  "One horse only, no obstructions",
  "Tail tied or braided up for hind view",
  "In focus, high resolution photo",
] as const;

const DONT_GUIDELINES = [
  "Angled, 3/4, or front-facing photos for side profile",
  "Motion, cocked legs, stretched halter poses, or camped-out stance",
  "Dark horses in dark settings or heavy shadows",
  "Watermarks, logos, or graphics overlaid on the horse's body",
  "Multiple horses in the frame",
  "Blurry, pixelated, or video screenshot photos",
  "Tail covering hind legs in hind view",
] as const;

const EXAMPLE_IMAGE_CLASS =
  "max-h-64 w-full object-contain sm:max-h-72";

const EXAMPLE_IMAGE_CONTAINER_CLASS =
  "overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950";

function ExamplePhotoGrid({
  goodExamples,
  goodCaptions,
  badExamples,
  badCaptions,
}: {
  goodExamples: readonly string[];
  goodCaptions: readonly string[];
  badExamples: readonly string[];
  badCaptions: Record<string, string>;
}) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h3 className="text-lg font-semibold text-green-400">Good Examples</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {goodExamples.map((filename, index) => (
            <div key={filename}>
              <div className={EXAMPLE_IMAGE_CONTAINER_CLASS}>
                <Image
                  src={`/examples/${filename}`}
                  alt={`Good example ${index + 1}`}
                  width={400}
                  height={300}
                  className={EXAMPLE_IMAGE_CLASS}
                />
              </div>
              <p className="mt-1 text-xs text-green-500">
                {goodCaptions[index]}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h3 className="text-lg font-semibold text-red-400">Bad Examples</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {badExamples.map((filename, index) => (
            <div key={filename}>
              <div className={EXAMPLE_IMAGE_CONTAINER_CLASS}>
                <Image
                  src={`/examples/${filename}`}
                  alt={`Bad example ${index + 1}`}
                  width={400}
                  height={300}
                  className={EXAMPLE_IMAGE_CLASS}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-red-400">
                {badCaptions[filename]}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ViewSection({
  title,
  goodExamples,
  goodCaptions,
  badExamples,
  badCaptions,
}: {
  title: string;
  goodExamples: readonly string[];
  goodCaptions: readonly string[];
  badExamples: readonly string[];
  badCaptions: Record<string, string>;
}) {
  return (
    <section className="mb-12">
      <h2 className="mb-6 text-xl font-semibold text-zinc-300">{title}</h2>
      <ExamplePhotoGrid
        goodExamples={goodExamples}
        goodCaptions={goodCaptions}
        badExamples={badExamples}
        badCaptions={badCaptions}
      />
    </section>
  );
}

function PhotoGuidelinesCards() {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h3 className="text-lg font-semibold text-green-400">Do</h3>
        <ul className="mt-4 space-y-3">
          {DO_GUIDELINES.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-sm leading-relaxed text-zinc-300"
            >
              <span className="shrink-0" aria-hidden="true">
                ✅
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h3 className="text-lg font-semibold text-red-400">Don&apos;t</h3>
        <ul className="mt-4 space-y-3">
          {DONT_GUIDELINES.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-sm leading-relaxed text-zinc-300"
            >
              <span className="shrink-0" aria-hidden="true">
                ❌
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function ExamplesPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />
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

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold text-white">Photo Guidelines</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Great reports start with great photos. Here&apos;s what works and what
            doesn&apos;t.
          </p>
        </div>

        <ViewSection
          title="Side Profile"
          goodExamples={GOOD_EXAMPLES}
          goodCaptions={SIDE_GOOD_CAPTIONS}
          badExamples={BAD_EXAMPLES}
          badCaptions={SIDE_BAD_CAPTIONS}
        />

        <ViewSection
          title="Front View"
          goodExamples={FRONT_GOOD}
          goodCaptions={FRONT_GOOD_CAPTIONS}
          badExamples={FRONT_BAD}
          badCaptions={FRONT_BAD_CAPTIONS}
        />

        <ViewSection
          title="Hind View"
          goodExamples={HIND_GOOD}
          goodCaptions={HIND_GOOD_CAPTIONS}
          badExamples={HIND_BAD}
          badCaptions={HIND_BAD_CAPTIONS}
        />

        <section className="mt-8">
          <PhotoGuidelinesCards />
        </section>

        <div className="mt-10 flex flex-col items-center gap-4">
          <Link
            href="/buy-credits"
            className="w-full max-w-sm rounded-xl bg-accent px-8 py-5 text-center text-lg font-bold text-white transition hover:bg-accent-hover sm:w-auto"
          >
            I&apos;m Ready, Buy Credits
          </Link>
          <ExamplesBackButton />
        </div>
      </main>
    </div>
  );
}
