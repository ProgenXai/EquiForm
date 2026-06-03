"use client";

import dynamic from "next/dynamic";

const HorseViewer3D = dynamic(
  () => import("@/components/HorseViewer3D"),
  { ssr: false },
);

const TEST_LANDMARKS = {
  left: {
    shoulder: { x: 0.18, y: 0.45 },
    girth: { x: 0.35, y: 0.55 },
    point_of_hip: { x: 0.72, y: 0.38 },
    buttock: { x: 0.88, y: 0.42 },
    poll: { x: 0.15, y: 0.08 },
    withers: { x: 0.32, y: 0.18 },
    loin: { x: 0.62, y: 0.2 },
    tail: { x: 0.88, y: 0.3 },
    front_knee: { x: 0.22, y: 0.68 },
    hind_hock: { x: 0.75, y: 0.65 },
  },
  front: {
    left_knee: { x: 0.42, y: 0.65 },
    right_knee: { x: 0.58, y: 0.65 },
  },
  hind: {
    left_hock: { x: 0.42, y: 0.65 },
    right_hock: { x: 0.58, y: 0.65 },
  },
};

export default function Test3DPage() {
  return (
    <div className="min-h-screen w-full bg-black p-6">
      <HorseViewer3D
        coatColor="bay"
        markings={[]}
        landmarks={TEST_LANDMARKS}
      />
    </div>
  );
}
