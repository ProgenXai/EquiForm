"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import { getReportDownloadPath } from "@/lib/reports/pdf-storage";

const PDF_VIEWPORT_CONTENT =
  "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes";

export default function ReportPdfViewerPage() {
  const router = useRouter();
  const params = useParams();
  const reportId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw)
        ? (raw[0]?.trim() ?? "")
        : "";
  }, [params]);

  const pdfSrc = reportId ? getReportDownloadPath(reportId) : "";
  const pdfIframeSrc = pdfSrc ? `${pdfSrc}#view=FitH` : "";
  const reportHref = reportId ? `/my-reports/${reportId}` : "/my-reports";

  // Soft client navigations may keep the root layout's maximum-scale=1 meta.
  // Force-enable pinch-zoom while this viewer is mounted, then restore on exit.
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;

    const previous = meta.getAttribute("content");
    meta.setAttribute("content", PDF_VIEWPORT_CONTENT);

    return () => {
      if (previous != null) {
        meta.setAttribute("content", previous);
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    router.push(reportHref);
  }, [reportHref, router]);

  if (!reportId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-zinc-100">
        <p className="text-sm text-zinc-400">Report not found.</p>
        <Link
          href="/my-reports"
          className="text-sm font-medium text-accent transition hover:text-accent-hover"
        >
          ← Back to My Reports
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* X must sit outside the iframe — native PDF plugins steal taps from overlays. */}
      <div
        className="flex shrink-0 justify-end px-3 pb-2"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close PDF"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-2xl leading-none text-white transition hover:bg-zinc-700"
        >
          ×
        </button>
      </div>

      <iframe
        src={pdfIframeSrc}
        title="EquiForm report PDF"
        className="min-h-0 w-full flex-1 border-0 bg-zinc-950"
      />
    </div>
  );
}
