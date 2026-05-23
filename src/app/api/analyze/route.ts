import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import sharp from "sharp";

import {
  parseReportResponse,
  toConformationLandmarks,
} from "@/lib/analyze/landmark-parser";
import { detectLandmarksWithRoboflow } from "@/lib/analyze/roboflow-inference";
import { CONFORMATION_REPORT_PROMPT } from "@/lib/analyze/prompt";
import type { AnthropicImageMediaType } from "@/lib/analyze/media-types";
import { drawConformationOverlay } from "@/lib/calibration/draw-overlay";
import { createServiceRoleClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const maxDuration = 120;

function toAnthropicMediaType(fileType: string): AnthropicImageMediaType {
  if (fileType === "image/png") return "image/png";
  if (fileType === "image/webp") return "image/webp";
  return "image/jpeg";
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Anthropic API key is not configured" },
      { status: 500 },
    );
  }

  if (!process.env.ROBOFLOW_API_KEY?.trim() || !process.env.ROBOFLOW_MODEL_ID?.trim()) {
    return NextResponse.json(
      { error: "Roboflow API key and model ID are not configured" },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPG, PNG, and WEBP images are allowed" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File must be 10MB or smaller" },
      { status: 400 },
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

  let isAdmin = false;
  if (user) {
    const { data: roleData } = await supabaseAuth
      .from("user_roles")
      .select("is_admin")
      .eq("user_id", user.id)
      .single();

    isAdmin = roleData?.is_admin === true;
  }

  if (!isAdmin) {
  }

  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const metadata = await sharp(inputBuffer).metadata();

    if (!metadata.width || !metadata.height) {
      return NextResponse.json(
        { error: "Could not read image dimensions" },
        { status: 400 },
      );
    }

    const imageWidth = metadata.width;
    const imageHeight = metadata.height;
    const mediaType = toAnthropicMediaType(file.type);
    const imageBase64 = inputBuffer.toString("base64");

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const imageContent = {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: mediaType,
        data: imageBase64,
      },
    };

    const detectedLandmarks = await detectLandmarksWithRoboflow(
      imageBase64,
      imageWidth,
      imageHeight,
    );
    const landmarks = toConformationLandmarks(detectedLandmarks);

    const reportMessage = await anthropic.messages.create({
      model: "claude-opus-4-5-20251101",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [imageContent, { type: "text", text: CONFORMATION_REPORT_PROMPT }],
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

    const overlayBuffer = await drawConformationOverlay(
      inputBuffer,
      landmarks,
      imageWidth,
      imageHeight,
    );

    const overlayBase64 = overlayBuffer.toString("base64");
    const overlayImage = `data:image/jpeg;base64,${overlayBase64}`;

    const serviceClient = createServiceRoleClient();
    const { error: insertError } = await serviceClient.from("reports").insert({
      user_id: user?.id ?? null,
      overall_score: report.overall_score,
      balance_score: report.balance.score,
      shoulder_score: report.shoulder_angle.score,
      hip_score: report.hip_angle.score,
      topline_score: report.topline_quality.score,
      leg_score: report.leg_alignment.score,
      report_text: reportText,
      overlay_url: overlayImage,
    });

    if (insertError) {
      console.error("[analyze] failed to save report:", insertError);
    }

    return NextResponse.json({
      overlayImage,
      report,
      landmarks: detectedLandmarks,
    });
  } catch (error) {
    console.error("[analyze] failed:", error);
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
