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

type ProgenXaiAnalyzeRequestBody = {
  leftUrl?: string;
  rightUrl?: string;
  frontUrl?: string;
  hindUrl?: string;
  horseName?: string;
  breed?: string;
  coatColor?: string;
  age?: string;
  sex?: string;
  discipline?: string;
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
): Promise<boolean> {
  const validationMessage = await anthropic.messages.create({
    model: "claude-opus-4-5-20251101",
    max_tokens: 256,
    system: IMAGE_VALIDATION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          buildAnthropicImageContent(prepared),
          { type: "text", text: IMAGE_VALIDATION_USER_PROMPTS[view] },
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
  if (!process.env.ROBOFLOW_FRONT_MODEL_ID?.trim()) {
    missingRoboflow.push("ROBOFLOW_FRONT_MODEL_ID");
  }
  if (!process.env.ROBOFLOW_HIND_MODEL_ID?.trim()) {
    missingRoboflow.push("ROBOFLOW_HIND_MODEL_ID");
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

  const coatColor =
    typeof body.coatColor === "string" && body.coatColor.trim()
      ? body.coatColor.trim()
      : null;
  const discipline =
    typeof body.discipline === "string" && body.discipline.trim()
      ? formatDisciplineList(body.discipline)
      : null;
  const age =
    typeof body.age === "string" && body.age.trim() ? body.age.trim() : null;
  const sex =
    typeof body.sex === "string" && body.sex.trim() ? body.sex.trim() : null;

  const imageUrls = {} as Record<FullReportViewKey, string>;

  for (const view of FULL_REPORT_VIEW_KEYS) {
    const urlField = FULL_REPORT_URL_FIELDS[view];
    const rawUrl = body[urlField];
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return NextResponse.json(
        { error: "All four image URLs are required" },
        { status: 400 },
      );
    }

    imageUrls[view] = rawUrl.trim();
  }

  try {
    const preparedByView = {} as Record<FullReportViewKey, PreparedViewImage>;

    await Promise.all(
      FULL_REPORT_VIEW_KEYS.map(async (view) => {
        const imageResponse = await fetch(imageUrls[view]);
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

    if (directSimilarity > DUPLICATE_THRESHOLD || flippedSimilarity > DUPLICATE_THRESHOLD) {
      return NextResponse.json(
        {
          error:
            "It looks like the same photo may have been used for both side views. Please upload separate left and right side photos of your horse for the most accurate analysis.",
        },
        { status: 400 },
      );
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const validationResults = await Promise.all(
      FULL_REPORT_VIEW_KEYS.map(async (view) => ({
        view,
        valid: await validateViewImage(anthropic, view, preparedByView[view]),
      })),
    );

    const failedViews = validationResults
      .filter((result) => !result.valid)
      .map((result) => result.view);

    if (failedViews.length > 0) {
      return NextResponse.json({ error: INVALID_IMAGE_ERROR }, { status: 400 });
    }

    await Promise.all(
      FULL_REPORT_VIEW_KEYS.map(async (view) => {
        const prepared = preparedByView[view];
        const viewLabel = FULL_REPORT_VIEW_LABELS[view];

        try {
          await detectLandmarksWithRoboflow(
            prepared.imageBase64,
            prepared.imageWidth,
            prepared.imageHeight,
            ROBOFLOW_VIEW_MODE[view],
          );
        } catch (error) {
          if (isRoboflowLandmarkFailure(error)) {
            throw new Error(roboflowLandmarkDetectionError(viewLabel));
          }

          throw error;
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

    const [
      leftReport,
      rightReport,
      frontReport,
      hindReport,
      leftCoatResult,
      rightCoatResult,
      frontCoatResult,
      hindCoatResult,
    ] = await Promise.all([
      generateViewReport(
        anthropic,
        "left",
        preparedByView.left,
        breed,
        discipline,
        age,
        sex,
        coatColor,
      ),
      generateViewReport(
        anthropic,
        "right",
        preparedByView.right,
        breed,
        discipline,
        age,
        sex,
        coatColor,
      ),
      generateViewReport(
        anthropic,
        "front",
        preparedByView.front,
        breed,
        discipline,
        age,
        sex,
        coatColor,
      ),
      generateViewReport(
        anthropic,
        "hind",
        preparedByView.hind,
        breed,
        discipline,
        age,
        sex,
        coatColor,
      ),
      detectCoatColorWithPrompt(preparedByView.left, COAT_COLOR_DETECTION_PROMPT_SIDE),
      detectCoatColorWithPrompt(
        preparedByView.right,
        COAT_COLOR_DETECTION_PROMPT_SIDE_RIGHT,
      ),
      detectCoatColorWithPrompt(
        preparedByView.front,
        COAT_COLOR_DETECTION_PROMPT_FRONT,
      ),
      detectCoatColorWithPrompt(preparedByView.hind, COAT_COLOR_DETECTION_PROMPT_HIND),
    ]);

    const betterSide: "left" | "right" =
      leftReport.overall_score >= rightReport.overall_score ? "left" : "right";

    const detectedCoatColor =
      leftCoatResult.coatColor !== "bay"
        ? leftCoatResult.coatColor
        : rightCoatResult.coatColor;

    const allMarkings = [
      ...new Set([
        ...leftCoatResult.markings,
        ...rightCoatResult.markings,
        ...frontCoatResult.markings,
        ...hindCoatResult.markings,
      ]),
    ].filter((m) => m !== "none");
    const markings = allMarkings.length > 0 ? allMarkings : ["none"];
    const markingsDescription = buildMarkingsDescription(markings);
    const overallScore = calculateCombinedScore(
      leftReport,
      rightReport,
      frontReport,
      hindReport,
      betterSide,
    );

    return NextResponse.json({
      overallScore,
      betterSide,
      leftReport,
      rightReport,
      frontReport,
      hindReport,
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
