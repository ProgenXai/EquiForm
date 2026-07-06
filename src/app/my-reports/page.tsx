"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { ConformationReport } from "@/lib/analyze/types";
import AppHamburgerMenu from "@/components/AppHamburgerMenu";
import { createClient } from "@/lib/supabase/client";
import {
  AUTH_LOAD_ERROR_MESSAGE,
  bootstrapAuthSession,
} from "@/lib/supabase/bootstrap-auth-session";
import { formatDisciplineList } from "@/lib/format-discipline";
import { formatPdfError, USER_FACING } from "@/lib/user-facing-errors";
import { parseStoredLeftRightVariance } from "@/lib/pdf/build-full-report-pdf-report";

type ReportRow = {
  id: string;
  created_at: string;
  overall_score: number | null;
  horse_name: string | null;
  breed: string | null;
  age: string | null;
  sex: string | null;
  discipline: string | null;
  pdf_url: string | null;
  report_text: string | null;
  overlay_url: string | null;
  glb_url: string | null;
  balance_score: number | null;
  shoulder_score: number | null;
  hip_score: number | null;
  topline_score: number | null;
  leg_score: number | null;
};

type ReportSectionKey = keyof Omit<
  ConformationReport,
  "overall_score" | "summary"
>;

function formatHorseDetailLines(report: {
  breed: string | null;
  age: string | null;
  sex: string | null;
  discipline: string | null;
}): string[] {
  return [
    report.breed?.trim() ? `Breed: ${report.breed.trim()}` : null,
    report.age?.trim() ? `Age: ${report.age.trim()}` : null,
    report.sex?.trim() ? `Sex: ${report.sex.trim()}` : null,
    report.discipline?.trim()
      ? `Discipline: ${formatDisciplineList(report.discipline)}`
      : null,
  ].filter((line): line is string => line !== null);
}

function formatReportDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function isConformationReport(value: unknown): value is ConformationReport {
  if (typeof value !== "object" || value === null) return false;
  const report = value as ConformationReport;
  return (
    typeof report.summary === "string" &&
    typeof report.overall_score === "number" &&
    typeof report.balance?.score === "number" &&
    typeof report.balance?.notes === "string"
  );
}

function buildFullReportPdfReport(data: {
  combinedScore: number;
  leftReport: ConformationReport;
  rightReport: ConformationReport;
  frontReport: ConformationReport;
  hindReport: ConformationReport;
}): ConformationReport {
  const viewReports = [
    { label: "Left Side", report: data.leftReport },
    { label: "Right Side", report: data.rightReport },
    { label: "Front View", report: data.frontReport },
    { label: "Hind View", report: data.hindReport },
  ];
  const sectionKeys: ReportSectionKey[] = [
    "balance",
    "shoulder_angle",
    "hip_angle",
    "topline_quality",
    "leg_alignment",
  ];

  const sections = Object.fromEntries(
    sectionKeys.map((key) => {
      const avgScore = Math.round(
        viewReports.reduce((sum, view) => sum + view.report[key].score, 0) /
          viewReports.length,
      );
      const notes = viewReports
        .map(
          (view) =>
            `${view.label} (${view.report[key].score}/100): ${view.report[key].notes}`,
        )
        .join("\n\n");

      return [key, { score: avgScore, notes }];
    }),
  ) as Pick<
    ConformationReport,
    | "balance"
    | "shoulder_angle"
    | "hip_angle"
    | "topline_quality"
    | "leg_alignment"
  >;

  const summary = viewReports
    .map(
      (view) =>
        `${view.label} — ${view.report.overall_score}/100\n${view.report.summary}`,
    )
    .join("\n\n");

  return {
    ...sections,
    overall_score: data.combinedScore,
    summary: `Full Report combined score: ${data.combinedScore}/100 (weighted: best side 40%, other side 20%, front 20%, hind 20%).\n\n${summary}`,
  };
}

