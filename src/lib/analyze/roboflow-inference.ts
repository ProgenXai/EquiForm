import {
  FRONT_LANDMARKS,
  HIND_LANDMARKS,
  type CalibrationViewMode,
  type LandmarkDefinition,
  type LandmarkId,
} from "@/lib/calibration/landmarks";

import type { DetectedLandmarkPoint } from "@/lib/analyze/types";

const ROBOFLOW_SERVERLESS = "https://serverless.roboflow.com";

type LandmarkMappingEntry = {
  roboflow: string;
  outputId: LandmarkId;
};

const SIDE_LANDMARK_ORDER: LandmarkMappingEntry[] = [
  { roboflow: "poll", outputId: "poll" },
  { roboflow: "point-of-shoulder", outputId: "shoulder" },
  { roboflow: "forearm", outputId: "forearm" },
  { roboflow: "knee", outputId: "front_knee" },
  { roboflow: "front-fetlock", outputId: "front_fetlock" },
  { roboflow: "front-hoof", outputId: "front_hoof" },
  { roboflow: "withers", outputId: "withers" },
  { roboflow: "girth", outputId: "girth" },
  { roboflow: "loin", outputId: "loin" },
  { roboflow: "flank", outputId: "flank" },
  { roboflow: "point-of-hip", outputId: "point_of_hip" },
  { roboflow: "tail-head", outputId: "tail" },
  { roboflow: "buttock", outputId: "buttock" },
  { roboflow: "stifle", outputId: "stifle" },
  { roboflow: "gaskin", outputId: "gaskin" },
  { roboflow: "hock", outputId: "hind_hock" },
  { roboflow: "hind-fetlock", outputId: "hind_fetlock" },
  { roboflow: "hind-hoof", outputId: "hind_hoof" },
];

function landmarkIdToRoboflowLabel(id: LandmarkId): string {
  return id.replace(/_/g, "-");
}

function mappingsFromDefinitions(
  definitions: LandmarkDefinition[],
): LandmarkMappingEntry[] {
  return definitions.map((landmark) => ({
    roboflow: landmarkIdToRoboflowLabel(landmark.id),
    outputId: landmark.id,
  }));
}

const FRONT_LANDMARK_ORDER = mappingsFromDefinitions(FRONT_LANDMARKS);
const HIND_LANDMARK_ORDER = mappingsFromDefinitions(HIND_LANDMARKS);

const FRONT_KP_INDEX_MAP: string[] = [
  "poll", // kp_0
  "left_ear", // kp_1
  "right_ear", // kp_2
  "left_eye", // kp_3
  "right_eye", // kp_4
  "muzzle", // kp_5
  "left_point_of_shoulder", // kp_6
  "right_point_of_shoulder", // kp_7
  "left_knee", // kp_8
  "right_knee", // kp_9
  "left_front_fetlock", // kp_10
  "right_front_fetlock", // kp_11
  "left_front_hoof", // kp_12
  "right_front_hoof", // kp_13
];

const HIND_KP_INDEX_MAP: string[] = [
  "tail", // kp_0
  "left_point_of_hip", // kp_1
  "right_point_of_hip", // kp_2
  "left_buttock", // kp_3
  "right_buttock", // kp_4
  "left_gaskin", // kp_5
  "right_gaskin", // kp_6
  "left_hock", // kp_7
  "right_hock", // kp_8
  "left_hind_fetlock", // kp_9
  "right_hind_fetlock", // kp_10
  "left_hind_hoof", // kp_11
  "right_hind_hoof", // kp_12
];

function getLandmarkOrderForView(
  viewMode: CalibrationViewMode,
): LandmarkMappingEntry[] {
  switch (viewMode) {
    case "front":
      return FRONT_LANDMARK_ORDER;
    case "hind":
      return HIND_LANDMARK_ORDER;
    case "side":
    case "left":
    case "right":
    default:
      return SIDE_LANDMARK_ORDER;
  }
}

function getModelIdForView(viewMode: CalibrationViewMode): string {
  switch (viewMode) {
    case "front":
      return process.env.ROBOFLOW_FRONT_MODEL_ID?.trim() ?? "";
    case "hind":
      return process.env.ROBOFLOW_HIND_MODEL_ID?.trim() ?? "";
    case "side":
    case "left":
    case "right":
    default:
      return process.env.ROBOFLOW_MODEL_ID?.trim() ?? "";
  }
}

function getModelIdEnvVarName(viewMode: CalibrationViewMode): string {
  switch (viewMode) {
    case "front":
      return "ROBOFLOW_FRONT_MODEL_ID";
    case "hind":
      return "ROBOFLOW_HIND_MODEL_ID";
    default:
      return "ROBOFLOW_MODEL_ID";
  }
}

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

function indexKeypoints(
  keypoints: RoboflowKeypoint[],
): Record<string, RoboflowKeypoint> {
  const keypointByName: Record<string, RoboflowKeypoint> = {};

  for (const kp of keypoints) {
    const className = keypointClassName(kp);
    if (!className) continue;

    keypointByName[className] = kp;
    keypointByName[normalizeKeypointName(className)] = kp;

    if (kp.class && kp.class !== className) {
      keypointByName[kp.class] = kp;
    }
  }

  return keypointByName;
}

