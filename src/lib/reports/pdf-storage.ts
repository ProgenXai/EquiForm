import type { createServiceRoleClient } from "@/lib/supabase/server";

export const PDF_STORAGE_BUCKET = "horse-photos";

export function getReportPdfStoragePath(
  userId: string,
  reportId: string,
): string {
  return `reports/${userId}/${reportId}.pdf`;
}

/** Same-origin path for in-app opens (window.open / fetch). */
export function getReportDownloadPath(reportId: string): string {
  return `/api/reports/${reportId}/download`;
}

/** In-app PDF viewer with app chrome (Back/Close) — preferred over opening the raw PDF URL. */
export function getReportPdfViewerPath(reportId: string): string {
  return `/my-reports/${reportId}/pdf`;
}

/** Absolute equiform.app URL stored in `reports.pdf_url` and shared externally. */
export function getReportDownloadUrl(reportId: string): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "https://equiform.app";
  return `${appUrl}${getReportDownloadPath(reportId)}`;
}

export async function downloadReportPdfBytes(
  serviceClient: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  reportId: string,
): Promise<Uint8Array> {
  const storagePath = getReportPdfStoragePath(userId, reportId);
  const { data, error } = await serviceClient.storage
    .from(PDF_STORAGE_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(
      `Failed to download PDF: ${error?.message ?? "file not found"}`,
    );
  }

  return new Uint8Array(await data.arrayBuffer());
}
