import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import sharp from "sharp";

import { parseReportResponse } from "@/lib/analyze/landmark-parser";
import type { AnthropicImageMediaType } from "@/lib/analyze/media-types";
import { detectLandmarksWithRoboflow } from "@/lib/analyze/roboflow-inference";
import {
  CONFORMATION_REPORT_PROMPT,
  FRONT_CONFORMATION_REPORT_PROMPT,
  HIND_CONFORMATION_REPORT_PROMPT,
} from "@/lib/analyze/prompt";
import type { ConformationReport } from "@/lib/analyze/types";
import type { CalibrationViewMode } from "@/lib/calibration/landmarks";
import { formatDisciplineList } from "@/lib/format-discipline";
import { formatAnalysisError } from "@/lib/user-facing-errors";

const MAX_BYTES = 10 * 1024 * 1024;
const ANTHROPIC_MAX_BYTES = 3145728;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const FULL_REPORT_VIEW_KEYS = ["left", "right", "front", "hind"] as const;
type FullReportViewKey = (typeof FULL_REPORT_VIEW_KEYS)[number];

const ROBOFLOW_VIEW_MODE: Record<FullReportViewKey, CalibrationViewMode> = {
  left: "left",
  right: "right",
  front: "front",
  hind: "hind",
};

const IMAGE_VALIDATION_SYSTEM_PROMPT =
  'You are an image validator for a horse conformation analysis app. Respond with only valid JSON: {"valid": true} or {"valid": false}';

const SIDE_PROFILE_VALIDATION_PROMPT =
  "Does this image show a horse in a side profile view suitable for conformation analysis? Accept if: the horse is facing left or right, the horse is standing still or nearly still, and the horse is reasonably visible from head to tail. Minor issues like shadows, tail touching a leg, lead rope, halter, fence, or barn background are always acceptable. Only reject if you are highly confident the image is clearly unsuitable — for example, the horse is facing directly toward or away from the camera, the horse is running or jumping, the photo is so blurry or dark the horse cannot be evaluated, or there is no horse in the image at all. When in doubt, accept.";

const FRONT_VIEW_VALIDATION_PROMPT =
  "Does this image show a single horse in a front or near-front view suitable for conformation analysis? Accept if: the horse is facing toward the camera (within roughly 45 degrees), the horse is standing still or nearly still, and the horse fills a reasonable portion of the frame. A lead rope or halter is always acceptable and should never cause rejection. Reject only if: there is no horse, the horse is in full side profile, the horse is facing completely away, or the horse is clearly running or jumping.";

const HIND_VIEW_VALIDATION_PROMPT =
  "Does this image show a single horse from behind or near-behind, suitable for hind conformation analysis? Accept if: the horse is generally facing away from the camera (within roughly 45 degrees), the hindquarters and at least one hind leg are visible, and the horse is standing or nearly standing still. Reject only if: there is no horse visible, the horse is in full side profile, the horse is clearly running or jumping, or a person or large object is completely blocking the hindquarters. Do not reject for slight angle, tail position, partial front leg visibility, lighting, or coat color.";

const UNKNOWN_ANGLE_VALIDATION_PROMPT =
  "Does this image show a horse that can be used for conformation analysis, even if the camera angle is imperfect or undetermined? Accept if a horse is clearly visible and standing or nearly standing still. Reject only if there is no horse, the image is so blurry or dark the horse cannot be evaluated, or the horse is clearly running or jumping. When in doubt, accept.";

const IMAGE_VALIDATION_USER_PROMPTS: Record<FullReportViewKey, string> = {
  left: SIDE_PROFILE_VALIDATION_PROMPT,
  right: SIDE_PROFILE_VALIDATION_PROMPT,
  front: FRONT_VIEW_VALIDATION_PROMPT,
  hind: HIND_VIEW_VALIDATION_PROMPT,
};

const COAT_COLOR_DETECTION_PROMPT_SIDE =
  'You are examining a horse SIDE PROFILE photo. 1) Identify the base coat color (must be one of: black, bay, dark_bay, chestnut, sorrel, gray, dun, buckskin, palomino, roan, cremello, pinto). 2) Look carefully for white markings visible from this side: FACE - star (white spot on forehead), snip (white on muzzle), stripe (narrow white line down face), blaze (wide white stripe down face). LEGS - only report leg markings you can CLEARLY see on the legs visible in this side view. Do NOT guess or assume markings you cannot clearly see. Return ONLY valid JSON: { "coat": "black", "markings": ["star", "snip"] }';

