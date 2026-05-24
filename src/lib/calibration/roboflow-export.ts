import sharp from "sharp";

import { LANDMARKS, type LandmarkId, type Point } from "@/lib/calibration/landmarks";

const ROBOFLOW_API = "https://api.roboflow.com";
const HORSE_CATEGORY = "horse";

/** Roboflow keypoint template order and label strings. */
const ROBOFLOW_KEYPOINT_ORDER = [
  "poll",
  "withers",
  "loin",
  "girth",
  "point-of-shoulder",
  "flank",
  "tail-head",
  "hock",
  "hind-fetlock",
  "forearm",
  "knee",
  "front-fetlock",
  "front-hoof",
  "buttock",
  "gaskin",
  "stifle",
  "point-of-hip",
  "hind-hoof",
] as const;

const ROBOFLOW_TO_CANONICAL: Record<string, LandmarkId> = {
  poll: "poll",
  withers: "withers",
  loin: "loin",
  girth: "girth",
  "point-of-shoulder": "shoulder",
  flank: "flank",
  "tail-head": "tail",
  hock: "hind_hock",
  "hind-fetlock": "hind_fetlock",
  forearm: "forearm",
  knee: "front_knee",
  "front-fetlock": "front_fetlock",
  "front-hoof": "front_hoof",
  buttock: "buttock",
  gaskin: "gaskin",
  stifle: "stifle",
  "point-of-hip": "point_of_hip",
  "hind-hoof": "hind_hoof",
};

type RoboflowConfig = {
  apiKey: string;
  workspace: string;
  project: string;
};

type RoboflowUploadResponse = {
  success?: boolean;
  duplicate?: boolean;
  id?: string | number;
  image_id?: string | number;
  image?: { id?: string | number };
  message?: string;
  error?: string | { message?: string };
  [key: string]: unknown;
};

function logRoboflowApiResponse(
  label: string,
  status: number,
  parsed: unknown,
  raw: string,
): void {
  console.log(`[roboflow-export] ${label} (HTTP ${status})`, {
    response: parsed,
    raw,
  });
}

function extractImageIdFromUploadResponse(
  data: RoboflowUploadResponse,
): string | null {
  const candidates = [data.id, data.image_id, data.image?.id];
  for (const value of candidates) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return null;
}

function getRoboflowConfig(): RoboflowConfig | null {
  const apiKey = process.env.ROBOFLOW_API_KEY?.trim();
  const workspace = process.env.ROBOFLOW_WORKSPACE?.trim();
  const project = process.env.ROBOFLOW_PROJECT?.trim();

  if (!apiKey || !workspace || !project) {
    return null;
  }

  return { apiKey, workspace, project };
}

function sanitizeFilename(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "calibration";
}

/** Calibration landmarks are normalized 0–1; convert to pixel coords for COCO. */
function toPixelPoint(
  point: Point,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: Math.round(point.x * width),
    y: Math.round(point.y * height),
  };
}

function buildCocoKeypointAnnotation(
  fileName: string,
  width: number,
  height: number,
  pixelPoints: Partial<Record<LandmarkId, { x: number; y: number }>>,
) {
  const keypoints: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  let numKeypoints = 0;

  for (const roboflowLabel of ROBOFLOW_KEYPOINT_ORDER) {
    const canonicalId = ROBOFLOW_TO_CANONICAL[roboflowLabel];
    const point = pixelPoints[canonicalId];
    if (point) {
      keypoints.push(point.x, point.y, 2);
      xs.push(point.x);
      ys.push(point.y);
      numKeypoints += 1;
    } else {
      keypoints.push(0, 0, 0);
    }
  }

  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxX = xs.length ? Math.max(...xs) : width;
  const maxY = ys.length ? Math.max(...ys) : height;
  const bboxWidth = Math.max(1, maxX - minX);
  const bboxHeight = Math.max(1, maxY - minY);

  return {
    images: [
      {
        id: 0,
        file_name: fileName,
        width,
        height,
      },
    ],
    annotations: [
      {
        id: 0,
        image_id: 0,
        category_id: 0,
        keypoints,
        num_keypoints: numKeypoints,
        bbox: [minX, minY, bboxWidth, bboxHeight],
        area: bboxWidth * bboxHeight,
        iscrowd: 0,
      },
    ],
    categories: [
      {
        id: 0,
        name: HORSE_CATEGORY,
        supercategory: HORSE_CATEGORY,
        keypoints: [
          "poll",
          "withers",
          "loin",
          "girth",
          "point-of-shoulder",
          "flank",
          "tail-head",
          "hock",
          "hind-fetlock",
          "forearm",
          "knee",
          "front-fetlock",
          "front-hoof",
          "buttock",
          "gaskin",
          "stifle",
          "point-of-hip",
          "hind-hoof",
        ],
        skeleton: [],
      },
    ],
  };
}

