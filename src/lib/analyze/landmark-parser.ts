import {
  computeToplineY,
  type ConformationLandmarks,
} from "@/lib/conformation/landmarks";
import type { CalibrationViewMode } from "@/lib/calibration/landmarks";

import type {
  ClaudeAnalyzeResponse,
  ConformationReport,
  DetectedLandmarkPoint,
} from "@/lib/analyze/types";

export type FrontConformationLandmarks = {
  poll: DetectedLandmarkPoint;
  left_ear: DetectedLandmarkPoint;
  right_ear: DetectedLandmarkPoint;
  left_eye: DetectedLandmarkPoint;
  right_eye: DetectedLandmarkPoint;
  muzzle: DetectedLandmarkPoint;
  left_point_of_shoulder: DetectedLandmarkPoint;
  right_point_of_shoulder: DetectedLandmarkPoint;
  left_knee: DetectedLandmarkPoint;
  right_knee: DetectedLandmarkPoint;
  left_front_fetlock: DetectedLandmarkPoint;
  right_front_fetlock: DetectedLandmarkPoint;
  left_front_hoof: DetectedLandmarkPoint;
  right_front_hoof: DetectedLandmarkPoint;
};

export type HindConformationLandmarks = {
  tail: DetectedLandmarkPoint;
  left_point_of_hip: DetectedLandmarkPoint;
  right_point_of_hip: DetectedLandmarkPoint;
  left_buttock: DetectedLandmarkPoint;
  right_buttock: DetectedLandmarkPoint;
  left_gaskin: DetectedLandmarkPoint;
  right_gaskin: DetectedLandmarkPoint;
  left_hock: DetectedLandmarkPoint;
  right_hock: DetectedLandmarkPoint;
  left_hind_fetlock: DetectedLandmarkPoint;
  right_hind_fetlock: DetectedLandmarkPoint;
  left_hind_hoof: DetectedLandmarkPoint;
  right_hind_hoof: DetectedLandmarkPoint;
};

export type ParsedConformationLandmarks =
  | ConformationLandmarks
  | FrontConformationLandmarks
  | HindConformationLandmarks;

/** Canonical ids matching the trained Roboflow model (front_knee, hind_hock). */
const REQUIRED_LANDMARKS = [
  "poll",
  "shoulder",
  "forearm",
  "front_knee",
  "front_fetlock",
  "front_hoof",
  "withers",
  "girth",
  "loin",
  "flank",
  "point_of_hip",
  "tail",
  "buttock",
  "stifle",
  "gaskin",
  "hind_hock",
  "hind_fetlock",
  "hind_hoof",
] as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function getPoint(
  landmarks: Record<string, DetectedLandmarkPoint>,
  key: string,
): DetectedLandmarkPoint {
  const point = landmarks[key];
  if (!point || typeof point.x !== "number" || typeof point.y !== "number") {
    throw new Error(`Missing or invalid landmark: ${key}`);
  }
  return {
    x: clamp01(point.x),
    y: clamp01(point.y),
  };
}

export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("No JSON object found in model response");
  }
  return match[0];
}

export function parseLandmarksResponse(
  text: string,
): Record<string, DetectedLandmarkPoint> {
  const parsed: unknown = JSON.parse(extractJsonObject(text));

  let landmarks: Record<string, DetectedLandmarkPoint>;
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "landmarks" in parsed &&
    typeof (parsed as { landmarks: unknown }).landmarks === "object" &&
    (parsed as { landmarks: unknown }).landmarks !== null
  ) {
    landmarks = (parsed as { landmarks: Record<string, DetectedLandmarkPoint> })
      .landmarks;
  } else {
    landmarks = parsed as Record<string, DetectedLandmarkPoint>;
  }

  for (const key of REQUIRED_LANDMARKS) {
    getPoint(landmarks, key);
  }

  return landmarks;
}

export function parseReportResponse(text: string): ConformationReport {
  const parsed = JSON.parse(extractJsonObject(text)) as {
    report?: ConformationReport;
  };

  if (!parsed.report) {
    throw new Error("Invalid response: missing report");
  }

  return normalizeReport(parsed.report);
}

/** Parse a combined landmarks + report JSON response (legacy single-call shape). */
export function parseClaudeAnalyzeResponse(text: string): ClaudeAnalyzeResponse {
  const parsed = JSON.parse(extractJsonObject(text)) as {
    landmarks?: Record<string, DetectedLandmarkPoint>;
    report?: ConformationReport;
  };

  const landmarks = parseLandmarksResponse(text);
  if (!parsed.report) {
    throw new Error("Invalid response: missing report");
  }

  return { landmarks, report: normalizeReport(parsed.report) };
}

