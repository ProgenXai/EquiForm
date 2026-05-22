import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/admin-auth";
import { exportCalibrationToRoboflow } from "@/lib/calibration/roboflow-export";
import type { LandmarkId, Point } from "@/lib/calibration/landmarks";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("horses")
    .select("name, photo_url, landmarks")
    .not("landmarks", "is", null)
    .not("photo_url", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const horse of rows ?? []) {
    const horseName = horse.name?.trim();
    const photoUrl = horse.photo_url?.trim();
    const landmarks = horse.landmarks as Partial<
      Record<LandmarkId, Point>
    > | null;

    if (
      !horseName ||
      !photoUrl ||
      !landmarks ||
      typeof landmarks !== "object" ||
      Object.keys(landmarks).length === 0
    ) {
      failed += 1;
      errors.push(
        `${horseName ?? "unknown"}: missing name, photo_url, or landmarks`,
      );
      continue;
    }

    try {
      await exportCalibrationToRoboflow({
        horseName,
        photoUrl,
        landmarks,
      });
      success += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${horseName}: ${message}`);
    }
  }

  return NextResponse.json({ success, failed, errors });
}