function buildReportForPdf(report: ReportRow): ConformationReport | null {
  if (!report.report_text) return null;

  try {
    let parsed: unknown = JSON.parse(report.report_text);
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (typeof parsed !== "object" || parsed === null) return null;

    const data = parsed as Record<string, unknown>;

    if (data.type === "full") {
      const leftReport = data.leftReport;
      const rightReport = data.rightReport;
      const frontReport = data.frontReport;
      const hindReport = data.hindReport;

      if (
        isConformationReport(leftReport) &&
        isConformationReport(rightReport) &&
        isConformationReport(frontReport) &&
        isConformationReport(hindReport)
      ) {
        return buildFullReportPdfReport({
          combinedScore:
            typeof data.combinedScore === "number"
              ? data.combinedScore
              : leftReport.overall_score,
          leftReport,
          rightReport,
          frontReport,
          hindReport,
        });
      }
    }

    const nestedReport = data.report;
    if (isConformationReport(nestedReport)) {
      return nestedReport;
    }
  } catch {
    return null;
  }

  return null;
}

function getStoredLeftRightVarianceFields(reportText: string | null) {
  if (!reportText) return {};

  try {
    let parsed: unknown = JSON.parse(reportText);
    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }
    if (typeof parsed !== "object" || parsed === null) return {};

    const data = parsed as Record<string, unknown>;
    if (data.type !== "full") return {};

    return parseStoredLeftRightVariance(data);
  } catch {
    return {};
  }
}

const PAGE_SIZE = 10;

