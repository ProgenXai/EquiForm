import { NextResponse } from "next/server";

import { sendAdminAlert } from "@/lib/email/admin-alerts";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const maxDuration = 300;

async function persistMeshyGlbToSupabase(
  meshyGlbUrl: string,
  userId: string,
  serviceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<{ glbUrl: string | null; errorDetails: string | null }> {
  try {
    const glbResponse = await fetch(meshyGlbUrl);
    if (!glbResponse.ok) {
      return {
        glbUrl: null,
        errorDetails: `Failed to download GLB from Meshy (HTTP ${glbResponse.status})`,
      };
    }

    const glbBuffer = Buffer.from(await glbResponse.arrayBuffer());
    const storagePath = `3d-models/${userId}/${Date.now()}.glb`;

    const { error: uploadError } = await serviceClient.storage
      .from("horse-photos")
      .upload(storagePath, glbBuffer, {
        contentType: "model/gltf-binary",
        upsert: false,
      });

    if (uploadError) {
      return {
        glbUrl: null,
        errorDetails: `GLB upload failed (${glbBuffer.length} bytes): ${uploadError.message}`,
      };
    }

    const { data: publicUrlData } = serviceClient.storage
      .from("horse-photos")
      .getPublicUrl(storagePath);

    return { glbUrl: publicUrlData.publicUrl, errorDetails: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      glbUrl: null,
      errorDetails: `persistMeshyGlbToSupabase unexpected error: ${message}`,
    };
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.MESHY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Meshy API key not configured" }, { status: 500 });
  }

  const serviceClient = createServiceRoleClient();

  const { data: pendingReports, error } = await serviceClient
    .from("reports")
    .select("id, user_id, meshy_task_id, horse_name")
    .not("meshy_task_id", "is", null)
    .is("glb_url", null)
    .limit(20);

  if (error || !pendingReports) {
    return NextResponse.json({ error: "Failed to fetch pending reports" }, { status: 500 });
  }

  const results = [];

  for (const report of pendingReports) {
    try {
      const statusResponse = await fetch(
        `https://api.meshy.ai/openapi/v1/multi-image-to-3d/${report.meshy_task_id}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );

      if (!statusResponse.ok) {
        const pollError = await statusResponse.text();
        void sendAdminAlert(
          "Meshy 3D generation failed",
          [
            "What failed: Cron Meshy task status poll failed",
            `Report ID: ${report.id}`,
            `User ID: ${report.user_id}`,
            report.horse_name ? `Horse name: ${report.horse_name}` : null,
            `Task ID: ${report.meshy_task_id}`,
            `Error details: ${pollError}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        results.push({ id: report.id, status: "poll_failed" });
        continue;
      }

      const taskData = (await statusResponse.json()) as {
        status?: string;
        model_urls?: { glb?: string };
      };

      const status = taskData.status ?? "UNKNOWN";

      if (status === "SUCCEEDED") {
        const meshyGlbUrl = taskData.model_urls?.glb ?? null;
        if (!meshyGlbUrl) {
          void sendAdminAlert(
            "Meshy 3D generation failed",
            [
              "What failed: Cron — Meshy task succeeded but no GLB URL was returned",
              `Report ID: ${report.id}`,
              `User ID: ${report.user_id}`,
              report.horse_name ? `Horse name: ${report.horse_name}` : null,
              `Task ID: ${report.meshy_task_id}`,
            ]
              .filter(Boolean)
              .join("\n"),
          );
          results.push({ id: report.id, status: "no_glb_url" });
          continue;
        }

        const { glbUrl, errorDetails } = await persistMeshyGlbToSupabase(
          meshyGlbUrl,
          report.user_id,
          serviceClient,
        );

        if (glbUrl) {
          await serviceClient
            .from("reports")
            .update({ glb_url: glbUrl, meshy_task_id: null })
            .eq("id", report.id);

          results.push({ id: report.id, status: "completed", glbUrl });
        } else {
          void sendAdminAlert(
            "Meshy 3D generation failed",
            [
              "What failed: Cron — Meshy task succeeded but GLB persistence failed",
              `Report ID: ${report.id}`,
              `User ID: ${report.user_id}`,
              report.horse_name ? `Horse name: ${report.horse_name}` : null,
              `Task ID: ${report.meshy_task_id}`,
              errorDetails ? `Error details: ${errorDetails}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          );
          results.push({ id: report.id, status: "glb_upload_failed" });
        }
      } else if (status === "FAILED" || status === "CANCELED") {
        await serviceClient
          .from("reports")
          .update({ meshy_task_id: null })
          .eq("id", report.id);

        void sendAdminAlert(
          "Meshy 3D generation failed",
          [
            `What failed: Cron — Meshy task returned ${status}`,
            `Report ID: ${report.id}`,
            `User ID: ${report.user_id}`,
            report.horse_name ? `Horse name: ${report.horse_name}` : null,
            `Task ID: ${report.meshy_task_id}`,
            `Error details: ${JSON.stringify(taskData)}`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        results.push({ id: report.id, status: "meshy_failed" });
      } else {
        results.push({ id: report.id, status });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void sendAdminAlert(
        "Meshy 3D generation failed",
        [
          "What failed: Cron complete-3d-models unexpected error",
          `Report ID: ${report.id}`,
          `User ID: ${report.user_id}`,
          report.horse_name ? `Horse name: ${report.horse_name}` : null,
          `Task ID: ${report.meshy_task_id}`,
          `Error details: ${message}`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      results.push({ id: report.id, status: "error" });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