const COAT_COLOR_DETECTION_PROMPT_FRONT =
  'You are examining a horse FRONT VIEW photo. Look carefully at what you can clearly see: FACE markings - star (white spot on forehead), snip (white isolated specifically between or on the nostrils, NOT part of a blaze), blaze (wide white stripe down face). FRONT LEGS - only report right_sock or left_sock if you can clearly see white on the front leg itself from the knee or cannon bone down to the hoof. Do NOT report a front sock if the white is visible behind the front legs, between the legs, or on the hind feet peeking through from behind. White fencing or background does not count. Only report what you can definitively confirm is on a front leg. Return ONLY valid JSON: { "coat": "bay", "markings": ["blaze"] }';

const COAT_COLOR_DETECTION_PROMPT_HIND =
  'You are examining a horse HIND VIEW photo showing the rear of the horse. Look carefully ONLY at the hind legs. If a hind leg clearly has white on it report right_hind_sock or left_hind_sock. If a hind leg is clearly dark with no white do NOT report a sock. Only report what you can clearly confirm from this view. Return ONLY valid JSON: { "coat": "black", "markings": ["right_hind_sock", "left_hind_sock"] }';

const COAT_COLOR_DETECTION_PROMPT_SIDE_RIGHT =
  'You are examining a horse RIGHT SIDE PROFILE photo. 1) Identify the base coat color (must be one of: black, bay, dark_bay, chestnut, sorrel, gray, dun, buckskin, palomino, roan, cremello, pinto). 2) Look carefully for white markings visible from the right side. Only report markings you can CLEARLY see. Return ONLY valid JSON: { "coat": "black", "markings": ["right_sock"] }';

const VALID_COAT_COLORS = new Set([
  "black",
  "bay",
  "dark_bay",
  "chestnut",
  "sorrel",
  "gray",
  "dun",
  "buckskin",
  "palomino",
  "roan",
  "cremello",
  "pinto",
]);

const REPORT_PROMPTS: Record<FullReportViewKey, string> = {
  left: CONFORMATION_REPORT_PROMPT,
  right: CONFORMATION_REPORT_PROMPT,
  front: FRONT_CONFORMATION_REPORT_PROMPT,
  hind: HIND_CONFORMATION_REPORT_PROMPT,
};

const INVALID_IMAGE_ERROR =
  "One or more photos didn't meet the criteria. Please review the photo guidelines and resubmit.";

const LANDMARK_DETECTION_USER_ERROR =
  "We couldn't detect horse landmarks in this photo. Please try a photo with better lighting, contrast, and the horse standing square.";

const FULL_REPORT_VIEW_LABELS: Record<FullReportViewKey, string> = {
  left: "Left Side",
  right: "Right Side",
  front: "Front View",
  hind: "Hind View",
};

const ROBOFLOW_LANDMARK_FAILURE_MESSAGES = new Set([
  "Roboflow returned no predictions",
  "Roboflow horse prediction has no keypoints",
  "Roboflow low confidence detection",
]);

const MARKING_NAMES: Record<string, string> = {
  blaze: "blaze",
  stripe: "stripe down the face",
  star: "star on the forehead",
  snip: "snip on the muzzle",
  left_sock: "left front sock",
  right_sock: "right front sock",
  left_stocking: "left front stocking",
  right_stocking: "right front stocking",
};

export const maxDuration = 300;

/** Simplified view tag returned in views_analyzed for the matching engine. */
type ProgenXaiViewTag = "side" | "front" | "hind" | "unknown";

type ProgenXaiImageInput = {
  url?: string;
  imageUrl?: string;
  image_url?: string;
  view?: string;
  view_type?: string;
  viewType?: string;
  angle?: string;
};

type ProgenXaiAnalyzeRequestBody = {
  leftUrl?: string;
  rightUrl?: string;
  frontUrl?: string;
  hindUrl?: string;
  sideUrl?: string;
  unknownUrl?: string;
  /** ProgenXai stallion map: left_side / right_side / front / hind / side / unknown */
  photo_urls?: Partial<Record<string, string>>;
  /** Tagged image list (1–4). Each entry needs a URL + view tag. */
  images?: ProgenXaiImageInput[];
  photos?: ProgenXaiImageInput[];
  horseName?: string;
  horse_name?: string;
  breed?: string;
  coatColor?: string;
  age?: string | number | null;
  sex?: string;
  discipline?: string;
};

type ResolvedProgenXaiView = {
  /** Internal pipeline slot (Roboflow / prompts). */
  slot: FullReportViewKey;
  /** Public tag for views_analyzed. */
  tag: ProgenXaiViewTag;
  url: string;
};

const FULL_REPORT_URL_FIELDS: Record<
  FullReportViewKey,
  keyof ProgenXaiAnalyzeRequestBody
> = {
  left: "leftUrl",
  right: "rightUrl",
  front: "frontUrl",
  hind: "hindUrl",
};

