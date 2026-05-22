import type { LandmarkId } from "@/lib/calibration/landmarks";

import type { DetectedLandmarkPoint } from "@/lib/analyze/types";

const ROBOFLOW_SERVERLESS = "https://serverless.roboflow.com";

const LANDMARK_ORDER = [
  { roboflow: "poll", display: "Poll" },
  { roboflow: "point-of-shoulder", display: "Point of Shoulder" },
  { roboflow: "forearm", display: "Forearm" },
  { roboflow: "knee", display: "Knee" },
  { roboflow: "front-fetlock", display: "Front Fetlock" },
  { roboflow: "front-hoof", display: "Front Hoof" },
  { roboflow: "withers", display: "Withers" },
  { roboflow: "girth", display: "Girth" },
  { roboflow: "loin", display: "Loin" },
  { roboflow: "flank", display: "Flank" },
  { roboflow: "point-of-hip", display: "Point of Hip" },
  { roboflow: "tail-head", display: "Tail Head" },
  { roboflow: "buttock", display: "Buttock" },
  { roboflow: "stifle", display: "Stifle" },
  { roboflow: "gaskin", display: "Gaskin" },
  { roboflow: "hock", display: "Hock" },
  { roboflow: "hind-fetlock", display: "Hind Fetlock" },
  { roboflow: "hind-hoof", display: "Hind Hoof" },
] as const;

/** Calibration record keys for each Roboflow label (output mapping only). */
const LANDMARK_OUTPUT_ID: Record<string, LandmarkId> = {
  poll: "poll",
  "point-of-shoulder": "shoulder",
  forearm: "forearm",
  knee: "front_knee",
  "front-fetlock": "front_fetlock",
  "front-hoof": "front_hoof",
  withers: "withers",
  girth: "girth",
  loin: "loin",
  flank: "flank",
  "point-of-hip": "point_of_hip",
  "tail-head": "tail",
  buttock: "buttock",
  stifle: "stifle",
  gaskin: "gaskin",
  hock: "hind_hock",
  "hind-fetlock": "hind_fetlock",
  "hind-hoof": "hind_hoof",
};

type RoboflowKeypoint = {
  x: number;
  y: number;
  class_name?: string;
  class?: string;
  confidence?: number;
};

type RoboflowPrediction = {
  class?: string;
  confidence?: number;
  keypoints?: RoboflowKeypoint[];
};

type RoboflowKeypointResponse = {
  predictions?: RoboflowPrediction[];
  image?: { width?: number; height?: number };
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function keypointClassName(kp: RoboflowKeypoint): string {
  return (kp.class_name ?? kp.class ?? "").trim().toLowerCase();
}

/** Map Roboflow dashed keypoint names to canonical landmark ids. */
function normalizeKeypointName(name: string): string {
  switch (name) {
    case "tail-head":
      return "tail";
    case "point-of-shoulder":
      return "shoulder";
    case "knee":
    case "front_knee":
      return "front_knee";
    case "front-fetlock":
      return "front_fetlock";
    case "front-hoof":
      return "front_hoof";
    case "hock":
    case "hind_hock":
      return "hind_hock";
    case "hind-fetlock":
      return "hind_fetlock";
    case "hind-hoof":
      return "hind_hoof";
    case "point-of-hip":
      return "point_of_hip";
    default:
      return name.replace(/-/g, "_");
  }
}

function selectHorsePrediction(
  predictions: RoboflowPrediction[],
): RoboflowPrediction {
  const horse = predictions.find((p) => (p.class ?? "").toLowerCase() === "horse");
  if (horse) return horse;

  return predictions.reduce((best, current) =>
    (current.confidence ?? 0) > (best.confidence ?? 0) ? current : best,
  );
}

/** Parse Roboflow serverless keypoint detection JSON into normalized landmark map. */
export function parseRoboflowKeypointResponse(
  data: unknown,
  imageWidth: number,
  imageHeight: number,
): Record<string, DetectedLandmarkPoint> {
  const payload = data as RoboflowKeypointResponse;
  const predictions = payload.predictions ?? [];

  if (predictions.length === 0) {
    throw new Error("Roboflow returned no predictions");
  }

  const horsePrediction = selectHorsePrediction(predictions);
  const keypoints = horsePrediction.keypoints ?? [];

  if (keypoints.length === 0) {
    throw new Error("Roboflow horse prediction has no keypoints");
  }

  const keypointByName: Record<string, RoboflowKeypoint> = {};
  for (const kp of keypoints) {
    if (kp.class !== undefined && kp.class !== null) {
      keypointByName[kp.class] = kp;
    }
  }

  const roboflowWidth = payload.image?.width;
  const roboflowHeight = payload.image?.height;

  const width =
    roboflowWidth && roboflowWidth > 0 ? roboflowWidth : imageWidth;
  const height =
    roboflowHeight && roboflowHeight > 0 ? roboflowHeight : imageHeight;

  if (width <= 0 || height <= 0) {
    throw new Error("Invalid image dimensions for Roboflow keypoint normalization");
  }

  const landmarks: Record<string, DetectedLandmarkPoint> = {};

  for (const entry of LANDMARK_ORDER) {
    const kp = keypointByName[entry.roboflow];
    const outputId = LANDMARK_OUTPUT_ID[entry.roboflow];

    if (
      !kp ||
      typeof kp.x !== "number" ||
      typeof kp.y !== "number" ||
      (kp.confidence !== undefined && kp.confidence <= 0)
    ) {
      landmarks[outputId] = { x: 0, y: 0 };
      continue;
    }

    const rawX = kp.x;
    const rawY = kp.y;
    const xPx = rawX;

    landmarks[outputId] = {
      x: clamp01(xPx / width),
      y: clamp01(rawY / height),
    };
  }

  return landmarks;
}

/** Run trained Roboflow keypoint model on a base64-encoded image (no data: URL prefix). */
export async function detectLandmarksWithRoboflow(
  imageBase64: string,
  imageWidth: number,
  imageHeight: number,
): Promise<Record<string, DetectedLandmarkPoint>> {
  const apiKey = process.env.ROBOFLOW_API_KEY?.trim();
  const modelId = process.env.ROBOFLOW_MODEL_ID?.trim();

  if (!apiKey || !modelId) {
    throw new Error("ROBOFLOW_API_KEY and ROBOFLOW_MODEL_ID must be configured");
  }

  const base64Value = imageBase64.replace(/^data:image\/\w+;base64,/, "");

  const url = new URL(`${ROBOFLOW_SERVERLESS}/${modelId}`);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: base64Value,
  });

  const raw = await response.text();
  let data: unknown = raw;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error("Roboflow returned non-JSON response");
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : raw || response.statusText;
    throw new Error(`Roboflow inference failed (${response.status}): ${message}`);
  }

  return parseRoboflowKeypointResponse(data, imageWidth, imageHeight);
}
