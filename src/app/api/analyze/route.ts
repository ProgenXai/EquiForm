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
import { sendFirstReportEmail } from "@/lib/email/templates";
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

function getRoboflowModelIdEnvVarName(viewMode: CalibrationViewMode): string {
  switch (viewMode) {
    case "front":
      return "ROBOFLOW_FRONT_MODEL_ID";
    case "hind":
      return "ROBOFLOW_HIND_MODEL_ID";
    default:
      return "ROBOFLOW_MODEL_ID";
  }
}

function toUserFacingAnalyzeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("Roboflow")) {
      return LANDMARK_DETECTION_USER_ERROR;
    }
    return error.message;
  }
  return "Analysis failed";
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

async function generateMeshy3DModel(imageUrl: string): Promise<string | null> {
  const apiKey = process.env.MESHY_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const meshyPayload = {
      image_urls: [imageUrl],
      ai_model: "meshy-6",
      target_formats: ["glb"],
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

    const maxAttempts = 60;
    const pollInterval = 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const statusResponse = await fetch(
        `https://api.meshy.ai/openapi/v1/multi-image-to-3d/${taskId}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      if (!statusResponse.ok) {
        console.error("[meshy] poll failed:", await statusResponse.text());
        continue;
      }

      const taskData = (await statusResponse.json()) as {
        status?: string;
        model_urls?: { glb?: string };
      };

      const status = taskData.status;
      console.log(`[meshy] attempt ${attempt + 1} status:`, status);

      if (status === "SUCCEEDED") {
        const glbUrl = taskData.model_urls?.glb ?? null;
        console.log("[meshy] model ready:", glbUrl);
        return glbUrl;
      }

      if (status === "FAILED") {
        console.log("[meshy] failure detail:", JSON.stringify(taskData, null, 2));
        console.error("[meshy] task failed with status:", status);
        return null;
      }
    }

    console.error("[meshy] timed out");
    return null;
  } catch (error) {
    console.error("[meshy] unexpected error:", error);
    return null;
  }
}

async function persistMeshyGlbToSupabase(
  meshyGlbUrl: string,
  userId: string,
  serviceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<string | null> {
  try {
    const glbResponse = await fetch(meshyGlbUrl);
    if (!glbResponse.ok) {
      console.error(
        "[analyze] failed to download GLB from Meshy:",
        meshyGlbUrl,
      );
      return null;
    }

    const glbBuffer = Buffer.from(await glbResponse.arrayBuffer());
    const storagePath = `3d-models/${userId}/${Date.now()}.glb`;

    const { error: uploadError } = await serviceClient.storage
      .from(OVERLAY_STORAGE_BUCKET)
      .upload(storagePath, glbBuffer, {
        contentType: "model/gltf-binary",
        upsert: false,
      });

    if (uploadError) {
      console.error("[analyze] GLB upload failed:", uploadError);
      return null;
    }

    const { data: publicUrlData } = serviceClient.storage
      .from(OVERLAY_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error("[analyze] persistMeshyGlbToSupabase error:", error);
    return null;
  }
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key is not configured" },
      { status: 500 },
    );
  }

  let body: AnalyzeRequestBody;
  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const viewMode = parseViewMode(body.viewMode);
  const roboflowModelId = getRoboflowModelIdForView(viewMode);
  const roboflowModelIdEnvVar = getRoboflowModelIdEnvVarName(viewMode);

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
  const discipline =
    typeof body.discipline === "string" && body.discipline.trim()
      ? body.discipline.trim()
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
    return NextResponse.json({ error: "Missing photo URL" }, { status: 400 });
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
      { error: "Authentication required for analysis" },
      { status: 401 },
    );
  }

  const storagePath = validateTempImageUrl(photoUrl, user.id);
  if (!storagePath) {
    return NextResponse.json({ error: "Invalid photo URL" }, { status: 400 });
  }

  let isAdmin = false;
  const { data: roleData } = await supabaseAuth
    .from("user_roles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  isAdmin = roleData?.is_admin === true;

  try {
    const imageResponse = await fetch(photoUrl);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch photo" },
        { status: 400 },
      );
    }

    const inputBuffer = Buffer.from(await imageResponse.arrayBuffer());
    if (inputBuffer.length === 0) {
      return NextResponse.json({ error: "Photo is empty" }, { status: 400 });
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
      return NextResponse.json(
        { error: "Could not read image dimensions" },
        { status: 400 },
      );
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
        { error: "Empty report response from vision model" },
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

    const serviceClient = createServiceRoleClient();

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

    const { data: savedReport, error: insertError } = await serviceClient
      .from("reports")
      .insert({
        user_id: user?.id ?? null,
        horse_name: horseName,
        overall_score: report.overall_score,
        balance_score: report.balance.score,
        shoulder_score: report.shoulder_angle.score,
        hip_score: report.hip_angle.score,
        topline_score: report.topline_quality.score,
        leg_score: report.leg_alignment.score,
        report_text: reportText,
        overlay_url: overlayUrl,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[analyze] failed to save report:", insertError);
    } else {
      reportId = savedReport.id;
    }

    if (reportId && user?.email) {
      const { count, error: countError } = await serviceClient
        .from("reports")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (!countError && count === 1) {
        try {
          await sendFirstReportEmail({
            email: user.email,
            horseName: horseName ?? undefined,
          });
        } catch (emailError) {
          console.error("[analyze] first-report email failed:", emailError);
        }
      }
    }

    if (!isAdmin && user) {
      const { data: tokenRow, error: fetchError } = await serviceClient
        .from("user_tokens")
        .select("single_view_balance")
        .eq("user_id", user.id)
        .gt("single_view_balance", 0)
        .maybeSingle();

      if (fetchError) {
        console.error("[analyze] failed to deduct token:", fetchError);
      } else if (tokenRow) {
        const { error: deductError } = await serviceClient
          .from("user_tokens")
          .update({
            single_view_balance: tokenRow.single_view_balance - 1,
          })
          .eq("user_id", user.id)
          .gt("single_view_balance", 0);

        if (deductError) {
          console.error("[analyze] failed to deduct token:", deductError);
        }
      }
    }

    let glbUrl: string | null = null;

    if (generate3D) {
      const meshyGlbUrl = await generateMeshy3DModel(photoUrl);
      glbUrl = meshyGlbUrl
        ? await persistMeshyGlbToSupabase(meshyGlbUrl, user.id, serviceClient)
        : null;
    }

    return NextResponse.json({
      overlayImage,
      overlayUrl,
      report,
      landmarks: detectedLandmarks,
      reportId,
      ...(generate3D
        ? { glbUrl, disclaimer: SINGLE_VIEW_3D_DISCLAIMER }
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
