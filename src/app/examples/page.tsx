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

const SIDE_PROFILE_DO = [
  "Full side profile, head to hoof fully visible",
  "Standing square on level ground",
  "All four feet planted naturally",
  "Good lighting, horse clearly visible against background",
  "One horse only, no obstructions",
  "In focus, high resolution photo",
] as const;

const SIDE_PROFILE_DONT = [
  "Angled, 3/4, or front-facing photos",
  "Head down or not standing square",
  "Dark horses in dark settings or heavy shadows",
  "Busy or cluttered background",
  "Multiple horses in the frame",
  "Blurry, pixelated, or video screenshot photos",
] as const;

const FRONT_VIEW_DO = [
  "Horse facing directly toward the camera",
  "Standing square on level ground",
  "Camera at chest height",
  "Step back so full horse fills about 2/3 of the frame",
  "All four feet visible",
] as const;

const FRONT_VIEW_DONT = [
  "Angled or off-center — must face camera straight on",
  "Camera too high or too low",
  "Feet partially obscured or off level ground",
  "Motion or unnatural stance",
] as const;

const HIND_VIEW_DO = [
  "Hindquarters facing directly toward the camera",
  "Tail tied or braided up — both hind legs fully visible",
  "Standing square on level ground",
  "Camera at hip height",
  "Step back so full horse fills about 2/3 of the frame",
] as const;

const HIND_VIEW_DONT = [
  "Tail covering the hind legs",
  "Angled — must face directly away from camera",
  "Camera too high or too low",
  "Feet partially obscured or off level ground",
] as const;

const EXAMPLE_IMAGE_CLASS =
  "max-h-64 w-full object-contain sm:max-h-72";

const EXAMPLE_IMAGE_CONTAINER_CLASS =
  "overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950";

function ExamplePhotoGrid({
  goodExamples,
  badExamples,
  doItems,
  dontItems,
}: {
  goodExamples: readonly string[];
  badExamples: readonly string[];
  doItems: readonly string[];
  dontItems: readonly string[];
}) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h3 className="text-lg font-semibold text-green-400">Good Examples</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {goodExamples.map((filename, index) => (
            <div key={filename} className={EXAMPLE_IMAGE_CONTAINER_CLASS}>
              <Image
                src={`/examples/${filename}`}
                alt={`Good example ${index + 1}`}
                width={400}
                height={300}
                className={EXAMPLE_IMAGE_CLASS}
              />
            </div>
          ))}
        </div>
        <h4 className="mt-6 text-sm font-semibold text-green-400">Do</h4>
        <ul className="mt-3 space-y-3">
          {doItems.map((item) => (
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
        <h3 className="text-lg font-semibold text-red-400">Bad Examples</h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {badExamples.map((filename, index) => (
            <div key={filename} className={EXAMPLE_IMAGE_CONTAINER_CLASS}>
              <Image
                src={`/examples/${filename}`}
                alt={`Bad example ${index + 1}`}
                width={400}
                height={300}
                className={EXAMPLE_IMAGE_CLASS}
              />
            </div>
          ))}
        </div>
        <h4 className="mt-6 text-sm font-semibold text-red-400">Don&apos;t</h4>
        <ul className="mt-3 space-y-3">
          {dontItems.map((item) => (
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

function ViewSection({
  title,
  goodExamples,
  badExamples,
  doItems,
  dontItems,
}: {
  title: string;
  goodExamples: readonly string[];
  badExamples: readonly string[];
  doItems: readonly string[];
  dontItems: readonly string[];
}) {
  return (
    <section className="mb-12">
      <h2 className="mb-6 text-xl font-semibold text-zinc-300">{title}</h2>
      <ExamplePhotoGrid
        goodExamples={goodExamples}
        badExamples={badExamples}
        doItems={doItems}
        dontItems={dontItems}
      />
    </section>
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
          badExamples={BAD_EXAMPLES}
          doItems={SIDE_PROFILE_DO}
          dontItems={SIDE_PROFILE_DONT}
        />

        <ViewSection
          title="Front View"
          goodExamples={FRONT_GOOD}
          badExamples={FRONT_BAD}
          doItems={FRONT_VIEW_DO}
          dontItems={FRONT_VIEW_DONT}
        />

        <ViewSection
          title="Hind View"
          goodExamples={HIND_GOOD}
          badExamples={HIND_BAD}
          doItems={HIND_VIEW_DO}
          dontItems={HIND_VIEW_DONT}
        />

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
