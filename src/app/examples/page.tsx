import Image from "next/image";

import AppHamburgerMenu from "@/components/AppHamburgerMenu";
import ExamplesBackButton from "@/components/ExamplesBackButton";
import PhotoGuideCta from "@/components/PhotoGuideCta";
import PhotoGuideCarousel, {
  type PhotoGuideSlide,
} from "@/components/PhotoGuideCarousel";

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

const PHOTO_GUIDE_SLIDES: readonly PhotoGuideSlide[] = [
  {
    id: "left",
    title: "Left Side",
    goodImage: "good-2.jpg",
    goodImageAlt: "Good left side profile example",
    badImage: "bad-2.jpg",
    badImageAlt: "Bad left side profile example",
    doItems: SIDE_PROFILE_DO,
    dontItems: SIDE_PROFILE_DONT,
  },
  {
    id: "right",
    title: "Right Side",
    goodImage: "good-1.jpg",
    goodImageAlt: "Good right side profile example",
    badImage: "bad-1.jpg",
    badImageAlt: "Bad right side profile example",
    doItems: SIDE_PROFILE_DO,
    dontItems: SIDE_PROFILE_DONT,
  },
  {
    id: "front",
    title: "Front View",
    goodImage: "good-5.jpg",
    goodImageAlt: "Good front view example",
    badImage: "bad-5.jpg",
    badImageAlt: "Bad front view example",
    doItems: FRONT_VIEW_DO,
    dontItems: FRONT_VIEW_DONT,
  },
  {
    id: "hind",
    title: "Hind View",
    goodImage: "good-7.jpg",
    goodImageAlt: "Good hind view example",
    badImage: "bad-7.jpg",
    badImageAlt: "Bad hind view example",
    doItems: HIND_VIEW_DO,
    dontItems: HIND_VIEW_DONT,
  },
];

export default function PhotoGuidePage() {
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

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-semibold text-white">Photo Guide</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Great reports start with great photos. Swipe or use the arrows to see
            what works and what doesn&apos;t for each view.
          </p>
        </div>

        <PhotoGuideCarousel slides={PHOTO_GUIDE_SLIDES} />

        <div className="mt-10 flex flex-col items-center gap-4">
          <PhotoGuideCta />
          <ExamplesBackButton />
        </div>
      </main>
    </div>
  );
}