export default function MyReportsPage() {
  const router = useRouter();
  const [loadTrigger, setLoadTrigger] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownloadPdf(report: ReportRow) {
    if (report.pdf_url) {
      window.open(report.pdf_url, "_blank", "noopener,noreferrer");
      return;
    }

    const overlayUrl = report.overlay_url?.trim();
    const pdfReport = buildReportForPdf(report);

    if (!overlayUrl || !pdfReport) {
      setDownloadError(USER_FACING.pdfUnavailable);
      return;
    }

    setDownloadingId(report.id);
    setDownloadError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/analyze/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          reportId: report.id,
          overlayUrl,
          report: pdfReport,
          ...getStoredLeftRightVarianceFields(report.report_text),
          horse_name: report.horse_name ?? undefined,
          breed: report.breed ?? undefined,
          age: report.age ?? undefined,
          sex: report.sex ?? undefined,
          discipline: report.discipline ?? undefined,
          glb_url: report.glb_url ?? undefined,
        }),
      });

      const data = (await response.json()) as { pdfUrl?: string; error?: string };

      if (!response.ok || !data.pdfUrl) {
        throw new Error(data.error ?? "PDF generation failed. Please try again.");
      }

      setReports((current) =>
        current.map((row) =>
          row.id === report.id ? { ...row, pdf_url: data.pdfUrl ?? null } : row,
        ),
      );
      window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setDownloadError(formatPdfError(err));
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDeleteReport(report: ReportRow) {
    if (confirmDeleteId !== report.id) {
      setConfirmDeleteId(report.id);
      return;
    }
    setConfirmDeleteId(null);

    setDeletingId(report.id);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) return;

      // Delete storage files
      const pathsToDelete: string[] = [];
      const bucket = "horse-photos";

      const extractPath = (url: string | null) => {
        if (!url) return null;
        const marker = `/storage/v1/object/public/${bucket}/`;
        try {
          const parsed = new URL(url);
          const idx = parsed.pathname.indexOf(marker);
          if (idx === -1) return null;
          return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
        } catch {
          return null;
        }
      };

      const overlayPath = extractPath(report.overlay_url);
      const glbPath = extractPath(report.glb_url);
      const pdfPath = extractPath(report.pdf_url);

      if (overlayPath) pathsToDelete.push(overlayPath);
      if (glbPath) pathsToDelete.push(glbPath);
      if (pdfPath) pathsToDelete.push(pdfPath);

      if (pathsToDelete.length > 0) {
        await supabase.storage.from(bucket).remove(pathsToDelete);
      }

      // Delete report from database
      const { error: deleteError } = await supabase
        .from("reports")
        .delete()
        .eq("id", report.id)
        .eq("user_id", session.user.id);

      if (deleteError) {
        console.error("Delete failed:", deleteError);
        setDownloadError("Failed to delete report. Please try again.");
        return;
      }

      setReports((current) => current.filter((r) => r.id !== report.id));
      setTotalCount((current) => current - 1);
    } catch (err) {
      console.error("Failed to delete report:", err);
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    setLoadTrigger(Date.now());
  }, []);

  useEffect(() => {
    setLoading(true);
    setReports([]);
    setLoadError(null);

    const cleanup = bootstrapAuthSession({
      logPrefix: "[my-reports]",
      onUnauthenticated: () => {
        router.replace("/");
      },
      onTimeout: () => {
        setLoading(false);
        setLoadError(AUTH_LOAD_ERROR_MESSAGE);
      },
      onAuthenticated: async (session) => {
        setLoading(true);
        setReports([]);

        const supabase = createClient();
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error, count } = await supabase
          .from("reports")
          .select(
            "id, created_at, overall_score, horse_name, breed, age, sex, discipline, pdf_url, report_text, overlay_url, glb_url, balance_score, shoulder_score, hip_score, topline_score, leg_score",
            { count: "exact" },
          )
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .range(from, to);

        if (!error && data) {
          setReports(data as ReportRow[]);
          setTotalCount(count ?? 0);
        }

        setLoading(false);
      },
    });

    return cleanup;
  }, [router, page, loadTrigger]);

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />
      <Link
        href="/analyze"
        className="inline-block px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        ← Back to Analyze
      </Link>

      <header className="border-b border-zinc-800 bg-black px-6 py-8 text-center">
        <div className="flex justify-center">
          <Image
            src="/equiform-logo.png"
            alt="EquiForm"
            width={300}
            height={300}
            priority
            className="object-contain"
          />
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          The most advanced AI equine conformation analysis available
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white">My Reports</h1>
          <p className="mt-2 text-sm text-zinc-400">
            View your past horse conformation analyses
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-400">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
            Loading your reports…
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-12 text-center">
            <p className="text-sm text-zinc-300">{loadError}</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-12 text-center">
            <p className="text-sm text-zinc-300">
              No reports yet. Analyze your first horse!
            </p>
            <Link
              href="/analyze"
              className="mt-6 inline-block rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Go to Analyze
            </Link>
          </div>
        ) : (
          <>
            {downloadError ? (
              <p className="mb-4 text-center text-sm text-red-400" role="alert">
                {downloadError}
              </p>
            ) : null}
            <ul className="space-y-4">
              {reports.map((report) => (
                <li
                  key={report.id}
                  className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      {report.horse_name?.trim() || "Unnamed Horse"}
                    </p>
                    {formatHorseDetailLines(report).map((line) => (
                      <p key={line} className="mt-1 text-xs text-zinc-400">
                        {line}
                      </p>
                    ))}
                    <p className="mt-1 text-xs text-zinc-400">
                      {formatReportDate(report.created_at)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">
                      Overall score:{" "}
                      <span className="font-semibold text-accent">
                        {report.overall_score ?? "—"}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleDownloadPdf(report)}
                      disabled={downloadingId === report.id}
                      className="inline-block rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-center text-sm font-semibold text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {downloadingId === report.id
                        ? "Generating PDF…"
                        : "Download PDF"}
                    </button>
                    <Link
                      href={`/my-reports/${report.id}`}
                      className="inline-block rounded-lg bg-accent px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-accent-hover"
                    >
                      View Report
                    </Link>
                    {confirmDeleteId === report.id ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDeleteReport(report)}
                          disabled={deletingId === report.id}
                          className="inline-block rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-center text-sm font-semibold text-red-400 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {deletingId === report.id ? "Deleting…" : "Confirm Delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="inline-block rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-center text-sm font-semibold text-zinc-400 transition hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleDeleteReport(report)}
                        disabled={deletingId === report.id}
                        className="inline-block rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-center text-sm font-semibold text-red-400 transition hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {totalCount > PAGE_SIZE ? (
              <div className="mt-8 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0 || loading}
                  className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-accent/60 hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={loading || (page + 1) * PAGE_SIZE >= totalCount}
                  className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-accent/60 hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
