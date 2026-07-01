import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const maxDuration = 300;

async function persistMeshyGlbToSupabase(
  meshyGlbUrl: string,
  userId: string,
  serviceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<string | null> {
  try {
    const glbResponse = await fetch(meshyGlbUrl);
    if (!glbResponse.ok) return null;

    const glbBuffer = Buffer.from(await glbResponse.arrayBuffer());
    const storagePath = `3d-models/${userId}/${Date.now()}.glb`;

    const { error: uploadError } = await serviceClient.storage
      .from("horse-photos")
      .upload(storagePath, glbBuffer, {
        contentType: "model/gltf-binary",
        upsert: false,
      });

    if (uploadError) return null;

    const { data: publicUrlData } = serviceClient.storage
      .from("horse-photos")
      .getPublicUrl(storagePath);

    return publicUrlData.publicUrl;
  } catch {
    return null;
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
    .select("id, user_id, meshy_task_id")
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
          results.push({ id: report.id, status: "no_glb_url" });
          continue;
        }

        const glbUrl = await persistMeshyGlbToSupabase(
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
          results.push({ id: report.id, status: "glb_upload_failed" });
        }
      } else if (status === "FAILED" || status === "CANCELED") {
        await serviceClient
          .from("reports")
          .update({ meshy_task_id: null })
          .eq("id", report.id);

        results.push({ id: report.id, status: "meshy_failed" });
      } else {
        results.push({ id: report.id, status });
      }
    } catch {
      results.push({ id: report.id, status: "error" });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