/** Normalize caller view labels into public tags or specific side slots. */
function normalizeViewTag(
  raw: string,
): ProgenXaiViewTag | "left" | "right" | null {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (key) {
    case "left":
    case "lefturl":
    case "left_side":
    case "leftside":
      return "left";
    case "right":
    case "righturl":
    case "right_side":
    case "rightside":
      return "right";
    case "side":
    case "side_profile":
    case "sideprofile":
    case "profile":
      return "side";
    case "front":
    case "fronturl":
      return "front";
    case "hind":
    case "hindurl":
    case "rear":
    case "back":
      return "hind";
    case "unknown":
    case "unknown_angle":
    case "unknownangle":
    case "undetermined":
    case "other":
      return "unknown";
    default:
      return null;
  }
}

function publicTagForSlotOrLabel(
  label: ProgenXaiViewTag | FullReportViewKey,
): ProgenXaiViewTag {
  if (label === "left" || label === "right" || label === "side") return "side";
  if (label === "front") return "front";
  if (label === "hind") return "hind";
  return "unknown";
}

function pipelineSlotForTag(
  tag: ProgenXaiViewTag | FullReportViewKey,
  occupied: Partial<Record<FullReportViewKey, true>>,
): FullReportViewKey | null {
  if (tag === "front") return occupied.front ? null : "front";
  if (tag === "hind") return occupied.hind ? null : "hind";
  if (tag === "left") return occupied.left ? null : "left";
  if (tag === "right") return occupied.right ? null : "right";

  // "side" / "unknown" fill the next free side slot (left, then right).
  if (!occupied.left) return "left";
  if (!occupied.right) return "right";
  return null;
}