function findKeypoint(
  keypointByName: Record<string, RoboflowKeypoint>,
  entry: LandmarkMappingEntry,
): RoboflowKeypoint | undefined {
  return (
    keypointByName[entry.roboflow] ??
    keypointByName[entry.outputId] ??
    keypointByName[normalizeKeypointName(entry.roboflow)]
  );
}

function parseKeypointIndex(className: string): number | null {
  const kpMatch = className.match(/^kp_(\d+)$/);
  if (kpMatch) {
    return Number.parseInt(kpMatch[1]!, 10);
  }

  if (/^\d+$/.test(className)) {
    return Number.parseInt(className, 10);
  }

  return null;
}

function usesIndexBasedKeypoints(keypoints: RoboflowKeypoint[]): boolean {
  if (keypoints.length === 0) {
    return false;
  }

  let indexNamedCount = 0;

  for (const kp of keypoints) {
    const className = keypointClassName(kp);
    if (className && parseKeypointIndex(className) !== null) {
      indexNamedCount++;
    }
  }

  return indexNamedCount > 0;
}

function getIndexMapForView(viewMode: CalibrationViewMode): string[] | null {
  switch (viewMode) {
    case "front":
      return FRONT_KP_INDEX_MAP;
    case "hind":
      return HIND_KP_INDEX_MAP;
    default:
      return null;
  }
}

function indexKeypointsByOrder(
  keypoints: RoboflowKeypoint[],
): Record<number, RoboflowKeypoint> {
  const keypointByIndex: Record<number, RoboflowKeypoint> = {};

  for (let i = 0; i < keypoints.length; i++) {
    const kp = keypoints[i]!;
    const className = keypointClassName(kp);
    const parsedIndex = className ? parseKeypointIndex(className) : null;
    keypointByIndex[parsedIndex ?? i] = kp;
  }

  return keypointByIndex;
}

function landmarkFromKeypoint(
  kp: RoboflowKeypoint | undefined,
  width: number,
  height: number,
): DetectedLandmarkPoint {
  if (
    !kp ||
    typeof kp.x !== "number" ||
    typeof kp.y !== "number" ||
    (kp.confidence !== undefined && kp.confidence <= 0)
  ) {
    return { x: 0, y: 0 };
  }

  return {
    x: clamp01(kp.x / width),
    y: clamp01(kp.y / height),
  };
}

function parseIndexBasedLandmarks(
  keypoints: RoboflowKeypoint[],
  indexMap: string[],
  width: number,
  height: number,
): Record<string, DetectedLandmarkPoint> {
  const keypointByIndex = indexKeypointsByOrder(keypoints);
  const landmarks: Record<string, DetectedLandmarkPoint> = {};

  for (let i = 0; i < indexMap.length; i++) {
    const landmarkId = indexMap[i]!;
    landmarks[landmarkId] = landmarkFromKeypoint(
      keypointByIndex[i],
      width,
      height,
    );
  }

  return landmarks;
}

/** Parse Roboflow serverless keypoint detection JSON into normalized landmark map. */
export function parseRoboflowKeypointResponse(
  data: unknown,
  imageWidth: number,
  imageHeight: number,
  viewMode: CalibrationViewMode = "side",
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

  const roboflowWidth = payload.image?.width;
  const roboflowHeight = payload.image?.height;

  const width =
    roboflowWidth && roboflowWidth > 0 ? roboflowWidth : imageWidth;
  const height =
    roboflowHeight && roboflowHeight > 0 ? roboflowHeight : imageHeight;

  if (width <= 0 || height <= 0) {
    throw new Error("Invalid image dimensions for Roboflow keypoint normalization");
  }

  const indexMap = getIndexMapForView(viewMode);
  if (indexMap && usesIndexBasedKeypoints(keypoints)) {
    return parseIndexBasedLandmarks(keypoints, indexMap, width, height);
  }

  const landmarks: Record<string, DetectedLandmarkPoint> = {};
  const landmarkOrder = getLandmarkOrderForView(viewMode);
  const keypointByName = indexKeypoints(keypoints);

  for (const entry of landmarkOrder) {
    const kp = findKeypoint(keypointByName, entry);

    landmarks[entry.outputId] = landmarkFromKeypoint(kp, width, height);
  }

  return landmarks;
}

/** Run trained Roboflow keypoint model on a base64-encoded image (no data: URL prefix). */
export async function detectLandmarksWithRoboflow(
  imageBase64: string,
  imageWidth: number,
  imageHeight: number,
  viewMode: CalibrationViewMode = "side",
): Promise<Record<string, DetectedLandmarkPoint>> {
  const apiKey = process.env.ROBOFLOW_API_KEY?.trim();
  const modelId = getModelIdForView(viewMode);
  const modelIdEnvVar = getModelIdEnvVarName(viewMode);

  if (!apiKey || !modelId) {
    throw new Error(
      `ROBOFLOW_API_KEY and ${modelIdEnvVar} must be configured`,
    );
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

  return parseRoboflowKeypointResponse(data, imageWidth, imageHeight, viewMode);
}
