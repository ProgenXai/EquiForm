export type LandmarkId =
  | "tail"
  | "poll"
  | "shoulder"
  | "girth"
  | "flank"
  | "withers"
  | "loin"
  | "buttock"
  | "front_knee"
  | "front_fetlock"
  | "front_hoof"
  | "hind_hock"
  | "hind_fetlock"
  | "hind_hoof"
  | "forearm"
  | "stifle"
  | "gaskin"
  | "point_of_hip";

export type Point = { x: number; y: number };

export type HorseFacing = "LEFT" | "RIGHT";

export type LandmarkDefinition = {
  id: LandmarkId;
  label: string;
  instruction: string;
  referenceOnly?: boolean;
};

export const LANDMARKS: LandmarkDefinition[] = [
  {
    id: "poll",
    label: "Poll",
    instruction: "Click the poll (top of the head/neck junction).",
  },
  {
    id: "shoulder",
    label: "Point of Shoulder",
    instruction: "Click the point of shoulder.",
  },
  {
    id: "forearm",
    label: "Forearm",
    instruction:
      "Click the forearm (section of the front leg between the shoulder and the knee).",
  },
  {
    id: "front_knee",
    label: "Knee",
    instruction: "Click the knee.",
  },
  {
    id: "front_fetlock",
    label: "Front fetlock",
    instruction: "Click the front fetlock.",
  },
  {
    id: "front_hoof",
    label: "Front hoof",
    instruction: "Click the front hoof.",
  },
  {
    id: "withers",
    label: "Withers",
    instruction: "Click the highest point of the withers.",
  },
  {
    id: "girth",
    label: "Girth",
    instruction: "Click the deepest point of the girth (defines X and Y guides).",
  },
  {
    id: "loin",
    label: "Loin",
    instruction: "Click the loin.",
  },
  {
    id: "flank",
    label: "Flank",
    instruction: "Click the flank.",
  },
  {
    id: "point_of_hip",
    label: "Point of hip",
    instruction: "Click the point of hip (hook bone on the hindquarter).",
  },
  {
    id: "tail",
    label: "Tail Head",
    instruction:
      "Click the tail head (reference point — not drawn on overlay).",
    referenceOnly: true,
  },
  {
    id: "buttock",
    label: "Buttock",
    instruction: "Click the point of buttock.",
  },
  {
    id: "stifle",
    label: "Stifle",
    instruction: "Click the stifle (large hind leg joint above the hock).",
  },
  {
    id: "gaskin",
    label: "Gaskin",
    instruction: "Click the gaskin (muscling between stifle and hock on the hind leg).",
  },
  {
    id: "hind_hock",
    label: "Hock",
    instruction: "Click the hock.",
  },
  {
    id: "hind_fetlock",
    label: "Hind fetlock",
    instruction: "Click the hind fetlock.",
  },
  {
    id: "hind_hoof",
    label: "Hind hoof",
    instruction: "Click the hind hoof.",
  },
];

export const LANDMARK_COUNT = LANDMARKS.length;