function extractImageUrl(entry: ProgenXaiImageInput): string | null {
  for (const candidate of [entry.url, entry.imageUrl, entry.image_url]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function extractImageViewLabel(entry: ProgenXaiImageInput): string | null {
  for (const candidate of [entry.view, entry.view_type, entry.viewType, entry.angle]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function resolveProvidedViews(
  body: ProgenXaiAnalyzeRequestBody,
): ResolvedProgenXaiView[] {
  const resolved: ResolvedProgenXaiView[] = [];
  const occupied: Partial<Record<FullReportViewKey, true>> = {};

  function tryAdd(url: string, label: ProgenXaiViewTag | FullReportViewKey) {
    if (resolved.length >= 4) return;
    const slot = pipelineSlotForTag(label, occupied);
    if (!slot) return;
    occupied[slot] = true;
    resolved.push({
      slot,
      tag: publicTagForSlotOrLabel(label),
      url,
    });
  }

  // Explicit left/right/front/hind URL fields first (most specific).
  for (const view of FULL_REPORT_VIEW_KEYS) {
    const urlField = FULL_REPORT_URL_FIELDS[view];
    const rawUrl = body[urlField];
    if (typeof rawUrl === "string" && rawUrl.trim()) {
      tryAdd(rawUrl.trim(), view);
    }
  }

  if (typeof body.sideUrl === "string" && body.sideUrl.trim()) {
    tryAdd(body.sideUrl.trim(), "side");
  }
  if (typeof body.unknownUrl === "string" && body.unknownUrl.trim()) {
    tryAdd(body.unknownUrl.trim(), "unknown");
  }

  if (body.photo_urls && typeof body.photo_urls === "object") {
    for (const [rawKey, rawUrl] of Object.entries(body.photo_urls)) {
      if (typeof rawUrl !== "string" || !rawUrl.trim()) continue;
      const normalized = normalizeViewTag(rawKey);
      if (!normalized) continue;
      tryAdd(rawUrl.trim(), normalized);
    }
  }

  const imageList = [
    ...(Array.isArray(body.images) ? body.images : []),
    ...(Array.isArray(body.photos) ? body.photos : []),
  ];
  for (const entry of imageList) {
    if (!entry || typeof entry !== "object") continue;
    const url = extractImageUrl(entry);
    if (!url) continue;
    const rawLabel = extractImageViewLabel(entry);
    const normalized = rawLabel ? normalizeViewTag(rawLabel) : "unknown";
    if (!normalized) {
      tryAdd(url, "unknown");
      continue;
    }
    tryAdd(url, normalized);
  }

  return resolved;
}

function averageSectionScores(
  reports: ConformationReport[],
  picker: (r: ConformationReport) => number,
): number | null {
  if (reports.length === 0) return null;
  return Math.round(
    reports.reduce((sum, r) => sum + picker(r), 0) / reports.length,
  );
}

/**
 * Structure-area visibility by view:
 * - Side (left/right): balance, shoulder, hip, topline, leg
 * - Front: balance, leg (front-end traits only — not true side shoulder/hip/topline)
 * - Hind: balance, hip, leg (not true side shoulder/topline)
 *
 * Unassessable areas are null / not_assessed — never filled with a neutral average.
 */
function combineAvailableReports(
  reportsByView: Partial<Record<FullReportViewKey, ConformationReport>>,
): {
  overall_score: number | null;
  balance_score: number | null;
  shoulder_score: number | null;
  hip_score: number | null;
  topline_score: number | null;
  leg_score: number | null;
  report_text: string;
  betterSide: "left" | "right" | null;
} {
  const present = FULL_REPORT_VIEW_KEYS.filter((v) => reportsByView[v]);
  const reports = present.map((v) => reportsByView[v]!);

  const left = reportsByView.left;
  const right = reportsByView.right;
  const front = reportsByView.front;
  const hind = reportsByView.hind;

  let betterSide: "left" | "right" | null = null;
  if (left && right) {
    betterSide =
      left.overall_score >= right.overall_score ? "left" : "right";
  } else if (left) {
    betterSide = "left";
  } else if (right) {
    betterSide = "right";
  }

  const sideReports = [left, right].filter(
    (report): report is ConformationReport => Boolean(report),
  );
  const hipReports = [...sideReports, ...(hind ? [hind] : [])];
  const balanceAndLegReports = reports;

  let overall_score: number | null;
  if (left && right && front && hind) {
    overall_score = calculateCombinedScore(
      left,
      right,
      front,
      hind,
      betterSide ?? "left",
    );
  } else {
    overall_score = averageSectionScores(reports, (r) => r.overall_score);
  }

  const report_text = present
    .map((view) => {
      const report = reportsByView[view]!;
      return `${FULL_REPORT_VIEW_LABELS[view]}: ${report.summary}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");

  return {
    overall_score,
    balance_score: averageSectionScores(
      balanceAndLegReports,
      (r) => r.balance.score,
    ),
    // True shoulder / topline need a side profile — never invent from front/hind remaps.
    shoulder_score: averageSectionScores(
      sideReports,
      (r) => r.shoulder_angle.score,
    ),
    hip_score: averageSectionScores(hipReports, (r) => r.hip_angle.score),
    topline_score: averageSectionScores(
      sideReports,
      (r) => r.topline_quality.score,
    ),
    leg_score: averageSectionScores(
      balanceAndLegReports,
      (r) => r.leg_alignment.score,
    ),
    report_text,
    betterSide,
  };
}

function buildDataCompleteness(viewCount: number): string {
  if (viewCount >= 4) return "complete — 4 of 4 views";
  return `partial — ${viewCount} of 4 views`;
}

function buildViewsAnalyzed(resolved: ResolvedProgenXaiView[]): ProgenXaiViewTag[] {
  const seen = new Set<ProgenXaiViewTag>();
  const tags: ProgenXaiViewTag[] = [];
  for (const entry of resolved) {
    if (seen.has(entry.tag)) continue;
    seen.add(entry.tag);
    tags.push(entry.tag);
  }
  return tags;
}

function structureScoreOrNotAssessed(
  score: number | null,
): number | "not_assessed" {
  return score === null ? "not_assessed" : score;
}

type PreparedViewImage = {
  inputBuffer: Buffer;
  imageWidth: number;
  imageHeight: number;
  imageBase64: string;
  anthropicMediaType: AnthropicImageMediaType;
  anthropicBase64: string;
};

function roboflowLandmarkDetectionError(viewLabel: string): string {
  return `We couldn't detect horse landmarks in the ${viewLabel} photo. This can happen with certain coat colors, backgrounds, or angles. Try a photo with better contrast against the background, clearer lighting, and the horse standing square.`;
}

function isRoboflowLandmarkFailure(error: unknown): error is Error {
  return (
    error instanceof Error &&
    ROBOFLOW_LANDMARK_FAILURE_MESSAGES.has(error.message)
  );
}

function toAnthropicMediaType(fileType: string): AnthropicImageMediaType {
  if (fileType === "image/png") return "image/png";
  if (fileType === "image/webp") return "image/webp";
  return "image/jpeg";
}

function parseValidationResponse(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { valid?: boolean };
    return parsed.valid === true;
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*"valid"[\s\S]*\}/);
    if (!jsonMatch) return false;
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { valid?: boolean };
      return parsed.valid === true;
    } catch {
      return false;
    }
  }
}

async function prepareViewImageFromBuffer(
  inputBuffer: Buffer,
  contentType?: string,
): Promise<PreparedViewImage> {
  const metadata = await sharp(inputBuffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read image dimensions");
  }

  let anthropicBuffer: Buffer = inputBuffer;

  if (inputBuffer.length > ANTHROPIC_MAX_BYTES) {
    let pipeline = sharp(inputBuffer);
    if (metadata.width > 1600) {
      pipeline = pipeline.resize({ width: 1600, withoutEnlargement: true });
    }
    anthropicBuffer = Buffer.from(
      await pipeline.jpeg({ quality: 80 }).toBuffer(),
    );

    if (anthropicBuffer.length > ANTHROPIC_MAX_BYTES) {
      anthropicBuffer = Buffer.from(
        await sharp(anthropicBuffer).jpeg({ quality: 60 }).toBuffer(),
      );
    }

    if (anthropicBuffer.length > ANTHROPIC_MAX_BYTES) {
      anthropicBuffer = Buffer.from(
        await sharp(anthropicBuffer)
          .resize({ width: 1200, withoutEnlargement: true })
          .jpeg({ quality: 50 })
          .toBuffer(),
      );
    }
  }

  const normalizedContentType = contentType?.split(";")[0]?.trim() ?? "";
  const mediaType = normalizedContentType
    ? toAnthropicMediaType(normalizedContentType)
    : "image/jpeg";
  const anthropicMediaType: AnthropicImageMediaType =
    anthropicBuffer === inputBuffer ? mediaType : "image/jpeg";

  return {
    inputBuffer,
    imageWidth: metadata.width,
    imageHeight: metadata.height,
    imageBase64: inputBuffer.toString("base64"),
    anthropicMediaType,
    anthropicBase64: anthropicBuffer.toString("base64"),
  };
}

function buildAnthropicImageContent(prepared: PreparedViewImage) {
  return {
    type: "image" as const,
    source: {
      type: "base64" as const,
      media_type: prepared.anthropicMediaType,
      data: prepared.anthropicBase64,
    },
  };
}

async function validateViewImage(
  anthropic: Anthropic,
  view: FullReportViewKey,
  prepared: PreparedViewImage,
  tag: ProgenXaiViewTag = publicTagForSlotOrLabel(view),
): Promise<boolean> {
  const validationPrompt =
    tag === "unknown"
      ? UNKNOWN_ANGLE_VALIDATION_PROMPT
      : IMAGE_VALIDATION_USER_PROMPTS[view];

  const validationMessage = await anthropic.messages.create({
    model: "claude-opus-4-5-20251101",
    max_tokens: 256,
    system: IMAGE_VALIDATION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          buildAnthropicImageContent(prepared),
          { type: "text", text: validationPrompt },
        ],
      },
    ],
  });

  const validationText = validationMessage.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return parseValidationResponse(validationText);
}

