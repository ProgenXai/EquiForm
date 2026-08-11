"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { getReportDownloadPath } from "@/lib/reports/pdf-storage";

function filenameFromContentDisposition(
  header: string | null,
): string | null {
  if (!header) return null;
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1].trim());
    } catch {
      return utfMatch[1].trim();
    }
  }
  const plainMatch = /filename="([^"]+)"|filename=([^;]+)/i.exec(header);
  const raw = plainMatch?.[1] ?? plainMatch?.[2];
  return raw?.trim() || null;
}

export default function ReportPdfViewerPage() {
  const router = useRouter();
  const params = useParams();
  const [downloadBusy, setDownloadBusy] = useState(false);
  const reportId = useMemo(() => {
    const raw = params?.id;
    return typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw)
        ? (raw[0]?.trim() ?? "")
        : "";
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

  const handleDownload = useCallback(async () => {
    if (!reportId || downloadBusy) return;

    setDownloadBusy(true);
    try {
      const response = await fetch(
        getReportDownloadPath(reportId, { download: true }),
      );
      if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
      }

      const blob = await response.blob();
      const filename =
        filenameFromContentDisposition(
          response.headers.get("Content-Disposition"),
        ) || "EquiForm-Report.pdf";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("[pdf-viewer] download failed:", error);
    } finally {
      setDownloadBusy(false);
    }
  }, [downloadBusy, reportId]);

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
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloadBusy}
          className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {downloadBusy ? "Saving…" : "Download"}
        </button>
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
