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
import { detectLandmarksWithRoboflow } from "@/lib/analyze/roboflow-inference";
import {
  CONFORMATION_REPORT_PROMPT,
  FRONT_CONFORMATION_REPORT_PROMPT,
  HIND_CONFORMATION_REPORT_PROMPT,
} from "@/lib/analyze/prompt";
import type { AnthropicImageMediaType } from "@/lib/analyze/media-types";
import {
  isSideProfileViewMode,
  type CalibrationViewMode,
} from "@/lib/calibration/landmarks";
import {
  drawConformationOverlay,
  drawFrontConformationOverlay,
  drawHindConformationOverlay,
} from "@/lib/calibration/draw-overlay";
import type { ConformationLandmarks } from "@/lib/conformation/landmarks";
import { sendAdminAlert } from "@/lib/email/admin-alerts";
import { deliverReportReadyEmail, scheduleDelayedReportEmail } from "@/lib/email/deliver-report-ready-email";
import { formatDisciplineList } from "@/lib/format-discipline";
import { formatAnalysisError, USER_FACING } from "@/lib/user-facing-errors";
import { linkReportToHorse } from "@/lib/horses/link-report-to-horse";
import { createServiceRoleClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const IMAGE_VALIDATION_SYSTEM_PROMPT =
  'You are a lenient image validator for a horse conformation analysis app. Your job is to accept photos that could reasonably work for analysis. When in doubt, return valid: true. Only return valid: false for clearly wrong photos. Respond with only valid JSON: {"valid": true} or {"valid": false}';

const SIDE_PROFILE_VALIDATION_PROMPT =
  "Does this image show a single horse in a clear side profile view (left or right facing), standing still, with the horse filling most of the frame? The horse should be visible from head to tail with all four legs visible. If this is a photo of a sale catalog or printed page, the book or page must be laying completely flat and the photo must be taken straight down from directly above — not at an angle. Reject if the page appears warped, angled, or shot from the side.";

const IMAGE_VALIDATION_USER_PROMPTS: Record<CalibrationViewMode, string> = {
  side: SIDE_PROFILE_VALIDATION_PROMPT,
  left: SIDE_PROFILE_VALIDATION_PROMPT,
  right: SIDE_PROFILE_VALIDATION_PROMPT,
  front:
    "Does this image show a single horse in a front or near-front view suitable for conformation analysis? Accept if: the horse is facing toward the camera (within roughly 45 degrees), the horse is standing still or nearly still, and the horse fills a reasonable portion of the frame. Reject if: there is no horse, the horse is in full side profile, the horse is facing completely away, or the horse is clearly running or jumping. Do not reject for dark coat color, lighting conditions, partial leg visibility, or minor stance imperfections.",
  hind:
    "Does this image show a single horse in a correct hind view for conformation analysis? To pass ALL of these must be true: the horse is facing directly away from the camera (not angled), the horse is standing completely still with all four feet flat on the ground, both hind legs are fully visible from hock to hoof, the hindquarters are square to the camera, and the tail is not completely covering both hind legs (a tied or braided tail that is partially visible is acceptable). Reject if the horse is angled, walking, the tail is covering the hind legs, or any person or object is blocking the view of the legs.",
};

const INVALID_IMAGE_ERROR =
  "Your horse photo didn't meet the criteria. Please review the photo guidelines and resubmit.";

const LANDMARK_DETECTION_USER_ERROR =
  "We couldn't detect horse landmarks in this photo. Please try a photo with better lighting, contrast, and the horse standing square.";

const OVERLAY_STORAGE_BUCKET = "horse-photos";
const FULL_REPORT_TEMP_PREFIX = "full-report-temp";

const SINGLE_VIEW_3D_DISCLAIMER =
  "3D model generated from a single photo. This is an estimated representation only — a four-view report will produce a more accurate 3D model.";

export const maxDuration = 300;

function toAnthropicMediaType(fileType: string): AnthropicImageMediaType {
  if (fileType === "image/png") return "image/png";
  if (fileType === "image/webp") return "image/webp";
  return "image/jpeg";
}

type AnalyzeRequestBody = {
  photoUrl?: string;
  viewMode?: string;
  horseName?: string;
  breed?: string;
  coatColor?: string;
  discipline?: string;
  age?: string;
  sex?: string;
  generate3D?: boolean;
};

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

function parseViewMode(value: unknown): CalibrationViewMode {
  if (typeof value !== "string") return "left";
  const trimmed = value.trim();
  if (trimmed === "front") return "front";
  if (trimmed === "hind") return "hind";
  if (trimmed === "right") return "right";
  if (trimmed === "left") return "left";
  if (trimmed === "side") return "side";
  return "left";
}

function getRoboflowModelIdForView(viewMode: CalibrationViewMode): string {
  switch (viewMode) {
    case "front":
      return process.env.ROBOFLOW_FRONT_MODEL_ID?.trim() ?? "";
    case "hind":
      return process.env.ROBOFLOW_HIND_MODEL_ID?.trim() ?? "";
    default:
      return process.env.ROBOFLOW_MODEL_ID?.trim() ?? "";
  }
}

function toUserFacingAnalyzeError(error: unknown): string {
  if (error instanceof Error && error.message.includes("Roboflow")) {
    return LANDMARK_DETECTION_USER_ERROR;
  }
  return formatAnalysisError(error);
}

function getConformationReportPrompt(viewMode: CalibrationViewMode): string {
  switch (viewMode) {
    case "front":
      return FRONT_CONFORMATION_REPORT_PROMPT;
    case "hind":
      return HIND_CONFORMATION_REPORT_PROMPT;
    case "side":
    case "left":
    case "right":
      return CONFORMATION_REPORT_PROMPT;
  }
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

async function submitMeshy3DTask(
  imageUrl: string,
  alertContext?: {
    userId?: string;
    userEmail?: string | null;
    horseName?: string | null;
  },
): Promise<string | null> {
  const apiKey = process.env.MESHY_API_KEY?.trim();
  if (!apiKey) return null;

  const sendMeshyAlert = (whatFailed: string, errorDetails: string) => {
    void sendAdminAlert(
      "Meshy 3D generation failed",
      [
        `What failed: ${whatFailed}`,
        alertContext?.userId ? `User ID: ${alertContext.userId}` : null,
        alertContext?.userEmail ? `User email: ${alertContext.userEmail}` : null,
        alertContext?.horseName ? `Horse name: ${alertContext.horseName}` : null,
        `Error details: ${errorDetails}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  };

  try {
    const meshyPayload = {
      image_urls: [imageUrl],
      ai_model: "meshy-6",
      target_formats: ["glb"],
      hd_texture: true,
    };

    console.log("[meshy] request payload:", JSON.stringify(meshyPayload, null, 2));

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
      sendMeshyAlert("Meshy task submit failed", text);
      return null;
    }

    const submitData = (await submitResponse.json()) as {
      result?: string;
    };

    if (!submitData.result) {
      const submitError = JSON.stringify(submitData);
      console.error("[meshy] submit error:", submitError);
      sendMeshyAlert("Meshy task submit returned no task ID", submitError);
      return null;
    }

    const taskId = submitData.result;
    console.log("[meshy] task submitted:", taskId);
    return taskId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[meshy] unexpected error:", error);
    sendMeshyAlert("Meshy unexpected error", message);
    return null;
  }
}

type TokenBalanceColumn =
  | "single_view_balance"
  | "single_view_3d_balance";

async function atomicDeductCredit(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  balanceColumn: TokenBalanceColumn,
  amount: number,
): Promise<
  | { ok: true }
  | { ok: false; reason: "insufficient" | "error"; message?: string }
> {
  const { data: tokenRow, error: fetchError } = await serviceClient
    .from("user_tokens")
    .select(balanceColumn)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, reason: "error", message: fetchError.message };
  }

  if (!tokenRow) {
    return { ok: false, reason: "insufficient" };
  }

  const currentBalance = Number(tokenRow[balanceColumn as keyof typeof tokenRow]);
  if (currentBalance < amount) {
    return { ok: false, reason: "insufficient" };
  }

  const { data: updated, error: updateError } = await serviceClient
    .from("user_tokens")
    .update({ [balanceColumn]: currentBalance - amount })
    .eq("user_id", userId)
    .gte(balanceColumn, amount)
    .eq(balanceColumn, currentBalance)
    .select("user_id");

  if (updateError) {
    return { ok: false, reason: "error", message: updateError.message };
  }

  if (!updated || updated.length === 0) {
    return { ok: false, reason: "insufficient" };
  }

  return { ok: true };
}

async function refundCredit(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  balanceColumn: TokenBalanceColumn,
  amount: number,
): Promise<{ ok: true } | { ok: false; message?: string }> {
  const { data: tokenRow, error: fetchError } = await serviceClient
    .from("user_tokens")
    .select(balanceColumn)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, message: fetchError.message };
  }

  if (!tokenRow) {
    return { ok: false, message: "User token row not found" };
  }

  const currentBalance = Number(tokenRow[balanceColumn as keyof typeof tokenRow]);

  const { data: updated, error: updateError } = await serviceClient
    .from("user_tokens")
    .update({ [balanceColumn]: currentBalance + amount })
    .eq("user_id", userId)
    .select("user_id");

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  if (!updated || updated.length === 0) {
    return { ok: false, message: "Refund update affected 0 rows" };
  }

  return { ok: true };
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: USER_FACING.generic }, { status: 500 });
  }

  let body: AnalyzeRequestBody;
  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json({ error: USER_FACING.generic }, { status: 400 });
  }

  const viewMode = parseViewMode(body.viewMode);
  const roboflowModelId = getRoboflowModelIdForView(viewMode);

  if (!process.env.ROBOFLOW_API_KEY?.trim() || !roboflowModelId) {
    return NextResponse.json(
      { error: LANDMARK_DETECTION_USER_ERROR },
      { status: 500 },
    );
  }

  const photoUrlRaw = body.photoUrl;
  const photoUrl = typeof photoUrlRaw === "string" ? photoUrlRaw.trim() : "";
  const horseName =
    typeof body.horseName === "string" && body.horseName.trim()
      ? body.horseName.trim()
      : null;
  const breed = typeof body.breed === "string" ? body.breed.trim() : "";
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
  const generate3D = body.generate3D === true;

  if (!breed) {
    return NextResponse.json({ error: "Breed is required" }, { status: 400 });
  }

  if (!photoUrl) {
    return NextResponse.json({ error: USER_FACING.upload }, { status: 400 });
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
      { error: USER_FACING.signInRequired },
      { status: 401 },
    );
  }

  const storagePath = validateTempImageUrl(photoUrl, user.id);
  if (!storagePath) {
    return NextResponse.json({ error: USER_FACING.upload }, { status: 400 });
  }

  let isAdmin = false;
  const { data: roleData } = await supabaseAuth
    .from("user_roles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  isAdmin = roleData?.is_admin === true;

  const balanceColumn: TokenBalanceColumn = generate3D
    ? "single_view_3d_balance"
    : "single_view_balance";
  const serviceClient = createServiceRoleClient();
  const insufficientCreditsError = generate3D
    ? USER_FACING.insufficientSingleView3d
    : USER_FACING.insufficientSingleView;

  if (!isAdmin) {
    const deductResult = await atomicDeductCredit(
      serviceClient,
      user.id,
      balanceColumn,
      1,
    );

    if (!deductResult.ok) {
      if (deductResult.reason === "insufficient") {
        return NextResponse.json({ error: insufficientCreditsError }, { status: 401 });
      }

      console.error("[analyze] CRITICAL: upfront credit deduction failed", {
        userId: user.id,
        balanceColumn,
        message: deductResult.message,
      });
      void sendAdminAlert(
        "Single-view credit deduction failed",
        [
          "What failed: Atomic upfront credit deduction",
          `User ID: ${user.id}`,
          user.email ? `User email: ${user.email}` : null,
          deductResult.message
            ? `Error message: ${deductResult.message}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );

      return NextResponse.json({ error: USER_FACING.generic }, { status: 500 });
    }
  }

  try {
    const imageResponse = await fetch(photoUrl);
    if (!imageResponse.ok) {
      return NextResponse.json({ error: USER_FACING.upload }, { status: 400 });
    }

    const inputBuffer = Buffer.from(await imageResponse.arrayBuffer());
    if (inputBuffer.length === 0) {
      return NextResponse.json({ error: USER_FACING.upload }, { status: 400 });
    }

    if (inputBuffer.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "File must be 10MB or smaller" },
        { status: 400 },
      );
    }

    const contentType =
      imageResponse.headers.get("content-type") ?? "image/jpeg";
    const normalizedContentType = contentType.split(";")[0]?.trim() ?? "";

    if (normalizedContentType && !ALLOWED_MIME.has(normalizedContentType)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, and WEBP images are allowed" },
        { status: 400 },
      );
    }

    const mediaType = toAnthropicMediaType(
      normalizedContentType || "image/jpeg",
    );
    const metadata = await sharp(inputBuffer).metadata();

    if (!metadata.width || !metadata.height) {
      return NextResponse.json({ error: USER_FACING.upload }, { status: 400 });
    }

    const ANTHROPIC_MAX_BYTES = 3145728;
    let anthropicBuffer = inputBuffer;

    if (inputBuffer.length > ANTHROPIC_MAX_BYTES) {
      let pipeline = sharp(inputBuffer);
      if (metadata.width > 1600) {
        pipeline = pipeline.resize({ width: 1600, withoutEnlargement: true });
      }
      anthropicBuffer = Buffer.from(
        await pipeline.jpeg({ quality: 80 }).toBuffer(),
      ) as Buffer<ArrayBuffer>;

      if (anthropicBuffer.length > ANTHROPIC_MAX_BYTES) {
        anthropicBuffer = Buffer.from(
          await sharp(anthropicBuffer).jpeg({ quality: 60 }).toBuffer(),
        ) as Buffer<ArrayBuffer>;
      }

      if (anthropicBuffer.length > ANTHROPIC_MAX_BYTES) {
        anthropicBuffer = Buffer.from(
          await sharp(anthropicBuffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 50 })
            .toBuffer(),
        ) as Buffer<ArrayBuffer>;
      }
    }

    const imageWidth = metadata.width;
    const imageHeight = metadata.height;
    const imageBase64 = inputBuffer.toString("base64");
    const anthropicMediaType: AnthropicImageMediaType =
      anthropicBuffer === inputBuffer ? mediaType : "image/jpeg";
    const anthropicBase64 = anthropicBuffer.toString("base64");

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const imageContent = {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: anthropicMediaType,
        data: anthropicBase64,
      },
    };

    const validationMessage = await anthropic.messages.create({
      model: "claude-opus-4-5-20251101",
      max_tokens: 256,
      system: IMAGE_VALIDATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            imageContent,
            { type: "text", text: IMAGE_VALIDATION_USER_PROMPTS[viewMode] },
          ],
        },
      ],
    });

    const validationText = validationMessage.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    let imageIsValid = false;
    try {
      const parsed = JSON.parse(validationText) as { valid?: boolean };
      imageIsValid = parsed.valid === true;
    } catch {
      const jsonMatch = validationText.match(/\{[\s\S]*"valid"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]) as { valid?: boolean };
          imageIsValid = parsed.valid === true;
        } catch {
          imageIsValid = false;
        }
      }
    }

    if (!imageIsValid) {
      return NextResponse.json({ error: INVALID_IMAGE_ERROR }, { status: 400 });
    }

    const detectedLandmarks = await detectLandmarksWithRoboflow(
      imageBase64,
      imageWidth,
      imageHeight,
      viewMode,
    );
    const landmarks = toConformationLandmarks(detectedLandmarks, viewMode);
    const reportPrompt = withReportContext(
      getConformationReportPrompt(viewMode),
      breed,
      discipline,
      age,
      sex,
      coatColor,
    );

    const reportMessage = await anthropic.messages.create({
      model: "claude-opus-4-5-20251101",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [imageContent, { type: "text", text: reportPrompt }],
        },
      ],
    });

    const reportText = reportMessage.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!reportText) {
      return NextResponse.json(
        { error: USER_FACING.analysisPhoto },
        { status: 502 },
      );
    }

    const report = parseReportResponse(reportText);

    let overlayBuffer: Buffer;
    let overlayContentType: string;

    if (isSideProfileViewMode(viewMode)) {
      overlayBuffer = await drawConformationOverlay(
        inputBuffer,
        landmarks as ConformationLandmarks,
        imageWidth,
        imageHeight,
      );
      overlayContentType = "image/jpeg";
    } else if (viewMode === "front") {
      overlayBuffer = await drawFrontConformationOverlay(
        inputBuffer,
        landmarks as FrontConformationLandmarks,
        imageWidth,
        imageHeight,
      );
      overlayContentType = "image/jpeg";
    } else if (viewMode === "hind") {
      overlayBuffer = await drawHindConformationOverlay(
        inputBuffer,
        landmarks as HindConformationLandmarks,
        imageWidth,
        imageHeight,
      );
      overlayContentType = "image/jpeg";
    } else {
      overlayBuffer = inputBuffer;
      overlayContentType = mediaType;
    }

    const overlayBase64 = overlayBuffer.toString("base64");
    const overlayImage = `data:${overlayContentType};base64,${overlayBase64}`;

    const overlayStoragePath = `overlays/${user?.id ?? "anonymous"}/${Date.now()}.jpg`;
    console.log("Uploading overlay to Supabase...", {
      bucket: OVERLAY_STORAGE_BUCKET,
      path: overlayStoragePath,
    });
    const { error: overlayUploadError } = await serviceClient.storage
      .from(OVERLAY_STORAGE_BUCKET)
      .upload(overlayStoragePath, overlayBuffer, {
        contentType: overlayContentType,
        upsert: false,
      });

    let overlayUrl = overlayImage;
    if (!overlayUploadError) {
      const { data: overlayPublicUrl } = serviceClient.storage
        .from(OVERLAY_STORAGE_BUCKET)
        .getPublicUrl(overlayStoragePath);
      overlayUrl = overlayPublicUrl.publicUrl;
      console.log("Overlay URL:", overlayUrl);
    } else {
      console.log("Overlay upload error:", overlayUploadError);
      const uploadErrorMessage = overlayUploadError.message.toLowerCase();
      if (
        uploadErrorMessage.includes("bucket") ||
        uploadErrorMessage.includes("not found")
      ) {
        console.log(
          "[analyze] Overlay upload failed: the horse-photos bucket may not exist. Create it in Supabase Storage.",
        );
      } else if (
        uploadErrorMessage.includes("policy") ||
        uploadErrorMessage.includes("rls") ||
        uploadErrorMessage.includes("denied") ||
        uploadErrorMessage.includes("unauthorized")
      ) {
        console.log(
          "[analyze] Overlay upload failed: storage RLS or policy is blocking upload to overlays/.",
        );
      }
    }

    let reportId: string | null = null;

    const glbUrl: string | null = null;
    let meshyTaskId: string | null = null;

    if (generate3D) {
      meshyTaskId = await submitMeshy3DTask(photoUrl, {
        userId: user.id,
        userEmail: user.email,
        horseName,
      });
    }

    const { data: savedReport, error: insertError } = await serviceClient
      .from("reports")
      .insert({
        user_id: user?.id ?? null,
        horse_name: horseName,
        breed: breed || null,
        coat_color: coatColor,
        age,
        sex,
        discipline,
        overall_score: report.overall_score,
        balance_score: report.balance.score,
        shoulder_score: report.shoulder_angle.score,
        hip_score: report.hip_angle.score,
        topline_score: report.topline_quality.score,
        leg_score: report.leg_alignment.score,
        report_text: reportText,
        overlay_url: overlayUrl,
        glb_url: glbUrl,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[analyze] failed to save report:", insertError);

      if (!isAdmin) {
        console.error(
          "[analyze] CRITICAL: analysis credit was deducted but report save failed",
          { userId: user.id, balanceColumn, insertError },
        );
        void sendAdminAlert(
          "Single-view report save failed",
          [
            "What failed: Report save after upfront credit deduction",
            `User ID: ${user.id}`,
            user.email ? `User email: ${user.email}` : null,
            insertError.code ? `Error code: ${insertError.code}` : null,
            `Error message: ${insertError.message}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const refundResult = await refundCredit(
          serviceClient,
          user.id,
          balanceColumn,
          1,
        );

        if (refundResult.ok) {
          console.error(
            "[analyze] CRITICAL: credit refund succeeded after report save failure",
            { userId: user.id, balanceColumn },
          );
        } else {
          console.error(
            "[analyze] CRITICAL: credit refund failed after report save failure",
            { userId: user.id, balanceColumn, message: refundResult.message },
          );
          void sendAdminAlert(
            "Single-view credit refund failed",
            [
              "What failed: Automatic credit refund after report save failure",
              `User ID: ${user.id}`,
              user.email ? `User email: ${user.email}` : null,
              refundResult.message
                ? `Error message: ${refundResult.message}`
                : null,
            ]
              .filter(Boolean)
              .join("\n"),
          );
        }

        return NextResponse.json(
          {
            error: refundResult.ok
              ? USER_FACING.saveReport
              : USER_FACING.saveReportNoRefund,
            code: "REPORT_SAVE_FAILED_AFTER_CREDIT_DEDUCTION",
            creditRefunded: refundResult.ok,
          },
          { status: 500 },
        );
      }
    } else {
      reportId = savedReport.id;

      if (user?.id && horseName) {
        await linkReportToHorse(serviceClient, user.id, savedReport.id, {
          name: horseName,
          breed: breed || null,
          coat_color: coatColor ?? "",
          age: age ?? "",
          sex: sex ?? "",
          discipline,
        });
      }
    }

    if (reportId && user?.email && user?.id) {
      try {
        if (generate3D) {
          await scheduleDelayedReportEmail(serviceClient, reportId);
        } else {
          await deliverReportReadyEmail({
            serviceClient,
            userId: user.id,
            userEmail: user.email,
            reportId,
            horseName: horseName?.trim() || "Your Horse",
            pdfBody: {
              overlayUrl,
              report,
              horse_name: horseName ?? undefined,
              breed: breed || undefined,
              age: age ?? undefined,
              sex: sex ?? undefined,
              coat_color: coatColor ?? undefined,
              discipline: discipline ? formatDisciplineList(discipline) : undefined,
            },
          });
        }
      } catch (emailError) {
        console.error("[analyze] report-ready email failed:", emailError);
      }
    }

    return NextResponse.json({
      overlayImage,
      overlayUrl,
      report,
      landmarks: detectedLandmarks,
      reportId,
      ...(generate3D
        ? { glbUrl, meshyTaskId, disclaimer: SINGLE_VIEW_3D_DISCLAIMER }
        : {}),
    });
  } catch (error) {
    console.error("[analyze] failed:", error);
    return NextResponse.json(
      { error: toUserFacingAnalyzeError(error) },
      { status: 500 },
    );
  }
}