function withReportContext(
  prompt: string,
  breed: string,
  discipline?: string | null,
  age?: string | null,
  sex?: string | null,
  coatColor?: string | null,
): string {
  let result = prompt;

  if (sex) {
    result = `HORSE SEX — REQUIRED: This horse is a ${sex}. You MUST use this sex (${sex}) throughout the entire report — in the summary, every section's notes, and anywhere you refer to the horse. Do NOT infer, assume, or override this sex from the photo. Never call this horse a different sex.\n\n${result}`;
  }

  result += `\n\nBREED CONTEXT: This horse is a ${breed}. Tailor your conformation analysis, scoring, and notes to the standards and ideal traits typical of this breed.`;

  if (coatColor) {
    result += `\n\nCOAT COLOR CONTEXT: This horse's coat color is ${coatColor}. Reference this coat color in your analysis where relevant, and do not contradict it based on photo appearance alone.`;
  }

  if (age) {
    result += `\n\nAGE CONTEXT: This horse is ${age} old. Consider age-appropriate conformation expectations in your analysis and scoring.`;
  }

  if (discipline) {
    result += `\n\nDISCIPLINE CONTEXT: This horse is evaluated for ${discipline}. Tailor your conformation analysis, scoring, and notes to the conformation priorities most important for this discipline.`;
  }

  return result;
}

async function generateViewReport(
  anthropic: Anthropic,
  view: FullReportViewKey,
  prepared: PreparedViewImage,
  breed: string,
  discipline?: string | null,
  age?: string | null,
  sex?: string | null,
  coatColor?: string | null,
): Promise<ConformationReport> {
  const reportMessage = await anthropic.messages.create({
    model: "claude-opus-4-5-20251101",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          buildAnthropicImageContent(prepared),
          {
            type: "text",
            text: withReportContext(
              REPORT_PROMPTS[view],
              breed,
              discipline,
              age,
              sex,
              coatColor,
            ),
          },
        ],
      },
    ],
  });

  const reportText = reportMessage.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!reportText) {
    throw new Error(`Empty report response for ${view} view`);
  }

  return parseReportResponse(reportText);
}

