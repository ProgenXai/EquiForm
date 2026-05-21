export interface ConformationLandmarks {
  point_of_shoulder_x: number;
  girth_x: number;
  girth_y: number;
  flank_x: number;
  flank_y: number;
  withers_x: number;
  withers_y: number;
  loin_x: number;
  loin_y: number;
  poll_x: number;
  poll_y: number;
  point_of_buttock_x: number;
  tail_x: number;
  tail_y: number;
  topline_y: number;
  shoulder_y: number;
  buttock_y: number;
  front_knee_x: number;
  front_knee_y: number;
  front_fetlock_x: number;
  front_fetlock_y: number;
  front_hoof_x: number;
  front_hoof_y: number;
  hind_hock_x: number;
  hind_hock_y: number;
  hind_fetlock_x: number;
  hind_fetlock_y: number;
  hind_hoof_x: number;
  hind_hoof_y: number;
  point_of_hip_x: number;
  point_of_hip_y: number;
  stifle_x: number;
  stifle_y: number;
  gaskin_x: number;
  gaskin_y: number;
  forearm_x: number;
  forearm_y: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Level short-back top / plumb reference: average of withers and loin click heights. */
export function computeToplineY(
  landmarks: Pick<ConformationLandmarks, "withers_y" | "loin_y">,
): number {
  return clamp01((landmarks.withers_y + landmarks.loin_y) / 2);
}
