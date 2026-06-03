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
  | "point_of_hip"
  | "left_ear"
  | "right_ear"
  | "left_eye"
  | "right_eye"
  | "muzzle"
  | "left_point_of_shoulder"
  | "right_point_of_shoulder"
  | "left_knee"
  | "right_knee"
  | "left_front_fetlock"
  | "right_front_fetlock"
  | "left_front_hoof"
  | "right_front_hoof"
  | "left_point_of_hip"
  | "right_point_of_hip"
  | "left_buttock"
  | "right_buttock"
  | "left_gaskin"
  | "right_gaskin"
  | "left_hock"
  | "right_hock"
  | "left_hind_fetlock"
  | "right_hind_fetlock"
  | "left_hind_hoof"
  | "right_hind_hoof";

export type CalibrationViewMode = "side" | "left" | "right" | "front" | "hind";

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

export const FRONT_LANDMARKS: LandmarkDefinition[] = [
  {
    id: "poll",
    label: "Poll",
    instruction: "Click the poll (top of head, center).",
  },
  {
    id: "left_ear",
    label: "Left Ear",
    instruction: "Click the left ear.",
  },
  {
    id: "right_ear",
    label: "Right Ear",
    instruction: "Click the right ear.",
  },
  {
    id: "left_eye",
    label: "Left Eye",
    instruction: "Click the left eye.",
  },
  {
    id: "right_eye",
    label: "Right Eye",
    instruction: "Click the right eye.",
  },
  {
    id: "muzzle",
    label: "Muzzle",
    instruction: "Click the muzzle (center).",
  },
  {
    id: "left_point_of_shoulder",
    label: "Left Point of Shoulder",
    instruction: "Click the left point of shoulder.",
  },
  {
    id: "right_point_of_shoulder",
    label: "Right Point of Shoulder",
    instruction: "Click the right point of shoulder.",
  },
  {
    id: "left_knee",
    label: "Left Knee",
    instruction: "Click the left knee.",
  },
  {
    id: "right_knee",
    label: "Right Knee",
    instruction: "Click the right knee.",
  },
  {
    id: "left_front_fetlock",
    label: "Left Front Fetlock",
    instruction: "Click the left front fetlock.",
  },
  {
    id: "right_front_fetlock",
    label: "Right Front Fetlock",
    instruction: "Click the right front fetlock.",
  },
  {
    id: "left_front_hoof",
    label: "Left Front Hoof",
    instruction: "Click the left front hoof.",
  },
  {
    id: "right_front_hoof",
    label: "Right Front Hoof",
    instruction: "Click the right front hoof.",
  },
];

export const FRONT_LANDMARK_COUNT = FRONT_LANDMARKS.length;

export const HIND_LANDMARKS: LandmarkDefinition[] = [
  {
    id: "tail",
    label: "Tail Head",
    instruction: "Click the tail head.",
  },
  {
    id: "left_point_of_hip",
    label: "Left Point of Hip",
    instruction: "Click the left point of hip.",
  },
  {
    id: "right_point_of_hip",
    label: "Right Point of Hip",
    instruction: "Click the right point of hip.",
  },
  {
    id: "left_buttock",
    label: "Left Buttock",
    instruction: "Click the left buttock.",
  },
  {
    id: "right_buttock",
    label: "Right Buttock",
    instruction: "Click the right buttock.",
  },
  {
    id: "left_gaskin",
    label: "Left Gaskin",
    instruction: "Click the left gaskin.",
  },
  {
    id: "right_gaskin",
    label: "Right Gaskin",
    instruction: "Click the right gaskin.",
  },
  {
    id: "left_hock",
    label: "Left Hock",
    instruction: "Click the left hock.",
  },
  {
    id: "right_hock",
    label: "Right Hock",
    instruction: "Click the right hock.",
  },
  {
    id: "left_hind_fetlock",
    label: "Left Hind Fetlock",
    instruction: "Click the left hind fetlock.",
  },
  {
    id: "right_hind_fetlock",
    label: "Right Hind Fetlock",
    instruction: "Click the right hind fetlock.",
  },
  {
    id: "left_hind_hoof",
    label: "Left Hind Hoof",
    instruction: "Click the left hind hoof.",
  },
  {
    id: "right_hind_hoof",
    label: "Right Hind Hoof",
    instruction: "Click the right hind hoof.",
  },
];

export const HIND_LANDMARK_COUNT = HIND_LANDMARKS.length;

export function getLandmarksForView(
  viewMode: CalibrationViewMode,
): LandmarkDefinition[] {
  switch (viewMode) {
    case "front":
      return FRONT_LANDMARKS;
    case "hind":
      return HIND_LANDMARKS;
    case "left":
    case "right":
    case "side":
    default:
      return LANDMARKS;
  }
}

export function isSideProfileViewMode(viewMode: CalibrationViewMode): boolean {
  return viewMode === "side" || viewMode === "left" || viewMode === "right";
}

export function getLandmarkCountForView(viewMode: CalibrationViewMode): number {
  return getLandmarksForView(viewMode).length;
}
