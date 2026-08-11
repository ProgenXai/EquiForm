import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { sendAdminAlert } from "@/lib/email/admin-alerts";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { USER_FACING } from "@/lib/user-facing-errors";

const OVERLAY_STORAGE_BUCKET = "horse-photos";

async function persistMeshyGlbToSupabase(
  meshyGlbUrl: string,
  userId: string,
  serviceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<{ glbUrl: string | null; errorDetails: string | null }> {
  try {
    const glbResponse = await fetch(meshyGlbUrl);
    if (!glbResponse.ok) {
      const errorDetails = `Failed to download GLB from Meshy (HTTP ${glbResponse.status}): ${meshyGlbUrl}`;
      console.error("[meshy-status]", errorDetails);
      return { glbUrl: null, errorDetails };
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
      const errorDetails = `GLB upload failed (${glbBuffer.length} bytes): ${uploadError.message}`;
      console.error("[meshy-status]", errorDetails, uploadError);
      return { glbUrl: null, errorDetails };
    }

    const { data: publicUrlData } = serviceClient.storage
      .from(OVERLAY_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    return { glbUrl: publicUrlData.publicUrl, errorDetails: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorDetails = `persistMeshyGlbToSupabase unexpected error: ${message}`;
    console.error("[meshy-status]", errorDetails, error);
    return { glbUrl: null, errorDetails };
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
    return NextResponse.json({ error: USER_FACING.signInRequired }, { status: 401 });
  }

  const taskId = new URL(request.url).searchParams.get("taskId")?.trim();
  if (!taskId) {
    return NextResponse.json({ error: USER_FACING.mesh3d }, { status: 400 });
  }

  const reportId = new URL(request.url).searchParams.get("reportId")?.trim();

  const apiKey = process.env.MESHY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: USER_FACING.mesh3d }, { status: 500 });
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
      return NextResponse.json({ error: USER_FACING.mesh3d }, { status: 502 });
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
        void sendAdminAlert(
          "Meshy 3D generation failed",
          [
            "What failed: Meshy task succeeded but no GLB URL was returned",
            `User ID: ${user.id}`,
            user.email ? `User email: ${user.email}` : null,
            reportId ? `Report ID: ${reportId}` : null,
            `Task ID: ${taskId}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        return NextResponse.json(
          { status, error: USER_FACING.mesh3d },
          { status: 502 },
        );
      }

      const serviceClient = createServiceRoleClient();
      const { glbUrl, errorDetails } = await persistMeshyGlbToSupabase(
        meshyGlbUrl,
        user.id,
        serviceClient,
      );

      if (!glbUrl) {
        void sendAdminAlert(
          "Meshy 3D generation failed",
          [
            "What failed: Meshy task succeeded but GLB persistence failed",
            `User ID: ${user.id}`,
            user.email ? `User email: ${user.email}` : null,
            reportId ? `Report ID: ${reportId}` : null,
            `Task ID: ${taskId}`,
            errorDetails ? `Error details: ${errorDetails}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        return NextResponse.json(
          { status, error: USER_FACING.mesh3d },
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
          void sendAdminAlert(
            "Meshy 3D generation failed",
            [
              "What failed: GLB stored but report glb_url update failed",
              `User ID: ${user.id}`,
              user.email ? `User email: ${user.email}` : null,
              reportId ? `Report ID: ${reportId}` : null,
              `Task ID: ${taskId}`,
              `GLB URL: ${glbUrl}`,
              `Error details: ${updateError.message}`,
            ]
              .filter(Boolean)
              .join("\n"),
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
        { status, error: USER_FACING.mesh3d },
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
      { error: USER_FACING.mesh3d },
      { status: 500 },
    );
  }
}
