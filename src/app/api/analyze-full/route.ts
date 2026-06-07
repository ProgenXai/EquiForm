import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import sharp from "sharp";

import {
  parseReportResponse,
  toConformationLandmarks,
  type FrontConformationLandmarks,
  type HindConformationLandmarks,
} from "@/lib/analyze/landmark-parser";
import type { AnthropicImageMediaType } from "@/lib/analyze/media-types";
import { detectLandmarksWithRoboflow } from "@/lib/analyze/roboflow-inference";
import {
  CONFORMATION_REPORT_PROMPT,
  FRONT_CONFORMATION_REPORT_PROMPT,
  HIND_CONFORMATION_REPORT_PROMPT,
} from "@/lib/analyze/prompt";
import type {
  ConformationReport,
  DetectedLandmarkPoint,
} from "@/lib/analyze/types";
import type { CalibrationViewMode } from "@/lib/calibration/landmarks";
import {
  drawConformationOverlay,
  drawFrontConformationOverlay,
  drawHindConformationOverlay,
} from "@/lib/calibration/draw-overlay";
import type { ConformationLandmarks } from "@/lib/conformation/landmarks";
import { createServiceRoleClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;
const FULL_REPORT_CREDIT_COST = 1;
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
]);

function roboflowLandmarkDetectionError(viewLabel: string): string {
  return `We couldn't detect horse landmarks in the ${viewLabel} photo. This can happen with certain coat colors, backgrounds, or angles. Try a photo with better contrast against the background, clearer lighting, and the horse standing square.`;
}

function toUserFacingFullReportError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (isRoboflowLandmarkFailure(error) || message.includes("Roboflow")) {
    return LANDMARK_DETECTION_USER_ERROR;
  }
  return message;
}

function isRoboflowLandmarkFailure(error: unknown): error is Error {
  return (
    error instanceof Error &&
    ROBOFLOW_LANDMARK_FAILURE_MESSAGES.has(error.message)
  );
}

const OVERLAY_STORAGE_BUCKET = "horse-photos";
const FULL_REPORT_TEMP_PREFIX = "full-report-temp";

export const maxDuration = 300;

type FullReportRequestBody = {
  leftUrl?: string;
  rightUrl?: string;
  frontUrl?: string;
  hindUrl?: string;
  horseName?: string;
  breed?: string;
  discipline?: string;
  age?: string;
  sex?: string;
  generate3D?: boolean;
};

const FULL_REPORT_URL_FIELDS: Record<
  FullReportViewKey,
  keyof FullReportRequestBody
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

function extractStoragePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${OVERLAY_STORAGE_BUCKET}/`;

  try {
    const parsed = new URL(url);
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    return decodeURIComponent(
      parsed.pathname.slice(markerIndex + marker.length),
    );
  } catch {
    return null;
  }
}

function validateTempImageUrl(url: string, userId: string): string | null {
  const path = extractStoragePathFromPublicUrl(url);
  if (!path?.startsWith(`${FULL_REPORT_TEMP_PREFIX}/${userId}/`)) {
    return null;
  }
  return path;
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
): string {
  let result = `${prompt}\n\nBREED CONTEXT: This horse is a ${breed}. Tailor your conformation analysis, scoring, and notes to the standards and ideal traits typical of this breed.`;

  if (age) {
    result += `\n\nAGE CONTEXT: This horse is ${age} old. Consider age-appropriate conformation expectations in your analysis and scoring.`;
  }

  if (sex) {
    result += `\n\nSEX CONTEXT: This horse is a ${sex}. Consider sex-appropriate conformation traits where relevant in your analysis.`;
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

async function detectCoatColor(
  anthropic: Anthropic,
  prepared: PreparedViewImage,
): Promise<{ coatColor: string; markings: string[] }> {
  const coatMessage = await anthropic.messages.create({
    model: "claude-opus-4-5-20251101",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: [
          buildAnthropicImageContent(prepared),
          { type: "text", text: COAT_COLOR_DETECTION_PROMPT_SIDE },
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
  // Sample pixels at regular intervals and compare brightness values
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
  if (channels < 1) return buffer;

  const flipped = Buffer.allocUnsafe(buffer.length);
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

async function submitMeshy3DTask(
  frontUrl: string,
  leftUrl: string,
  hindUrl: string,
  rightUrl: string,
): Promise<string | null> {
  const apiKey = process.env.MESHY_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const meshyPayload = {
      image_urls: [frontUrl, leftUrl, hindUrl, rightUrl],
      ai_model: "meshy-6",
      target_formats: ["glb"],
    };

    console.log('[meshy] request payload:', JSON.stringify(meshyPayload, null, 2));

    const submitResponse = await fetch(
      "https://api.meshy.ai/openapi/v1/multi-image-to-3d",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(meshyPayload),
      },
    );

    if (!submitResponse.ok) {
      const text = await submitResponse.text();
      console.error("[meshy] submit failed:", text);
      return null;
    }

    const submitData = (await submitResponse.json()) as {
      result?: string;
    };

    if (!submitData.result) {
      console.error("[meshy] submit error:", JSON.stringify(submitData));
      return null;
    }

    const taskId = submitData.result;
    console.log("[meshy] task submitted:", taskId);
    return taskId;
  } catch (error) {
    console.error("[meshy] unexpected error:", error);
    return null;
  }
}

async function generateTripo3DModel(
  frontUrl: string,
  leftUrl: string,
  hindUrl: string,
  rightUrl: string,
): Promise<string | null> {
  const apiKey = process.env.TRIPO_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const uploadTripoImageFromUrl = async (
      imageUrl: string,
    ): Promise<string | null> => {
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        console.error("[tripo3d] fetch for upload failed:", imageUrl);
        return null;
      }

      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }),
        "photo.jpg",
      );

      const uploadResponse = await fetch(
        "https://api.tripo3d.ai/v2/openapi/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        console.error("[tripo3d] upload failed:", await uploadResponse.text());
        return null;
      }

      const uploadData = (await uploadResponse.json()) as {
        code: number;
        data?: { file_token?: string; image_token?: string };
      };

      if (uploadData.code !== 0) {
        console.error("[tripo3d] upload error:", JSON.stringify(uploadData));
        return null;
      }

      return uploadData.data?.file_token ?? uploadData.data?.image_token ?? null;
    };

    const [frontToken, leftToken, hindToken, rightToken] = await Promise.all([
      uploadTripoImageFromUrl(frontUrl),
      uploadTripoImageFromUrl(leftUrl),
      uploadTripoImageFromUrl(hindUrl),
      uploadTripoImageFromUrl(rightUrl),
    ]);

    if (!frontToken || !leftToken || !hindToken || !rightToken) {
      console.error("[tripo3d] one or more image uploads failed");
      return null;
    }

    const tripoPayload = {
      type: "multiview_to_model",
      files: [
        { type: "jpg", file_token: frontToken },
        { type: "jpg", file_token: leftToken },
        { type: "jpg", file_token: hindToken },
        { type: "jpg", file_token: rightToken },
      ],
      model_version: "v2.5-20250123",
    };

    console.log('[tripo3d] request payload:', JSON.stringify(tripoPayload, null, 2));

    const submitResponse = await fetch("https://api.tripo3d.ai/v2/openapi/task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(tripoPayload),
    });

    if (!submitResponse.ok) {
      const text = await submitResponse.text();
      console.error("[tripo3d] submit failed:", text);
      return null;
    }

    const submitData = await submitResponse.json() as {
      code: number;
      data?: { task_id?: string };
    };

    if (submitData.code !== 0 || !submitData.data?.task_id) {
      console.error("[tripo3d] submit error:", JSON.stringify(submitData));
      return null;
    }

    const taskId = submitData.data.task_id;
    console.log("[tripo3d] task submitted:", taskId);

    const maxAttempts = 36;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const statusResponse = await fetch(
        `https://api.tripo3d.ai/v2/openapi/task/${taskId}`,
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
          },
        },
      );

      if (!statusResponse.ok) {
        console.error("[tripo3d] poll failed:", await statusResponse.text());
        continue;
      }

      const statusData = await statusResponse.json() as {
        code: number;
        data?: {
          status?: string;
          result?: {
            pbr_model?: { url?: string };
            model?: { url?: string };
          };
        };
      };

      if (statusData.code !== 0) {
        console.error("[tripo3d] poll error:", JSON.stringify(statusData));
        return null;
      }

      const status = statusData.data?.status;
      console.log(`[tripo3d] attempt ${attempt + 1} status:`, status);

      if (status === "success") {
        const glbUrl =
          statusData.data?.result?.pbr_model?.url ??
          statusData.data?.result?.model?.url ??
          null;
        console.log("[tripo3d] model ready:", glbUrl);
        return glbUrl;
      }

      if (status === "failed" || status === "cancelled") {
        if (status === "failed") {
          console.log('[tripo3d] failure detail:', JSON.stringify(statusData, null, 2));
        }
        console.error("[tripo3d] task failed with status:", status);
        return null;
      }
    }

    console.error("[tripo3d] timed out");
    return null;
  } catch (error) {
    console.error("[tripo3d] unexpected error:", error);
    return null;
  }
}

