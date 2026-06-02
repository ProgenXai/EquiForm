import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import sharp from "sharp";

import {
  parseReportResponse,
  toConformationLandmarks,
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
import { drawConformationOverlay } from "@/lib/calibration/draw-overlay";
import type { ConformationLandmarks } from "@/lib/conformation/landmarks";
import { createServiceRoleClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;
const FULL_REPORT_CREDIT_COST = 30;
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
  "Does this image show a single horse in a clear side profile view (left or right facing), standing still, with the horse filling most of the frame? The horse should be visible from head to tail with all four legs visible. If this is a photo of a sale catalog or printed page, the book or page must be laying completely flat and the photo must be taken straight down from directly above — not at an angle. Reject if the page appears warped, angled, or shot from the side.";

const FRONT_VIEW_VALIDATION_PROMPT =
  "Does this image show a single horse that is generally facing toward the camera in a front view? Accept if the horse is reasonably close to a front-facing view even if slightly angled — the chest and head should be visible from the front. Reject only if the horse is clearly in side profile, hind view, or too far off-angle to assess front conformation.";

const HIND_VIEW_VALIDATION_PROMPT =
  "Does this image show a single horse that is generally facing away from the camera in a hind view? Accept if the horse is reasonably close to a hind-facing view even if slightly angled — the hindquarters and tail should be visible from behind. Reject only if the horse is clearly in side profile, front view, or too far off-angle to assess hind conformation.";

const IMAGE_VALIDATION_USER_PROMPTS: Record<FullReportViewKey, string> = {
  left: SIDE_PROFILE_VALIDATION_PROMPT,
  right: SIDE_PROFILE_VALIDATION_PROMPT,
  front: FRONT_VIEW_VALIDATION_PROMPT,
  hind: HIND_VIEW_VALIDATION_PROMPT,
};

const REPORT_PROMPTS: Record<FullReportViewKey, string> = {
  left: CONFORMATION_REPORT_PROMPT,
  right: CONFORMATION_REPORT_PROMPT,
  front: FRONT_CONFORMATION_REPORT_PROMPT,
  hind: HIND_CONFORMATION_REPORT_PROMPT,
};

const INVALID_IMAGE_ERROR =
  "One or more photos didn't meet the criteria. Please review the photo guidelines and resubmit.";

const OVERLAY_STORAGE_BUCKET = "horse-photos";
const FULL_REPORT_TEMP_PREFIX = "full-report-temp";

export const maxDuration = 300;

type FullReportRequestBody = {
  leftUrl?: string;
  rightUrl?: string;
  frontUrl?: string;
  hindUrl?: string;
  horseName?: string;
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

async function generateViewReport(
  anthropic: Anthropic,
  view: FullReportViewKey,
  prepared: PreparedViewImage,
): Promise<ConformationReport> {
  const reportMessage = await anthropic.messages.create({
    model: "claude-opus-4-5-20251101",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          buildAnthropicImageContent(prepared),
          { type: "text", text: REPORT_PROMPTS[view] },
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

export async function POST(request: Request) {
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
      {
        error: `Roboflow is not fully configured. Missing: ${missingRoboflow.join(", ")}`,
      },
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

  const serviceClient = createServiceRoleClient();

  if (!isAdmin) {
    const { data: tokenRow, error: balanceError } = await serviceClient
      .from("user_tokens")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (balanceError) {
      return NextResponse.json({ error: balanceError.message }, { status: 500 });
    }

    if ((tokenRow?.balance ?? 0) < FULL_REPORT_CREDIT_COST) {
      return NextResponse.json(
        {
          error: `Insufficient report credits. Full report requires ${FULL_REPORT_CREDIT_COST} credits.`,
        },
        { status: 401 },
      );
    }
  }

  try {
    const body = (await request.json()) as FullReportRequestBody;
    const horseNameRaw = body.horseName;
    const horseName =
      typeof horseNameRaw === "string" && horseNameRaw.trim()
        ? horseNameRaw.trim()
        : null;

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

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const validationResults = await Promise.all(
      FULL_REPORT_VIEW_KEYS.map(async (view) => ({
        view,
        valid: await validateViewImage(anthropic, view, preparedByView[view]),
      })),
    );

    if (validationResults.some((result) => !result.valid)) {
      return NextResponse.json({ error: INVALID_IMAGE_ERROR }, { status: 400 });
    }

    const detectedLandmarksByView = {} as Record<
      FullReportViewKey,
      Record<string, DetectedLandmarkPoint>
    >;

    await Promise.all(
      FULL_REPORT_VIEW_KEYS.map(async (view) => {
        const prepared = preparedByView[view];
        detectedLandmarksByView[view] = await detectLandmarksWithRoboflow(
          prepared.imageBase64,
          prepared.imageWidth,
          prepared.imageHeight,
          ROBOFLOW_VIEW_MODE[view],
        );
      }),
    );

    const conformationLandmarksByView = {
      left: toConformationLandmarks(detectedLandmarksByView.left, "left"),
      right: toConformationLandmarks(detectedLandmarksByView.right, "right"),
      front: toConformationLandmarks(detectedLandmarksByView.front, "front"),
      hind: toConformationLandmarks(detectedLandmarksByView.hind, "hind"),
    };

    const [leftReport, rightReport, frontReport, hindReport] = await Promise.all([
      generateViewReport(anthropic, "left", preparedByView.left),
      generateViewReport(anthropic, "right", preparedByView.right),
      generateViewReport(anthropic, "front", preparedByView.front),
      generateViewReport(anthropic, "hind", preparedByView.hind),
    ]);

    const betterSide: "left" | "right" =
      leftReport.overall_score >= rightReport.overall_score ? "left" : "right";

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

    if (!isAdmin) {
      const { data: tokenRow, error: fetchError } = await serviceClient
        .from("user_tokens")
        .select("balance")
        .eq("user_id", user.id)
        .gte("balance", FULL_REPORT_CREDIT_COST)
        .maybeSingle();

      if (fetchError) {
        console.error("[analyze-full] failed to fetch credits:", fetchError);
      } else if (tokenRow) {
        const newBalance = tokenRow.balance - FULL_REPORT_CREDIT_COST;

        const { error: deductError } = await serviceClient
          .from("user_tokens")
          .update({ balance: newBalance })
          .eq("user_id", user.id)
          .gte("balance", FULL_REPORT_CREDIT_COST);

        if (deductError) {
          console.error("[analyze-full] failed to deduct credits:", deductError);
        } else {
          const { error: transactionError } = await serviceClient
            .from("token_transactions")
            .insert({
              user_id: user.id,
              amount: -FULL_REPORT_CREDIT_COST,
              type: "usage",
              description: "Full report analysis",
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

    return NextResponse.json({
      overlayUrl,
      overlayImage,
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
    });
  } catch (error) {
    console.error("[analyze-full] failed:", error);
    const message =
      error instanceof Error ? error.message : "Full report analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
