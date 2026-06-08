import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { sendAdminAlert } from "@/lib/email/admin-alerts";
import { createServiceRoleClient } from "@/lib/supabase/server";

const OVERLAY_STORAGE_BUCKET = "horse-photos";

async function persistMeshyGlbToSupabase(
  meshyGlbUrl: string,
  userId: string,
  serviceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<string | null> {
  try {
    const glbResponse = await fetch(meshyGlbUrl);
    if (!glbResponse.ok) {
      console.error(
        "[meshy-status] failed to download GLB from Meshy:",
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
      console.error("[meshy-status] GLB upload failed:", uploadError);
      return null;
    }

    const { data: publicUrlData } = serviceClient.storage
      .from(OVERLAY_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error("[meshy-status] persistMeshyGlbToSupabase error:", error);
    return null;
  }
}

export async function GET(request: Request) {
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
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const taskId = new URL(request.url).searchParams.get("taskId")?.trim();
  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  const reportId = new URL(request.url).searchParams.get("reportId")?.trim();

  const apiKey = process.env.MESHY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Meshy API key is not configured" },
      { status: 500 },
    );
  }

  try {
    const statusResponse = await fetch(
      `https://api.meshy.ai/openapi/v1/multi-image-to-3d/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!statusResponse.ok) {
      const pollError = await statusResponse.text();
      console.error("[meshy-status] poll failed:", pollError);
      void sendAdminAlert(
        "Meshy 3D generation failed",
        [
          "What failed: Meshy task status poll failed",
          `User ID: ${user.id}`,
          user.email ? `User email: ${user.email}` : null,
          reportId ? `Report ID: ${reportId}` : null,
          `Task ID: ${taskId}`,
          `Error details: ${pollError}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      return NextResponse.json(
        { error: "Failed to fetch Meshy task status" },
        { status: 502 },
      );
    }

    const taskData = (await statusResponse.json()) as {
      status?: string;
      model_urls?: { glb?: string };
    };

    const status = taskData.status ?? "UNKNOWN";
    console.log("[meshy-status] task status:", taskId, status);

    if (status === "SUCCEEDED") {
      const meshyGlbUrl = taskData.model_urls?.glb ?? null;
      if (!meshyGlbUrl) {
        return NextResponse.json(
          { status, error: "Meshy task succeeded but no GLB URL was returned" },
          { status: 502 },
        );
      }

      const serviceClient = createServiceRoleClient();
      const glbUrl = await persistMeshyGlbToSupabase(
        meshyGlbUrl,
        user.id,
        serviceClient,
      );

      if (!glbUrl) {
        return NextResponse.json(
          { status, error: "Failed to store 3D model" },
          { status: 500 },
        );
      }

      if (reportId) {
        const { error: updateError } = await serviceClient
          .from("reports")
          .update({ glb_url: glbUrl })
          .eq("id", reportId)
          .eq("user_id", user.id);

        if (updateError) {
          console.error(
            "[meshy-status] failed to update report glb_url:",
            updateError,
          );
        }
      }

      return NextResponse.json({ status, glbUrl });
    }

    if (status === "FAILED") {
      const failureDetail = JSON.stringify(taskData);
      console.log("[meshy-status] failure detail:", failureDetail);

      let horseName: string | null = null;
      if (reportId) {
        const serviceClient = createServiceRoleClient();
        const { data: reportRow } = await serviceClient
          .from("reports")
          .select("horse_name")
          .eq("id", reportId)
          .eq("user_id", user.id)
          .maybeSingle();
        horseName = reportRow?.horse_name ?? null;
      }

      void sendAdminAlert(
        "Meshy 3D generation failed",
        [
          "What failed: Meshy task returned FAILED status",
          `User ID: ${user.id}`,
          user.email ? `User email: ${user.email}` : null,
          horseName ? `Horse name: ${horseName}` : null,
          reportId ? `Report ID: ${reportId}` : null,
          `Task ID: ${taskId}`,
          `Error details: ${failureDetail}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );

      return NextResponse.json(
        { status, error: "3D model generation failed" },
        { status: 502 },
      );
    }

    return NextResponse.json({ status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[meshy-status] failed:", error);
    void sendAdminAlert(
      "Meshy 3D generation failed",
      [
        "What failed: Meshy status check unexpected error",
        `User ID: ${user.id}`,
        user.email ? `User email: ${user.email}` : null,
        taskId ? `Task ID: ${taskId}` : null,
        `Error details: ${message}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return NextResponse.json(
      { error: "Failed to check Meshy task status" },
      { status: 500 },
    );
  }
}
