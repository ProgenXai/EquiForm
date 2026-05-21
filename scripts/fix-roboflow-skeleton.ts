/**
 * One-time script: update Roboflow "horse" class skeleton edges.
 * Run: npm run fix-skeleton
 *
 * Uses POST /{workspace}/{project}/annotate/{imageId} with a COCO JSON file.
 * COCO category skeleton uses 1-based keypoint indices; we convert from our
 * 0-based LANDMARKS order by adding 1 to each index in each pair.
 */

import * as fs from "fs";
import * as path from "path";

const API_BASE = "https://api.roboflow.com";
const CLASS_NAME = "horse";

/** 0-based vertex index pairs (LANDMARKS order). */
const SKELETON_PAIRS: [number, number][] = [
  [0, 6],
  [6, 8],
  [8, 12],
  [12, 11],
  [6, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [1, 7],
  [7, 9],
  [10, 12],
  [10, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [16, 17],
];

const KEYPOINT_NAMES = [
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
];

/** Roboflow keypoint ids in LANDMARKS order (from existing project annotations). */
const ROBOFLOW_KEYPOINT_IDS = [15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30];

type EnvConfig = {
  apiKey: string;
  workspace: string;
  project: string;
};

type RoboflowImageResponse = {
  image?: {
    id: string;
    name: string;
    annotation?: {
      width: number;
      height: number;
      boxes?: {
        label: string;
        x: string;
        y: string;
        width: string;
        height: string;
        keypoints?: { id: number; x: string; y: string }[];
      }[];
    };
  };
};

type SearchResponse = {
  results?: { id: string }[];
};

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const vars: Record<string, string> = {};
  const lines = fs.readFileSync(filePath, "utf8").split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  return vars;
}

function getConfig(): EnvConfig {
  const fileEnv = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const apiKey =
    process.env.ROBOFLOW_API_KEY?.trim() || fileEnv.ROBOFLOW_API_KEY?.trim();
  const workspace =
    process.env.ROBOFLOW_WORKSPACE?.trim() ||
    fileEnv.ROBOFLOW_WORKSPACE?.trim();
  const project =
    process.env.ROBOFLOW_PROJECT?.trim() || fileEnv.ROBOFLOW_PROJECT?.trim();

  if (!apiKey || !workspace || !project) {
    throw new Error(
      "Missing ROBOFLOW_API_KEY, ROBOFLOW_WORKSPACE, or ROBOFLOW_PROJECT in environment or .env.local",
    );
  }

  return { apiKey, workspace, project };
}

async function roboflowRequest(
  method: string,
  urlPath: string,
  apiKey: string,
  body?: unknown,
): Promise<{ status: number; data: unknown; raw: string }> {
  const url = new URL(`${API_BASE}${urlPath}`);
  url.searchParams.set("api_key", apiKey);

  const response = await fetch(url.toString(), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let data: unknown = raw;

  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // keep raw text
  }

  return { status: response.status, data, raw };
}

function logResponse(
  label: string,
  result: { status: number; data: unknown; raw: string },
) {
  console.log(`\n=== ${label} (HTTP ${result.status}) ===`);
  if (typeof result.data === "object" && result.data !== null) {
    const copy = JSON.parse(JSON.stringify(result.data)) as Record<string, unknown>;
    const image = (copy.image ?? {}) as Record<string, unknown>;
    if (Array.isArray(image.embedding)) {
      image.embedding = `[omitted ${image.embedding.length} floats]`;
    }
    console.log(JSON.stringify(copy, null, 2));
  } else {
    console.log(result.raw || result.data);
  }
}

function toCocoSkeleton(pairs: [number, number][]): [number, number][] {
  return pairs.map(([from, to]) => [from + 1, to + 1]);
}

function buildCocoAnnotation(
  image: NonNullable<RoboflowImageResponse["image"]>,
): string {
  const annotation = image.annotation;
  if (!annotation?.boxes?.length) {
    throw new Error("Reference image has no bounding box / keypoint annotation");
  }

  const horseBox = annotation.boxes.find((b) => b.label === CLASS_NAME);
  if (!horseBox?.keypoints?.length) {
    throw new Error(`Reference image has no "${CLASS_NAME}" keypoints`);
  }

  const kpById = Object.fromEntries(
    horseBox.keypoints.map((kp) => [kp.id, kp]),
  );

  const keypointsFlat: number[] = [];
  for (const id of ROBOFLOW_KEYPOINT_IDS) {
    const kp = kpById[id];
    if (!kp) {
      throw new Error(
        `Missing keypoint id ${id} on reference image — project skeleton may differ from expected LANDMARKS order`,
      );
    }
    keypointsFlat.push(parseFloat(kp.x), parseFloat(kp.y), 2);
  }

  const bx = parseFloat(horseBox.x);
  const by = parseFloat(horseBox.y);
  const bw = parseFloat(horseBox.width);
  const bh = parseFloat(horseBox.height);

  const coco = {
    images: [
      {
        id: 0,
        file_name: image.name,
        width: annotation.width,
        height: annotation.height,
      },
    ],
    categories: [
      {
        id: 1,
        name: CLASS_NAME,
        keypoints: KEYPOINT_NAMES,
        skeleton: toCocoSkeleton(SKELETON_PAIRS),
      },
    ],
    annotations: [
      {
        id: 1,
        image_id: 0,
        category_id: 1,
        num_keypoints: KEYPOINT_NAMES.length,
        keypoints: keypointsFlat,
        bbox: [bx - bw / 2, by - bh / 2, bw, bh],
        area: bw * bh,
        iscrowd: 0,
      },
    ],
  };

  return JSON.stringify(coco);
}

async function findAnnotatedImageId(
  config: EnvConfig,
): Promise<string> {
  const searchPath = `/${config.workspace}/${config.project}/search`;
  const searchResult = await roboflowRequest("POST", searchPath, config.apiKey, {
    query: "*",
    pageSize: 10,
    fields: ["id", "annotations"],
  });
  logResponse(`POST ${searchPath}`, searchResult);

  if (searchResult.status < 200 || searchResult.status >= 300) {
    throw new Error(`Image search failed (${searchResult.status})`);
  }

  const results = (searchResult.data as SearchResponse).results ?? [];
  const annotated = results.find((r) => r.id);
  if (!annotated?.id) {
    throw new Error("No annotated images found in project — upload one first");
  }

  return annotated.id;
}

async function main() {
  const config = getConfig();
  console.log("Roboflow skeleton fix");
  console.log(`  workspace: ${config.workspace}`);
  console.log(`  project:   ${config.project}`);
  console.log(`  class:     ${CLASS_NAME}`);
  console.log(`  edges:     ${SKELETON_PAIRS.length} connections (0-based)`);

  console.log("\nCOCO skeleton pairs (1-based for upload):");
  for (const [from, to] of toCocoSkeleton(SKELETON_PAIRS)) {
    console.log(`  ${from} → ${to}`);
  }

  const imageId = await findAnnotatedImageId(config);
  console.log(`\nUsing reference image: ${imageId}`);

  const imagePath = `/${config.workspace}/${config.project}/images/${imageId}`;
  const imageResult = await roboflowRequest("GET", imagePath, config.apiKey);
  logResponse(`GET ${imagePath}`, imageResult);

  if (imageResult.status < 200 || imageResult.status >= 300) {
    throw new Error(`Failed to load reference image (${imageResult.status})`);
  }

  const imageData = imageResult.data as RoboflowImageResponse;
  if (!imageData.image) {
    throw new Error("Reference image response missing image payload");
  }

  const annotationFile = buildCocoAnnotation(imageData.image);
  const annotatePath = `/${config.workspace}/${config.project}/annotate/${imageId}?name=conformation-skeleton-fix.coco.json&overwrite=true`;

  const annotateResult = await roboflowRequest(
    "POST",
    annotatePath,
    config.apiKey,
    {
      annotationFile,
      labelmap: {},
    },
  );
  logResponse(`POST ${annotatePath}`, annotateResult);

  if (annotateResult.status < 200 || annotateResult.status >= 300) {
    console.error("\nSkeleton update failed. See API response above.");
    process.exit(1);
  }

  console.log(
    "\nDone — COCO annotation uploaded with updated horse skeleton edges.",
  );
  console.log(
    "Verify in Roboflow: Classes → horse → Edit Keypoints (connections should match).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
