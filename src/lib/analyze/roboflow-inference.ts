import { LANDMARKS, type LandmarkId } from "@/lib/calibration/landmarks";

import type { DetectedLandmarkPoint } from "@/lib/analyze/types";

const ROBOFLOW_SERVERLESS = "https://serverless.roboflow.com";

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

  console.log(
    "[roboflow-inference] Raw Roboflow response:",
    JSON.stringify(data, null, 2),
  );
  console.log(
    "[roboflow-inference] Horse keypoints (pre-normalization, model order):",
    keypoints.map((kp, index) => ({
      index,
      class_name: kp.class_name ?? kp.class ?? null,
      x: kp.x,
      y: kp.y,
    })),
  );

  const width =
    payload.image?.width && payload.image.width > 0
      ? payload.image.width
      : imageWidth;
  const height =
    payload.image?.height && payload.image.height > 0
      ? payload.image.height
      : imageHeight;

  if (width <= 0 || height <= 0) {
    throw new Error("Invalid image dimensions for Roboflow keypoint normalization");
  }

  const validIds = new Set(LANDMARKS.map((landmark) => landmark.id));
  const landmarks: Record<string, DetectedLandmarkPoint> = {};

  for (const kp of keypoints) {
    const id = normalizeKeypointName(keypointClassName(kp));
    if (!validIds.has(id as LandmarkId)) continue;
    if (typeof kp.x !== "number" || typeof kp.y !== "number") continue;
    if (kp.confidence !== undefined && kp.confidence <= 0) continue;

    landmarks[id] = {
      x: clamp01(kp.x / width),
      y: clamp01(kp.y / height),
    };
  }

  for (const landmark of LANDMARKS) {
    if (!landmarks[landmark.id]) {
      throw new Error(`Roboflow missing keypoint: ${landmark.id}`);
    }
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
  console.log(
    "[roboflow-inference] base64 after strip (first 100 chars):",
    base64Value.slice(0, 100),
  );
  console.log("[roboflow-inference] base64 length:", base64Value.length);

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
