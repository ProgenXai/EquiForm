"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { getReportDownloadPath } from "@/lib/reports/pdf-storage";

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
  // Fit-to-width so mobile/PWA iframe viewers don't open Letter pages at ~100% zoom.
  // Chrome/PDFium honor Adobe open parameters; unsupported browsers ignore the hash.
  const pdfIframeSrc = pdfSrc ? `${pdfSrc}#view=FitH` : "";
  const reportHref = reportId ? `/my-reports/${reportId}` : "/my-reports";

  const handleClose = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
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
    <div className="fixed inset-0 z-50 bg-black">
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close PDF"
        className="absolute z-20 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-2xl leading-none text-white transition hover:bg-zinc-700"
        style={{
          top: "max(0.75rem, env(safe-area-inset-top))",
          right: "max(0.75rem, env(safe-area-inset-right))",
        }}
      >
        ×
      </button>

      <iframe
        src={pdfIframeSrc}
        title="EquiForm report PDF"
        className="absolute inset-0 h-full w-full border-0 bg-zinc-950"
      />

      <noscript>
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-zinc-400">
            Enable JavaScript to preview the PDF, or download it directly.
          </p>
          <a
            href={getReportDownloadPath(reportId, { download: true })}
            className="text-sm font-medium text-accent underline"
          >
            Download PDF
          </a>
        </div>
      </noscript>
    </div>
  );
}