function parseCoatDetectionResponse(text: string): {
  coatColor: string;
  markings: string[];
} {
  const defaultResult = { coatColor: "bay", markings: [] as string[] };

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch?.[0] ?? text) as {
      coat?: string;
      markings?: unknown;
    };

    const coat =
      typeof parsed.coat === "string" && VALID_COAT_COLORS.has(parsed.coat)
        ? parsed.coat
        : defaultResult.coatColor;
    const markings = Array.isArray(parsed.markings)
      ? parsed.markings.filter((marking): marking is string => typeof marking === "string")
      : defaultResult.markings;

    return { coatColor: coat, markings };
  } catch {
    return defaultResult;
  }
}

function calculateCombinedScore(
  leftReport: ConformationReport,
  rightReport: ConformationReport,
  frontReport: ConformationReport,
  hindReport: ConformationReport,
  betterSide: "left" | "right",
): number {
  const bestSideScore =
    betterSide === "left"
      ? leftReport.overall_score
      : rightReport.overall_score;
  const otherSideScore =
    betterSide === "left"
      ? rightReport.overall_score
      : leftReport.overall_score;

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        bestSideScore * 0.4 +
          otherSideScore * 0.2 +
          frontReport.overall_score * 0.2 +
          hindReport.overall_score * 0.2,
      ),
    ),
  );
}

function compareImageSimilarity(
  bufferA: Buffer,
  bufferB: Buffer,
  sampleSize = 64,
): number {
  const stepA = Math.floor(bufferA.length / (sampleSize * sampleSize));
  const stepB = Math.floor(bufferB.length / (sampleSize * sampleSize));

  if (stepA === 0 || stepB === 0) return 0;

  let matchCount = 0;
  const totalSamples = sampleSize * sampleSize;

  for (let i = 0; i < totalSamples; i++) {
    const idxA = Math.min(i * stepA, bufferA.length - 1);
    const idxB = Math.min(i * stepB, bufferB.length - 1);
    const diff = Math.abs(bufferA[idxA]! - bufferB[idxB]!);
    if (diff < 15) matchCount++;
  }

  return matchCount / totalSamples;
}

function flipBufferHorizontally(
  buffer: Buffer,
  width: number,
  height: number,
): Buffer {
  const channels = Math.floor(buffer.length / (width * height));
  const flipped = Buffer.alloc(buffer.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * channels;
      const dstIdx = (y * width + (width - 1 - x)) * channels;
      for (let c = 0; c < channels; c++) {
        flipped[dstIdx + c] = buffer[srcIdx + c]!;
      }
    }
  }

  return flipped;
}

function buildMarkingsDescription(markings: string[]): string {
  const activeMarkingNames = markings
    .filter((m) => m !== "none")
    .map((m) => MARKING_NAMES[m] ?? m);

  return activeMarkingNames.length > 0
    ? `White markings: ${activeMarkingNames.join(", ")}.`
    : "No white markings detected.";
}

