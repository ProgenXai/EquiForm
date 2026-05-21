import { NextResponse } from "next/server";
import sharp from "sharp";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

const BUCKET = "horse-photos";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function isHeicFile(file: File): boolean {
  if (file.type === "image/heic" || file.type === "image/heif") {
    return true;
  }
  const lower = file.name.toLowerCase();
  return lower.endsWith(".heic") || lower.endsWith(".heif");
}

function isAllowedUpload(file: File): boolean {
  return ALLOWED_TYPES.has(file.type) || isHeicFile(file);
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const horseId = String(formData.get("horseId") ?? "").trim();

  if (!horseId) {
    return NextResponse.json({ error: "Horse ID is required" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!isAllowedUpload(file)) {
    return NextResponse.json(
      { error: "Only JPG, PNG, WEBP, and HEIC images are allowed" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File must be 10MB or smaller" },
      { status: 400 },
    );
  }

  let buffer = Buffer.from(await file.arrayBuffer());
  let contentType = file.type;
  let ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";

  if (isHeicFile(file)) {
    try {
      const jpegBuffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
      buffer = Buffer.from(jpegBuffer);
      contentType = "image/jpeg";
      ext = "jpg";
    } catch (err) {
      console.error("[calibration/upload] HEIC conversion failed", err);
      return NextResponse.json(
        { error: "Failed to convert HEIC image to JPEG" },
        { status: 400 },
      );
    }
  }

  const timestamp = Date.now();
  const path = `reference/${horseId}/calibration_${timestamp}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    console.error("[calibration/upload] Storage upload failed", {
      bucket: BUCKET,
      path,
      horseId,
      fileType: file.type,
      fileSize: file.size,
      message: error.message,
      cause:
        "cause" in error
          ? (error as Error & { cause?: unknown }).cause
          : undefined,
      error,
    });
    console.error(
      "[calibration/upload] Full error (serialized):",
      JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
    );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return NextResponse.json({
    success: true,
    path,
    publicUrl: publicUrlData.publicUrl,
  });
}