export function toFrontConformationLandmarks(
  detected: Record<string, DetectedLandmarkPoint>,
): FrontConformationLandmarks {
  return {
    poll: getPoint(detected, "poll"),
    left_ear: getPoint(detected, "left_ear"),
    right_ear: getPoint(detected, "right_ear"),
    left_eye: getPoint(detected, "left_eye"),
    right_eye: getPoint(detected, "right_eye"),
    muzzle: getPoint(detected, "muzzle"),
    left_point_of_shoulder: getPoint(detected, "left_point_of_shoulder"),
    right_point_of_shoulder: getPoint(detected, "right_point_of_shoulder"),
    left_knee: getPoint(detected, "left_knee"),
    right_knee: getPoint(detected, "right_knee"),
    left_front_fetlock: getPoint(detected, "left_front_fetlock"),
    right_front_fetlock: getPoint(detected, "right_front_fetlock"),
    left_front_hoof: getPoint(detected, "left_front_hoof"),
    right_front_hoof: getPoint(detected, "right_front_hoof"),
  };
}

export function toHindConformationLandmarks(
  detected: Record<string, DetectedLandmarkPoint>,
): HindConformationLandmarks {
  return {
    tail: getPoint(detected, "tail"),
    left_point_of_hip: getPoint(detected, "left_point_of_hip"),
    right_point_of_hip: getPoint(detected, "right_point_of_hip"),
    left_buttock: getPoint(detected, "left_buttock"),
    right_buttock: getPoint(detected, "right_buttock"),
    left_gaskin: getPoint(detected, "left_gaskin"),
    right_gaskin: getPoint(detected, "right_gaskin"),
    left_hock: getPoint(detected, "left_hock"),
    right_hock: getPoint(detected, "right_hock"),
    left_hind_fetlock: getPoint(detected, "left_hind_fetlock"),
    right_hind_fetlock: getPoint(detected, "right_hind_fetlock"),
    left_hind_hoof: getPoint(detected, "left_hind_hoof"),
    right_hind_hoof: getPoint(detected, "right_hind_hoof"),
  };
}

export function toConformationLandmarks(
  detected: Record<string, DetectedLandmarkPoint>,
  viewMode: CalibrationViewMode = "side",
): ParsedConformationLandmarks {
  if (viewMode === "front") {
    return toFrontConformationLandmarks(detected);
  }
  if (viewMode === "hind") {
    return toHindConformationLandmarks(detected);
  }

  const tail = getPoint(detected, "tail");
  const poll = getPoint(detected, "poll");
  const shoulder = getPoint(detected, "shoulder");
  const girth = getPoint(detected, "girth");
  const flank = getPoint(detected, "flank");
  const withers = getPoint(detected, "withers");
  const loin = getPoint(detected, "loin");
  const buttock = getPoint(detected, "buttock");
  const frontKnee = getPoint(detected, "front_knee");
  const frontFetlock = getPoint(detected, "front_fetlock");
  const frontHoof = getPoint(detected, "front_hoof");
  const hindHock = getPoint(detected, "hind_hock");
  const hindFetlock = getPoint(detected, "hind_fetlock");
  const hindHoof = getPoint(detected, "hind_hoof");
  const forearm = getPoint(detected, "forearm");
  const pointOfHip = getPoint(detected, "point_of_hip");
  const stifle = getPoint(detected, "stifle");
  const gaskin = getPoint(detected, "gaskin");

  const landmarks: ConformationLandmarks = {
    point_of_shoulder_x: shoulder.x,
    shoulder_y: shoulder.y,
    girth_x: girth.x,
    girth_y: girth.y,
    flank_x: flank.x,
    flank_y: flank.y,
    withers_x: withers.x,
    withers_y: withers.y,
    loin_x: loin.x,
    loin_y: loin.y,
    poll_x: poll.x,
    poll_y: poll.y,
    point_of_buttock_x: buttock.x,
    buttock_y: buttock.y,
    tail_x: tail.x,
    tail_y: tail.y,
    front_knee_x: frontKnee.x,
    front_knee_y: frontKnee.y,
    front_fetlock_x: frontFetlock.x,
    front_fetlock_y: frontFetlock.y,
    front_hoof_x: frontHoof.x,
    front_hoof_y: frontHoof.y,
    hind_hock_x: hindHock.x,
    hind_hock_y: hindHock.y,
    hind_fetlock_x: hindFetlock.x,
    hind_fetlock_y: hindFetlock.y,
    hind_hoof_x: hindHoof.x,
    hind_hoof_y: hindHoof.y,
    point_of_hip_x: pointOfHip.x,
    point_of_hip_y: pointOfHip.y,
    stifle_x: stifle.x,
    stifle_y: stifle.y,
    gaskin_x: gaskin.x,
    gaskin_y: gaskin.y,
    forearm_x: forearm.x,
    forearm_y: forearm.y,
    topline_y: 0,
  };

  landmarks.topline_y = computeToplineY(landmarks);
  return landmarks;
}

export function normalizeReport(report: ConformationReport): ConformationReport {
  const section = (value: ConformationReport["balance"]) => ({
    score: Math.min(100, Math.max(0, Math.round(value?.score ?? 0))),
    notes: String(value?.notes ?? "").trim(),
  });

  return {
    balance: section(report.balance),
    shoulder_angle: section(report.shoulder_angle),
    hip_angle: section(report.hip_angle),
    topline_quality: section(report.topline_quality),
    leg_alignment: section(report.leg_alignment),
    overall_score: Math.min(
      100,
      Math.max(0, Math.round(report.overall_score ?? 0)),
    ),
    summary: String(report.summary ?? "").trim(),
  };
}