export async function POST(request: Request) {
  console.log("[analyze-full] POST handler entered");

  let body: FullReportRequestBody & { debugMode?: boolean };
  try {
    body = (await request.json()) as FullReportRequestBody & { debugMode?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.debugMode === true) {
    console.log("[analyze-full] debugMode enabled — skipping analysis pipeline");

    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "") ?? "";

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser(token);

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required for full report analysis" },
        { status: 401 },
      );
    }

    const imageUrls = {} as Record<FullReportViewKey, string>;

    for (const view of FULL_REPORT_VIEW_KEYS) {
      const urlField = FULL_REPORT_URL_FIELDS[view];
      const rawUrl = body[urlField];
      if (typeof rawUrl !== "string" || !rawUrl.trim()) {
        return NextResponse.json(
          { error: `Missing ${view} view photo URL` },
          { status: 400 },
        );
      }

      const trimmedUrl = rawUrl.trim();
      const storagePath = validateTempImageUrl(trimmedUrl, user.id);
      if (!storagePath) {
        return NextResponse.json(
          { error: `Invalid ${view} view photo URL` },
          { status: 400 },
        );
      }

      imageUrls[view] = trimmedUrl;
    }

    const meshyTaskId = await submitMeshy3DTask(
      imageUrls.front,
      imageUrls.left,
      imageUrls.hind,
      imageUrls.right,
    );

    const placeholderSection = {
      score: 85,
      notes: "Debug mode placeholder — analysis skipped.",
    };
    const placeholderReport: ConformationReport = {
      balance: placeholderSection,
      shoulder_angle: placeholderSection,
      hip_angle: placeholderSection,
      topline_quality: placeholderSection,
      leg_alignment: placeholderSection,
      overall_score: 85,
      summary: "Debug mode placeholder report — conformation analysis was skipped.",
    };

    console.log("[analyze-full] meshyTaskId:", meshyTaskId);

    return NextResponse.json({
      overlayUrl: "",
      overlayImage: "",
      frontOverlayUrl: "",
      hindOverlayUrl: "",
      leftReport: placeholderReport,
      rightReport: placeholderReport,
      frontReport: placeholderReport,
      hindReport: placeholderReport,
      combinedScore: 85,
      betterSide: "left",
      landmarks: {
        left: {},
        right: {},
        front: {},
        hind: {},
      },
      horseName:
        typeof body.horseName === "string" && body.horseName.trim()
          ? body.horseName.trim()
          : null,
      coatColor: "bay",
      markings: ["none"],
      markingsDescription: "Debug mode placeholder.",
      meshyTaskId,
      tripoGlbUrl: null,
      glbUrl: null,
    });
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

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required for full report analysis" },
      { status: 401 },
    );
  }

  let isAdmin = false;
  const { data: roleData } = await supabaseAuth
    .from("user_roles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();
  isAdmin = roleData?.is_admin === true;

  const generate3D = body.generate3D === true;
  const balanceColumn = generate3D
    ? "full_report_3d_balance"
    : "full_report_balance";
  const serviceClient = createServiceRoleClient();

  if (!isAdmin) {
    const { data: tokenRow, error: balanceError } = await serviceClient
      .from("user_tokens")
      .select("full_report_balance, full_report_3d_balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (balanceError) {
      return NextResponse.json({ error: balanceError.message }, { status: 500 });
    }

    const currentBalance = generate3D
      ? (tokenRow?.full_report_3d_balance ?? 0)
      : (tokenRow?.full_report_balance ?? 0);

    if (currentBalance < FULL_REPORT_CREDIT_COST) {
      return NextResponse.json(
        {
          error: generate3D
            ? `Insufficient four-view + 3D credits. Full report requires ${FULL_REPORT_CREDIT_COST} credit.`
            : `Insufficient full report credits. Full report requires ${FULL_REPORT_CREDIT_COST} credit.`,
        },
        { status: 401 },
      );
    }
  }

  try {
    const horseNameRaw = body.horseName;
    const horseName =
      typeof horseNameRaw === "string" && horseNameRaw.trim()
        ? horseNameRaw.trim()
        : null;
    const breedRaw = body.breed;
    const breed = typeof breedRaw === "string" ? breedRaw.trim() : "";
    const disciplineRaw = body.discipline;
    const discipline =
      typeof disciplineRaw === "string" && disciplineRaw.trim()
        ? disciplineRaw.trim()
        : null;
    const ageRaw = body.age;
    const age =
      typeof ageRaw === "string" && ageRaw.trim() ? ageRaw.trim() : null;
    const sexRaw = body.sex;
    const sex =
      typeof sexRaw === "string" && sexRaw.trim() ? sexRaw.trim() : null;

    if (!breed) {
      return NextResponse.json({ error: "Breed is required" }, { status: 400 });
    }

    const imageUrls = {} as Record<FullReportViewKey, string>;

    for (const view of FULL_REPORT_VIEW_KEYS) {
      const urlField = FULL_REPORT_URL_FIELDS[view];
      const rawUrl = body[urlField];
      if (typeof rawUrl !== "string" || !rawUrl.trim()) {
        return NextResponse.json(
          { error: `Missing ${view} view photo URL` },
          { status: 400 },
        );
      }

      const trimmedUrl = rawUrl.trim();
      const storagePath = validateTempImageUrl(trimmedUrl, user.id);
      if (!storagePath) {
        return NextResponse.json(
          { error: `Invalid ${view} view photo URL` },
          { status: 400 },
        );
      }

      imageUrls[view] = trimmedUrl;
    }

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
          throw new Error(`Each file must be 10MB or smaller`);
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

    // Detect if left and right photos are the same or mirrored
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

    const DUPLICATE_THRESHOLD = 0.90;

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

    const failedViews = validationResults.filter((result) => !result.valid).map((r) => r.view);
    if (failedViews.length > 0) {
      console.log("[analyze-full] validation failed for views:", failedViews.join(", "));
      return NextResponse.json({ error: INVALID_IMAGE_ERROR }, { status: 400 });
    }

    const detectedLandmarksByView = {} as Record<
      FullReportViewKey,
      Record<string, DetectedLandmarkPoint>
    >;

    await Promise.all(
      FULL_REPORT_VIEW_KEYS.map(async (view) => {
        const prepared = preparedByView[view];
        const viewLabel = FULL_REPORT_VIEW_LABELS[view];

        console.log(
          `[analyze-full] Running Roboflow inference for ${viewLabel} (${view})`,
        );

        try {
          detectedLandmarksByView[view] = await detectLandmarksWithRoboflow(
            prepared.imageBase64,
            prepared.imageWidth,
            prepared.imageHeight,
            ROBOFLOW_VIEW_MODE[view],
          );
        } catch (error) {
          console.error(
            `[analyze-full] Roboflow inference failed for ${viewLabel} (${view}):`,
            error,
          );

          if (isRoboflowLandmarkFailure(error)) {
            throw new Error(roboflowLandmarkDetectionError(viewLabel));
          }

          throw error;
        }
      }),
    );

    const conformationLandmarksByView = {
      left: toConformationLandmarks(detectedLandmarksByView.left, "left"),
      right: toConformationLandmarks(detectedLandmarksByView.right, "right"),
      front: toConformationLandmarks(detectedLandmarksByView.front, "front"),
      hind: toConformationLandmarks(detectedLandmarksByView.hind, "hind"),
    };

    const [leftReport, rightReport, frontReport, hindReport] = await Promise.all([
      generateViewReport(
        anthropic,
        "left",
        preparedByView.left,
        breed,
        discipline,
        age,
        sex,
      ),
      generateViewReport(
        anthropic,
        "right",
        preparedByView.right,
        breed,
        discipline,
        age,
        sex,
      ),
      generateViewReport(
        anthropic,
        "front",
        preparedByView.front,
        breed,
        discipline,
        age,
        sex,
      ),
      generateViewReport(
        anthropic,
        "hind",
        preparedByView.hind,
        breed,
        discipline,
        age,
        sex,
      ),
    ]);

    const betterSide: "left" | "right" =
      leftReport.overall_score >= rightReport.overall_score ? "left" : "right";

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

    const [leftCoatResult, rightCoatResult, frontCoatResult, hindCoatResult] = await Promise.all([
      detectCoatColorWithPrompt(preparedByView.left, COAT_COLOR_DETECTION_PROMPT_SIDE),
      detectCoatColorWithPrompt(preparedByView.right, COAT_COLOR_DETECTION_PROMPT_SIDE_RIGHT),
      detectCoatColorWithPrompt(preparedByView.front, COAT_COLOR_DETECTION_PROMPT_FRONT),
      detectCoatColorWithPrompt(preparedByView.hind, COAT_COLOR_DETECTION_PROMPT_HIND),
    ]);

    const coatColor = leftCoatResult.coatColor !== "bay"
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

    const meshyTaskId = await submitMeshy3DTask(
      imageUrls.front,
      imageUrls.left,
      imageUrls.hind,
      imageUrls.right,
    );

    const combinedScore = calculateCombinedScore(
      leftReport,
      rightReport,
      frontReport,
      hindReport,
      betterSide,
    );

    const overlaySource = preparedByView[betterSide];
    const overlayLandmarks = conformationLandmarksByView[
      betterSide
    ] as ConformationLandmarks;

    const overlayBuffer = await drawConformationOverlay(
      overlaySource.inputBuffer,
      overlayLandmarks,
      overlaySource.imageWidth,
      overlaySource.imageHeight,
    );

    const overlayBase64 = overlayBuffer.toString("base64");
    const overlayImage = `data:image/jpeg;base64,${overlayBase64}`;

    const overlayStoragePath = `overlays/${user.id}/${Date.now()}-full.jpg`;
    const { error: overlayUploadError } = await serviceClient.storage
      .from(OVERLAY_STORAGE_BUCKET)
      .upload(overlayStoragePath, overlayBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    let overlayUrl = overlayImage;
    if (!overlayUploadError) {
      const { data: overlayPublicUrl } = serviceClient.storage
        .from(OVERLAY_STORAGE_BUCKET)
        .getPublicUrl(overlayStoragePath);
      overlayUrl = overlayPublicUrl.publicUrl;
    } else {
      console.error("[analyze-full] overlay upload failed:", overlayUploadError);
    }

    const frontPrepared = preparedByView.front;
    const frontOverlayBuffer = await drawFrontConformationOverlay(
      frontPrepared.inputBuffer,
      conformationLandmarksByView.front as FrontConformationLandmarks,
      frontPrepared.imageWidth,
      frontPrepared.imageHeight,
    );
    const frontOverlayBase64 = frontOverlayBuffer.toString("base64");
    let frontOverlayUrl = `data:image/jpeg;base64,${frontOverlayBase64}`;

    const frontOverlayStoragePath = `overlays/${user.id}/${Date.now()}-front.jpg`;
    const { error: frontOverlayUploadError } = await serviceClient.storage
      .from(OVERLAY_STORAGE_BUCKET)
      .upload(frontOverlayStoragePath, frontOverlayBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (!frontOverlayUploadError) {
      const { data: frontOverlayPublicUrl } = serviceClient.storage
        .from(OVERLAY_STORAGE_BUCKET)
        .getPublicUrl(frontOverlayStoragePath);
      frontOverlayUrl = frontOverlayPublicUrl.publicUrl;
    } else {
      console.error(
        "[analyze-full] front overlay upload failed:",
        frontOverlayUploadError,
      );
    }

    const hindPrepared = preparedByView.hind;
    const hindOverlayBuffer = await drawHindConformationOverlay(
      hindPrepared.inputBuffer,
      conformationLandmarksByView.hind as HindConformationLandmarks,
      hindPrepared.imageWidth,
      hindPrepared.imageHeight,
    );
    const hindOverlayBase64 = hindOverlayBuffer.toString("base64");
    let hindOverlayUrl = `data:image/jpeg;base64,${hindOverlayBase64}`;

    const hindOverlayStoragePath = `overlays/${user.id}/${Date.now()}-hind.jpg`;
    const { error: hindOverlayUploadError } = await serviceClient.storage
      .from(OVERLAY_STORAGE_BUCKET)
      .upload(hindOverlayStoragePath, hindOverlayBuffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (!hindOverlayUploadError) {
      const { data: hindOverlayPublicUrl } = serviceClient.storage
        .from(OVERLAY_STORAGE_BUCKET)
        .getPublicUrl(hindOverlayStoragePath);
      hindOverlayUrl = hindOverlayPublicUrl.publicUrl;
    } else {
      console.error(
        "[analyze-full] hind overlay upload failed:",
        hindOverlayUploadError,
      );
    }

    const userId = user.id;
    const userEmail = user.email ?? null;
    const betterSideReport =
      betterSide === "left" ? leftReport : rightReport;

    const markingNames: Record<string, string> = {
      blaze: "blaze",
      stripe: "stripe down the face",
      star: "star on the forehead",
      snip: "snip on the muzzle",
      left_sock: "left front sock",
      right_sock: "right front sock",
      left_stocking: "left front stocking",
      right_stocking: "right front stocking",
    };

    const activeMarkingNames = markings
      .filter((m) => m !== "none")
      .map((m) => markingNames[m] ?? m);

    const markingsDescription =
      activeMarkingNames.length > 0
        ? `White markings: ${activeMarkingNames.join(", ")}.`
        : "No white markings detected.";

    const reportText = JSON.stringify({
      type: "full",
      combinedScore,
      betterSide,
      leftReport,
      rightReport,
      frontReport,
      hindReport,
      coatColor,
      markings,
      markingsDescription,
    });

    console.log("Attempting report save for user:", userId, userEmail);
    console.log("userId at save:", userId, "userEmail at save:", userEmail);

    const { data: savedReport, error } = await serviceClient
      .from("reports")
      .insert({
        user_id: userId,
        horse_name: horseName,
        overall_score: combinedScore,
        balance_score: betterSideReport.balance.score,
        shoulder_score: betterSideReport.shoulder_angle.score,
        hip_score: betterSideReport.hip_angle.score,
        topline_score: betterSideReport.topline_quality.score,
        leg_score: betterSideReport.leg_alignment.score,
        report_text: reportText,
        overlay_url: overlayUrl,
      })
      .select("id")
      .single();

    console.log(
      "Report save result:",
      JSON.stringify(savedReport),
      JSON.stringify(error),
    );

    if (error) {
      console.error("Report save error:", error.message, error.code, error.details);
      console.error("[analyze-full] failed to save report:", error);
    } else {
      // Send first-report email
      try {
        const { data: existingReports } = await serviceClient
          .from("reports")
          .select("id")
          .eq("user_id", userId);

        const isFirstReport = existingReports && existingReports.length === 1;

        if (isFirstReport && user.email) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "EquiForm <reports@equiform.app>",
              to: user.email,
              subject: "Your First EquiForm Conformation Report is Ready 🐴",
              html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 24px;">
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="color: #0f172a; font-size: 28px; margin: 0;">EquiForm</h1>
              <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">AI-Powered Horse Conformation Analysis</p>
            </div>
            <div style="background-color: #f8fafc; border-radius: 8px; padding: 32px; margin-bottom: 24px;">
              <h2 style="color: #0f172a; font-size: 20px; margin: 0 0 16px;">Your conformation report is ready!</h2>
              <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
                Your first EquiForm AI conformation analysis is complete. Log in to view your full report including scores, overlays, and detailed analysis.
              </p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="https://www.equiform.app/my-reports" style="background-color: #0f172a; color: #ffffff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; display: inline-block;">
                  View My Report
                </a>
              </div>
              <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0;">
                Need more analyses? <a href="https://www.equiform.app/buy-rosettes" style="color: #0f172a;">Purchase additional Report Tokens</a> to keep evaluating your horses.
              </p>
            </div>
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
              AI-generated analysis is for informational purposes only. Not veterinary advice. <a href="https://www.equiform.app/disclaimer" style="color: #9ca3af;">Full Disclaimer</a>
            </p>
          </div>
        `,
            }),
          });
        }
      } catch (emailError) {
        console.error("First report email failed:", emailError);
        // Don't throw — email failure should not break the report
      }
    }

    if (!error && savedReport && !isAdmin) {
      const { data: tokenRow, error: fetchError } = await serviceClient
        .from("user_tokens")
        .select("full_report_balance, full_report_3d_balance")
        .eq("user_id", user.id)
        .gte(balanceColumn, FULL_REPORT_CREDIT_COST)
        .maybeSingle();

      if (fetchError) {
        console.error("[analyze-full] failed to fetch credits:", fetchError);
      } else if (tokenRow) {
        const currentBalance = generate3D
          ? tokenRow.full_report_3d_balance
          : tokenRow.full_report_balance;
        const newBalance = currentBalance - FULL_REPORT_CREDIT_COST;

        const { error: deductError } = await serviceClient
          .from("user_tokens")
          .update({ [balanceColumn]: newBalance })
          .eq("user_id", user.id)
          .gte(balanceColumn, FULL_REPORT_CREDIT_COST);

        if (deductError) {
          console.error("[analyze-full] failed to deduct credits:", deductError);
        } else {
          const { error: transactionError } = await serviceClient
            .from("token_transactions")
            .insert({
              user_id: user.id,
              amount: -FULL_REPORT_CREDIT_COST,
              type: "usage",
              description: generate3D
                ? "Four-view + 3D report analysis"
                : "Full report analysis",
            });

          if (transactionError) {
            console.error(
              "[analyze-full] token_transactions insert failed:",
              transactionError,
            );
          }
        }
      }
    }

    console.log("[analyze-full] meshyTaskId:", meshyTaskId);

    return NextResponse.json({
      overlayUrl,
      overlayImage,
      frontOverlayUrl,
      hindOverlayUrl,
      leftReport,
      rightReport,
      frontReport,
      hindReport,
      combinedScore,
      betterSide,
      landmarks: {
        left: detectedLandmarksByView.left,
        right: detectedLandmarksByView.right,
        front: detectedLandmarksByView.front,
        hind: detectedLandmarksByView.hind,
      },
      horseName,
      coatColor,
      markings,
      markingsDescription,
      meshyTaskId,
      tripoGlbUrl: null,
      glbUrl: null,
      reportId: savedReport?.id ?? null,
    });
  } catch (error) {
    console.error("[analyze-full] failed:", error);
    const message = toUserFacingFullReportError(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