async function fetchImage(
  photoUrl: string,
): Promise<{ buffer: Buffer; contentType: string; width: number; height: number }> {
  const response = await fetch(photoUrl, { headers: { Accept: "image/*" } });
  if (!response.ok) {
    throw new Error(`Failed to fetch calibration image (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const meta = await sharp(buffer).metadata();

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new Error("Could not read image dimensions for Roboflow export");
  }

  return { buffer, contentType, width, height };
}

function extensionForContentType(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

async function postMultipartUpload(
  uploadUrl: string,
  apiKey: string,
  fileName: string,
  buffer: Buffer,
  contentType: string,
  tag: string,
): Promise<RoboflowUploadResponse> {
  const form = new FormData();
  form.append("name", fileName);
  form.append("split", "train");
  form.append("tag", tag);
  form.append(
    "file",
    new Blob([Uint8Array.from(buffer)], { type: contentType }),
    fileName,
  );

  const url = new URL(uploadUrl);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url.toString(), {
    method: "POST",
    body: form,
  });

  const raw = await response.text();
  let data: RoboflowUploadResponse = {};
  try {
    data = raw ? (JSON.parse(raw) as RoboflowUploadResponse) : {};
  } catch {
    data = { message: raw };
  }

  logRoboflowApiResponse(
    `Upload API response (${uploadUrl})`,
    response.status,
    data,
    raw,
  );

  if (!response.ok) {
    const err =
      typeof data.error === "string"
        ? data.error
        : data.error?.message ?? data.message ?? response.statusText;
    throw new Error(`Roboflow upload failed (${response.status}): ${err}`);
  }

  if (!data.success && !data.duplicate) {
    throw new Error(
      data.message ?? "Roboflow upload did not return success",
    );
  }

  return data;
}

async function uploadImageToRoboflow(
  config: RoboflowConfig,
  fileName: string,
  buffer: Buffer,
  contentType: string,
  tag: string,
): Promise<string> {
  const uploadUrls = [
    `${ROBOFLOW_API}/${config.workspace}/${config.project}/upload`,
    `${ROBOFLOW_API}/dataset/${config.project}/upload`,
  ];

  let lastError: Error | null = null;

  for (const uploadUrl of uploadUrls) {
    try {
      const data = await postMultipartUpload(
        uploadUrl,
        config.apiKey,
        fileName,
        buffer,
        contentType,
        tag,
      );
      const imageId = extractImageIdFromUploadResponse(data);
      if (imageId) {
        return imageId;
      }
      lastError = new Error(
        "Roboflow upload succeeded but returned no image id — see upload response log",
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Roboflow image upload failed");
}

async function annotateImageOnRoboflow(
  config: RoboflowConfig,
  imageId: string,
  annotationName: string,
  annotation: ReturnType<typeof buildCocoKeypointAnnotation>,
): Promise<void> {
  const annotateUrl = `${ROBOFLOW_API}/dataset/${config.project}/annotate/${imageId}`;
  const url = new URL(annotateUrl);
  url.searchParams.set("api_key", config.apiKey);
  url.searchParams.set("name", annotationName);
  url.searchParams.set("overwrite", "true");

  const cocoBody = JSON.stringify(annotation);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: cocoBody,
  });

  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // keep raw text
  }

  logRoboflowApiResponse(
    `Annotate API response (${annotateUrl})`,
    response.status,
    parsed,
    raw,
  );

  const data = (typeof parsed === "object" && parsed !== null
    ? parsed
    : {}) as {
    success?: boolean;
    warn?: string;
    error?: string | { message?: string };
  };

  if (response.status === 409 && data.warn === "already annotated") {
    return;
  }

  if (!response.ok) {
    const err =
      typeof data.error === "string"
        ? data.error
        : data.error?.message ?? response.statusText;
    throw new Error(`Roboflow annotate failed (${response.status}): ${err}`);
  }

  if (data.success === false) {
    throw new Error("Roboflow annotation upload did not succeed");
  }
}

/**
 * Upload calibration image and 18 keypoints to Roboflow.
 * Failures are logged and swallowed — callers should not treat this as fatal.
 */
export async function exportCalibrationToRoboflow(options: {
  horseName: string;
  photoUrl: string;
  landmarks: Partial<Record<LandmarkId, Point>>;
}): Promise<void> {
  const config = getRoboflowConfig();
  if (!config) {
    console.warn("[roboflow-export] Missing ROBOFLOW_* env vars — skipping export");
    return;
  }

  const photoUrl = options.photoUrl.trim();
  if (!photoUrl) {
    console.warn("[roboflow-export] No photo URL — skipping export");
    return;
  }

  const { buffer, contentType, width, height } = await fetchImage(photoUrl);

  const pixelPoints: Partial<Record<LandmarkId, { x: number; y: number }>> = {};
  for (const landmark of LANDMARKS) {
    const point = options.landmarks[landmark.id];
    if (!point) continue;
    pixelPoints[landmark.id] = toPixelPoint(point, width, height);
  }

  const firstThreeKeypoints = LANDMARKS.slice(0, 3).map((landmark) => {
    const pixel = pixelPoints[landmark.id];
    const source = options.landmarks[landmark.id];
    return {
      id: landmark.id,
      fractional: source ? { x: source.x, y: source.y } : null,
      pixel: pixel ?? null,
    };
  });
  console.log("[roboflow-export] First 3 keypoint pixel coordinates", {
    imageWidth: width,
    imageHeight: height,
    keypoints: firstThreeKeypoints,
  });

  const ext = extensionForContentType(contentType);
  const fileName = `${sanitizeFilename(options.horseName)}-${Date.now()}.${ext}`;
  const annotationName = `${fileName}.coco.json`;
  const annotation = buildCocoKeypointAnnotation(
    fileName,
    width,
    height,
    pixelPoints,
  );

  const imageId = await uploadImageToRoboflow(
    config,
    fileName,
    buffer,
    contentType,
    options.horseName,
  );

  console.log("[roboflow-export] Upload complete — attaching annotation", {
    imageId,
    fileName,
    keypointCount: annotation.annotations[0]?.keypoints.length ?? 0,
  });

  await annotateImageOnRoboflow(
    config,
    imageId,
    annotationName,
    annotation,
  );

  console.log("[roboflow-export] Exported calibration", {
    horseName: options.horseName,
    imageId,
    fileName,
  });
}