export async function POST(request: Request) {
  const apiKey = process.env.PROGENXAI_API_KEY?.trim();
  const requestKey = request.headers.get("x-progenxai-key")?.trim();

  console.log(
    "PROGENXAI_API_KEY is set:",
    !!process.env.PROGENXAI_API_KEY && process.env.PROGENXAI_API_KEY.length > 0,
  );

  if (!apiKey || requestKey !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key is not configured" },
      { status: 500 },
    );
  }

  const missingRoboflow: string[] = [];
  if (!process.env.ROBOFLOW_API_KEY?.trim()) {
    missingRoboflow.push("ROBOFLOW_API_KEY");
  }
  if (!process.env.ROBOFLOW_MODEL_ID?.trim()) {
    missingRoboflow.push("ROBOFLOW_MODEL_ID");
  }

  if (missingRoboflow.length > 0) {
    return NextResponse.json(
      { error: LANDMARK_DETECTION_USER_ERROR },
      { status: 500 },
    );
  }

  let body: ProgenXaiAnalyzeRequestBody;
  try {
    body = (await request.json()) as ProgenXaiAnalyzeRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const breed = typeof body.breed === "string" ? body.breed.trim() : "";
  if (!breed) {
    return NextResponse.json({ error: "Breed is required" }, { status: 400 });
  }

  const horseName =
    (typeof body.horseName === "string" && body.horseName.trim()) ||
    (typeof body.horse_name === "string" && body.horse_name.trim()) ||
    "";

  const coatColor =
    typeof body.coatColor === "string" && body.coatColor.trim()
      ? body.coatColor.trim()
      : null;
  const discipline =
    typeof body.discipline === "string" && body.discipline.trim()
      ? formatDisciplineList(body.discipline)
      : null;
  const age =
    body.age == null
      ? null
      : String(body.age).trim()
        ? String(body.age).trim()
        : null;
  const sex =
    typeof body.sex === "string" && body.sex.trim() ? body.sex.trim() : null;

  const resolvedViews = resolveProvidedViews(body);
  const providedViews = resolvedViews.map((entry) => entry.slot);
  const imageUrls = Object.fromEntries(
    resolvedViews.map((entry) => [entry.slot, entry.url]),
  ) as Partial<Record<FullReportViewKey, string>>;

  if (resolvedViews.length === 0) {
    return NextResponse.json(
      {
        error:
          "At least one conformation photo URL is required (1–4 images tagged side/front/hind/unknown, or leftUrl/rightUrl/frontUrl/hindUrl / photo_urls).",
      },
      { status: 400 },
    );
  }

  // Front/hind models only required when those views are present.
  // If missing, we still allow Claude scoring for partial/historic archives
  // (landmark QA is best-effort for those views).
  const skipLandmarkViews = new Set<FullReportViewKey>();
  if (
    providedViews.includes("front") &&
    !process.env.ROBOFLOW_FRONT_MODEL_ID?.trim()
  ) {
    skipLandmarkViews.add("front");
  }
  if (
    providedViews.includes("hind") &&
    !process.env.ROBOFLOW_HIND_MODEL_ID?.trim()
  ) {
    skipLandmarkViews.add("hind");
  }

  try {
    const preparedByView = {} as Partial<
      Record<FullReportViewKey, PreparedViewImage>
    >;

    await Promise.all(
      providedViews.map(async (view) => {
        const imageResponse = await fetch(imageUrls[view]!);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch ${view} view image`);
        }

        const inputBuffer = Buffer.from(await imageResponse.arrayBuffer());
        if (inputBuffer.length === 0) {
          throw new Error(`${view} view image is empty`);
        }

        if (inputBuffer.length > MAX_BYTES) {
          throw new Error("Each file must be 10MB or smaller");
        }

        const contentType =
          imageResponse.headers.get("content-type") ?? "image/jpeg";
        const normalizedContentType = contentType.split(";")[0]?.trim() ?? "";

        if (normalizedContentType && !ALLOWED_MIME.has(normalizedContentType)) {
          throw new Error("Only JPG, PNG, and WEBP images are allowed");
        }

        preparedByView[view] = await prepareViewImageFromBuffer(
          inputBuffer,
          contentType,
        );
      }),
    );

    const leftPrepared = preparedByView.left;
    const rightPrepared = preparedByView.right;

    if (leftPrepared && rightPrepared) {
      const leftRaw = await sharp(leftPrepared.inputBuffer)
        .resize(64, 64, { fit: "fill" })
        .raw()
        .toBuffer();

      const rightRaw = await sharp(rightPrepared.inputBuffer)
        .resize(64, 64, { fit: "fill" })
        .raw()
        .toBuffer();

      const directSimilarity = compareImageSimilarity(leftRaw, rightRaw);
      const rightFlipped = flipBufferHorizontally(rightRaw, 64, 64);
      const flippedSimilarity = compareImageSimilarity(leftRaw, rightFlipped);
      const DUPLICATE_THRESHOLD = 0.9;

      if (
        directSimilarity > DUPLICATE_THRESHOLD ||
        flippedSimilarity > DUPLICATE_THRESHOLD
      ) {
        return NextResponse.json(
          {
            error:
              "It looks like the same photo may have been used for both side views. Please upload separate left and right side photos of your horse for the most accurate analysis.",
          },
          { status: 400 },
        );
      }
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const validationResults = await Promise.all(
      resolvedViews.map(async (entry) => ({
        view: entry.slot,
        valid: await validateViewImage(
          anthropic,
          entry.slot,
          preparedByView[entry.slot]!,
          entry.tag,
        ),
      })),
    );

    const failedViews = validationResults
      .filter((result) => !result.valid)
      .map((result) => result.view);

    if (failedViews.length > 0) {
      return NextResponse.json({ error: INVALID_IMAGE_ERROR }, { status: 400 });
    }

    await Promise.all(
      providedViews.map(async (view) => {
        if (skipLandmarkViews.has(view)) {
          console.warn(
            `[progenxai/analyze] skipping Roboflow landmarks for ${view} (model id not configured)`,
          );
          return;
        }
        const prepared = preparedByView[view]!;
        const viewLabel = FULL_REPORT_VIEW_LABELS[view];

        try {
          await detectLandmarksWithRoboflow(
            prepared.imageBase64,
            prepared.imageWidth,
            prepared.imageHeight,
            ROBOFLOW_VIEW_MODE[view],
          );
        } catch (error) {
          // Landmark QA is best-effort on the ProgenXai integration path.
          // Never block scoring solely because Roboflow cannot lock keypoints —
          // Claude still produces a usable (possibly lower-confidence) report.
          console.warn(
            `[progenxai/analyze] landmark QA failed for ${viewLabel}; continuing to Claude scoring:`,
            error instanceof Error ? error.message : error,
          );
        }
      }),
    );

    const detectCoatColorWithPrompt = async (
      prepared: PreparedViewImage,
      prompt: string,
    ): Promise<{ coatColor: string; markings: string[] }> => {
      const coatMessage = await anthropic.messages.create({
        model: "claude-opus-4-5-20251101",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              buildAnthropicImageContent(prepared),
              { type: "text", text: prompt },
            ],
          },
        ],
      });
      const coatText = coatMessage.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      return parseCoatDetectionResponse(coatText);
    };

    const COAT_PROMPTS: Record<FullReportViewKey, string> = {
      left: COAT_COLOR_DETECTION_PROMPT_SIDE,
      right: COAT_COLOR_DETECTION_PROMPT_SIDE_RIGHT,
      front: COAT_COLOR_DETECTION_PROMPT_FRONT,
      hind: COAT_COLOR_DETECTION_PROMPT_HIND,
    };

    const reportsByView: Partial<Record<FullReportViewKey, ConformationReport>> =
      {};
    const coatByView: Partial<
      Record<FullReportViewKey, { coatColor: string; markings: string[] }>
    > = {};

    await Promise.all(
      providedViews.map(async (view) => {
        const prepared = preparedByView[view]!;
        const [report, coat] = await Promise.all([
          generateViewReport(
            anthropic,
            view,
            prepared,
            breed,
            discipline,
            age,
            sex,
            coatColor,
          ),
          detectCoatColorWithPrompt(prepared, COAT_PROMPTS[view]),
        ]);
        reportsByView[view] = report;
        coatByView[view] = coat;
      }),
    );

    const combined = combineAvailableReports(reportsByView);

    const coatCandidates = providedViews
      .map((v) => coatByView[v]?.coatColor)
      .filter((c): c is string => Boolean(c));
    const detectedCoatColor =
      coatCandidates.find((c) => c !== "bay") ?? coatCandidates[0] ?? "bay";

    const allMarkings = [
      ...new Set(
        providedViews.flatMap((v) => coatByView[v]?.markings ?? []),
      ),
    ].filter((m) => m !== "none");
    const markings = allMarkings.length > 0 ? allMarkings : ["none"];
    const markingsDescription = buildMarkingsDescription(markings);

    const partial_analysis = resolvedViews.length < 4;
    const views_analyzed = buildViewsAnalyzed(resolvedViews);
    const data_completeness = buildDataCompleteness(resolvedViews.length);

    let report_text = combined.report_text;
    if (partial_analysis) {
      const caveat = `Partial conformation analysis (${resolvedViews.length} of 4 views). Scores have lower confidence than a full four-view set. Unassessed structure areas are marked not_assessed rather than estimated.`;
      report_text = report_text ? `${caveat}\n\n${report_text}` : caveat;
    }
    if (markingsDescription) {
      report_text = report_text
        ? `${report_text}\n\n${markingsDescription}`
        : markingsDescription;
    }

    // Flat ProgenXai-compatible payload (also keep nested reports for debugging).
    return NextResponse.json({
      overall_score: combined.overall_score,
      balance_score: structureScoreOrNotAssessed(combined.balance_score),
      shoulder_score: structureScoreOrNotAssessed(combined.shoulder_score),
      hip_score: structureScoreOrNotAssessed(combined.hip_score),
      topline_score: structureScoreOrNotAssessed(combined.topline_score),
      leg_score: structureScoreOrNotAssessed(combined.leg_score),
      report_text,
      horse_name: horseName,
      breed,
      age: age ?? "",
      sex: sex ?? "",
      discipline: discipline ?? "",
      coat_color: detectedCoatColor,
      overlay_url: null,
      pdf_url: null,
      partial_analysis,
      views_analyzed,
      data_completeness,
      // Legacy nested fields (still useful for EquiForm clients)
      overallScore: combined.overall_score,
      betterSide: combined.betterSide,
      leftReport: reportsByView.left ?? null,
      rightReport: reportsByView.right ?? null,
      frontReport: reportsByView.front ?? null,
      hindReport: reportsByView.hind ?? null,
      coatColor: detectedCoatColor,
      markings,
      markingsDescription,
    });
  } catch (error) {
    console.error("[progenxai/analyze] failed:", error);
    const message =
      error instanceof Error && error.message.includes("Roboflow")
        ? LANDMARK_DETECTION_USER_ERROR
        : formatAnalysisError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
