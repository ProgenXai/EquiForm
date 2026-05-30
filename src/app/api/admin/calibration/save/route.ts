import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { exportCalibrationToRoboflow } from "@/lib/calibration/roboflow-export";
import type {
  CalibrationViewMode,
  HorseFacing,
  LandmarkId,
  Point,
} from "@/lib/calibration/landmarks";
import { supabaseAdmin } from "@/lib/supabase";

type SaveBody = {
  horseId?: string;
  facing?: HorseFacing;
  photoUrl?: string;
  points?: Partial<Record<LandmarkId, Point>>;
  viewMode?: CalibrationViewMode;
};

function parseViewMode(value: unknown): CalibrationViewMode {
  if (value === "front" || value === "hind") return value;
  return "side";
}

function getRoboflowProjectForView(viewMode: CalibrationViewMode): string {
  switch (viewMode) {
    case "front":
      return process.env.ROBOFLOW_FRONT_PROJECT?.trim() ?? "";
    case "hind":
      return process.env.ROBOFLOW_HIND_PROJECT?.trim() ?? "";
    default:
      return process.env.ROBOFLOW_PROJECT?.trim() ?? "";
  }
}

export async function POST(request: Request) {
  console.log("[calibration/save] Route hit");

  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SaveBody;
  const horseName = body.horseId?.trim();

  if (!horseName) {
    return NextResponse.json({ error: "Horse name is required" }, { status: 400 });
  }

  if (!body.points || Object.keys(body.points).length === 0) {
    return NextResponse.json(
      { error: "No calibration points provided" },
      { status: 400 },
    );
  }

  const facing: HorseFacing = body.facing === "RIGHT" ? "RIGHT" : "LEFT";
  const viewMode = parseViewMode(body.viewMode);
  const roboflowProject = getRoboflowProjectForView(viewMode);
  const landmarks = body.points;

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("horses")
    .select("id, photo_url")
    .eq("name", horseName)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  if (existing) {
    const { error: updateError } = await supabaseAdmin
      .from("horses")
      .update({ landmarks, facing })
      .eq("id", existing.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const photoUrl =
      body.photoUrl?.trim() || existing.photo_url?.trim() || "";

    console.log("[calibration/save] Starting Roboflow export", {
      horseName,
      hasPhotoUrl: Boolean(photoUrl),
      landmarkCount: Object.keys(landmarks).length,
    });
    try {
      await exportCalibrationToRoboflow({
        horseName,
        photoUrl,
        landmarks,
        project: roboflowProject,
        viewMode,
      });
      console.log("[calibration/save] Roboflow export completed", {
        horseName,
      });
    } catch (err) {
      console.error("[calibration/save] Roboflow export failed", err);
    }

    return NextResponse.json({
      success: true,
      action: "updated",
      id: existing.id,
      name: horseName,
    });
  }

  const photoUrl = body.photoUrl?.trim() || null;

  const { data: created, error: insertError } = await supabaseAdmin
    .from("horses")
    .insert({
      name: horseName,
      landmarks,
      facing,
      photo_url: photoUrl,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const exportPhotoUrl = body.photoUrl?.trim() || photoUrl?.trim() || "";

  console.log("[calibration/save] Starting Roboflow export", {
    horseName,
    hasPhotoUrl: Boolean(exportPhotoUrl),
    landmarkCount: Object.keys(landmarks).length,
  });
  try {
    await exportCalibrationToRoboflow({
      horseName,
      photoUrl: exportPhotoUrl,
      landmarks,
      project: roboflowProject,
      viewMode,
    });
    console.log("[calibration/save] Roboflow export completed", {
      horseName,
    });
  } catch (err) {
    console.error("[calibration/save] Roboflow export failed", err);
  }

  return NextResponse.json({
    success: true,
    action: "created",
    id: created.id,
    name: horseName,
  });
}
