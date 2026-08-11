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
    return typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? raw[0]?.trim() ?? "" : "";
  }, [params]);

  const pdfSrc = reportId ? getReportDownloadPath(reportId) : "";
  const reportHref = reportId ? `/my-reports/${reportId}` : "/my-reports";

  const handleBack = useCallback(() => {
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-zinc-100">
      <header
        className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-black px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-900 hover:text-accent-hover"
        >
          ← Back
        </button>
        <p className="truncate text-sm font-medium text-zinc-300">Report PDF</p>
        <a
          href={pdfSrc}
          download
          className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
        >
          Download
        </a>
      </header>

      <div className="relative min-h-0 flex-1 bg-zinc-950">
        <iframe
          src={pdfSrc}
          title="EquiForm report PDF"
          className="absolute inset-0 h-full w-full border-0 bg-zinc-950"
        />
        <noscript>
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-zinc-400">
              Enable JavaScript to preview the PDF, or open it directly.
            </p>
            <a
              href={pdfSrc}
              className="text-sm font-medium text-accent underline"
            >
              Open PDF
            </a>
          </div>
        </noscript>
      </div>

      <div
        className="shrink-0 border-t border-zinc-800 bg-black px-4 py-3 sm:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <Link
          href={reportHref}
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-black transition hover:bg-accent-hover"
        >
          Close PDF
        </Link>
      </div>
    </div>
  );
}
