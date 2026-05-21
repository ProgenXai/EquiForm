import { computeToplineY, type ConformationLandmarks } from "@/lib/conformation/landmarks";
import type { LandmarkId, Point } from "@/lib/calibration/landmarks";

export type LandmarkMap = Partial<Record<LandmarkId, Point>>;

function fracX(x: number, width: number): number {
  return width > 0 ? x / width : 0;
}

function fracY(y: number, height: number): number {
  return height > 0 ? y / height : 0;
}

function normalizePoint(
  point: Point,
  imageWidth: number,
  imageHeight: number,
): Point {
  return {
    x: fracX(point.x, imageWidth),
    y: fracY(point.y, imageHeight),
  };
}

/** Convert canvas pixel clicks to fractional (0–1) landmark map. */
export function landmarkMapToFractional(
  points: LandmarkMap,
  imageWidth: number,
  imageHeight: number,
): LandmarkMap {
  const fractional: LandmarkMap = {};
  for (const [id, point] of Object.entries(points)) {
    if (!point) continue;
    fractional[id as LandmarkId] = normalizePoint(point, imageWidth, imageHeight);
  }
  return fractional;
}

function requirePoint(
  points: LandmarkMap,
  id: LandmarkId,
): Point {
  const point = points[id];
  if (!point) {
    throw new Error(`Missing landmark: ${id}`);
  }
  return point;
}

/**
 * Convert canvas pixel landmarks to normalized ConformationLandmarks.
 * Lookups use LandmarkId (not LANDMARKS array index). Order below matches LANDMARKS[].
 */
export function landmarkMapToConformation(
  points: LandmarkMap,
  imageWidth: number,
  imageHeight: number,
): ConformationLandmarks {
  const fractional = landmarkMapToFractional(points, imageWidth, imageHeight);

  // [0] poll
  const poll = requirePoint(fractional, "poll");
  // [1] shoulder
  const shoulder = requirePoint(fractional, "shoulder");
  // [2] forearm
  const forearm = requirePoint(fractional, "forearm");
  // [3] front_knee
  const frontKnee = requirePoint(fractional, "front_knee");
  // [4] front_fetlock
  const frontFetlock = requirePoint(fractional, "front_fetlock");
  // [5] front_hoof
  const frontHoof = requirePoint(fractional, "front_hoof");
  // [6] withers
  const withers = requirePoint(fractional, "withers");
  // [7] girth
  const girth = requirePoint(fractional, "girth");
  // [8] loin
  const loin = requirePoint(fractional, "loin");
  // [9] flank
  const flank = requirePoint(fractional, "flank");
  // [10] point_of_hip
  const pointOfHip = requirePoint(fractional, "point_of_hip");
  // [11] tail (optional reference)
  const tail = fractional.tail;
  // [12] buttock → point_of_buttock_x + buttock_y
  const buttock = requirePoint(fractional, "buttock");
  // [13] stifle
  const stifle = requirePoint(fractional, "stifle");
  // [14] gaskin
  const gaskin = requirePoint(fractional, "gaskin");
  // [15] hind_hock
  const hindHock = requirePoint(fractional, "hind_hock");
  // [16] hind_fetlock
  const hindFetlock = requirePoint(fractional, "hind_fetlock");
  // [17] hind_hoof
  const hindHoof = requirePoint(fractional, "hind_hoof");

  const landmarks: ConformationLandmarks = {
    poll_x: poll.x,
    poll_y: poll.y,
    point_of_shoulder_x: shoulder.x,
    shoulder_y: shoulder.y,
    forearm_x: forearm.x,
    forearm_y: forearm.y,
    front_knee_x: frontKnee.x,
    front_knee_y: frontKnee.y,
    front_fetlock_x: frontFetlock.x,
    front_fetlock_y: frontFetlock.y,
    front_hoof_x: frontHoof.x,
    front_hoof_y: frontHoof.y,
    withers_x: withers.x,
    withers_y: withers.y,
    girth_x: girth.x,
    girth_y: girth.y,
    loin_x: loin.x,
    loin_y: loin.y,
    flank_x: flank.x,
    flank_y: flank.y,
    point_of_hip_x: pointOfHip.x,
    point_of_hip_y: pointOfHip.y,
    tail_x: tail ? tail.x : buttock.x,
    tail_y: tail ? tail.y : buttock.y,
    point_of_buttock_x: buttock.x,
    buttock_y: buttock.y,
    stifle_x: stifle.x,
    stifle_y: stifle.y,
    gaskin_x: gaskin.x,
    gaskin_y: gaskin.y,
    hind_hock_x: hindHock.x,
    hind_hock_y: hindHock.y,
    hind_fetlock_x: hindFetlock.x,
    hind_fetlock_y: hindFetlock.y,
    hind_hoof_x: hindHoof.x,
    hind_hoof_y: hindHoof.y,
    topline_y: 0,
  };

  landmarks.topline_y = computeToplineY(landmarks);
  return landmarks;
}
