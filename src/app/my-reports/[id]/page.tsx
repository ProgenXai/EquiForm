"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { ConformationReport, LeftRightVarianceItem } from "@/lib/analyze/types";
import { formatDisciplineList } from "@/lib/format-discipline";
import type { CalibrationViewMode } from "@/lib/calibration/landmarks";
import type { HorseViewer3DHandle } from "@/components/HorseViewer3D";
import AppHamburgerMenu from "@/components/AppHamburgerMenu";
import { createClient } from "@/lib/supabase/client";
import { getReportDownloadPath } from "@/lib/reports/pdf-storage";
import { formatPdfError, USER_FACING } from "@/lib/user-facing-errors";
import { parseStoredLeftRightVariance } from "@/lib/pdf/build-full-report-pdf-report";

const HorseViewer3D = dynamic(
  () => import("@/components/HorseViewer3D"),
  { ssr: false },
);

type ReportSectionKey = keyof Omit<
  ConformationReport,
  "overall_score" | "summary"
>;

type StoredFullReport = {
  combinedScore: number;
  betterSide: "left" | "right";
  leftReport: ConformationReport;
  rightReport: ConformationReport;
  frontReport: ConformationReport;
  hindReport: ConformationReport;
  coatColor?: string;
  markings?: string[];
  markingsDescription?: string;
  leftRightVariance?: LeftRightVarianceItem[];
  leftRightVarianceSummary?: string | null;
};

type ParsedStoredReport =
  | { kind: "full"; data: StoredFullReport }
  | {
      kind: "single";
      summary: string;
      notes: Record<ReportSectionKey, string | undefined>;
    }
  | { kind: "raw"; raw: string };

type ReportDetail = {
  id: string;
  created_at: string;
  horse_name: string | null;
  breed: string | null;
  age: string | null;
  sex: string | null;
  discipline: string | null;
  overall_score: number | null;
  balance_score: number | null;
  shoulder_score: number | null;
  hip_score: number | null;
  topline_score: number | null;
  leg_score: number | null;
  report_text: string | null;
  overlay_url: string | null;
  glb_url: string | null;
  pdf_url: string | null;
};

const SIDE_REPORT_SECTIONS: { key: ReportSectionKey; label: string }[] = [
  { key: "balance", label: "Balance (rule of thirds)" },
  { key: "shoulder_angle", label: "Shoulder Angle" },
  { key: "hip_angle", label: "Hip Angle" },
  { key: "topline_quality", label: "Topline Quality" },
  { key: "leg_alignment", label: "Leg Alignment" },
];

const REPORT_SECTIONS_BY_VIEW: Record<
  CalibrationViewMode,
  { key: ReportSectionKey; label: string }[]
> = {
  side: SIDE_REPORT_SECTIONS,
  left: SIDE_REPORT_SECTIONS,
  right: SIDE_REPORT_SECTIONS,
  front: [
    { key: "balance", label: "Balance (rule of thirds)" },
    { key: "shoulder_angle", label: "Chest & Shoulder Width" },
    { key: "hip_angle", label: "Knee Alignment" },
    { key: "topline_quality", label: "Cannon Bone Alignment" },
    { key: "leg_alignment", label: "Fetlock & Hoof Symmetry" },
  ],
  hind: [
    { key: "balance", label: "Balance (rule of thirds)" },
    { key: "shoulder_angle", label: "Hip Width & Muscling" },
    { key: "hip_angle", label: "Hindquarter Symmetry" },
    { key: "topline_quality", label: "Hock Alignment" },
    { key: "leg_alignment", label: "Cannon & Hoof Alignment" },
  ],
};

const FULL_REPORT_VIEWS: {
  view: CalibrationViewMode;
  label: string;
  reportKey: keyof Pick<
    StoredFullReport,
    "leftReport" | "rightReport" | "frontReport" | "hindReport"
  >;
}[] = [
  { view: "left", label: "Left Side", reportKey: "leftReport" },
  { view: "right", label: "Right Side", reportKey: "rightReport" },
  { view: "front", label: "Front View", reportKey: "frontReport" },
  { view: "hind", label: "Hind View", reportKey: "hindReport" },
];

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

function extractSectionNotes(
  report: ConformationReport,
): Record<ReportSectionKey, string | undefined> {
  return {
    balance: report.balance.notes,
    shoulder_angle: report.shoulder_angle.notes,
    hip_angle: report.hip_angle.notes,
    topline_quality: report.topline_quality.notes,
    leg_alignment: report.leg_alignment.notes,
  };
}

function parseStoredReportText(text: string): ParsedStoredReport {
  try {
    let parsed: unknown = JSON.parse(text);

    if (typeof parsed === "string") {
      parsed = JSON.parse(parsed);
    }

    if (typeof parsed !== "object" || parsed === null) {
      return { kind: "raw", raw: text };
    }

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
        return {
          kind: "full",
          data: {
            combinedScore:
              typeof data.combinedScore === "number"
                ? data.combinedScore
                : leftReport.overall_score,
            betterSide: data.betterSide === "right" ? "right" : "left",
            leftReport,
            rightReport,
            frontReport,
            hindReport,
            coatColor:
              typeof data.coatColor === "string" ? data.coatColor : undefined,
            markings: Array.isArray(data.markings)
              ? data.markings.filter(
                  (marking): marking is string => typeof marking === "string",
                )
              : undefined,
            markingsDescription:
              typeof data.markingsDescription === "string"
                ? data.markingsDescription
                : undefined,
            ...parseStoredLeftRightVariance(data),
          },
        };
      }
    }

    const nestedReport = data.report;
    if (isConformationReport(nestedReport)) {
      return {
        kind: "single",
        summary: nestedReport.summary,
        notes: extractSectionNotes(nestedReport),
      };
    }

    if (typeof data.summary === "string") {
      const reportData = data.report as
        | {
            balance?: { notes?: string };
            shoulder_angle?: { notes?: string };
            hip_angle?: { notes?: string };
            topline_quality?: { notes?: string };
            leg_alignment?: { notes?: string };
          }
        | undefined;

      return {
        kind: "single",
        summary: data.summary,
        notes: {
          balance: reportData?.balance?.notes,
          shoulder_angle: reportData?.shoulder_angle?.notes,
          hip_angle: reportData?.hip_angle?.notes,
          topline_quality: reportData?.topline_quality?.notes,
          leg_alignment: reportData?.leg_alignment?.notes,
        },
      };
    }
  } catch {
    // fall through to raw display
  }

  return { kind: "raw", raw: text };
}

function getBetterSideReport(data: StoredFullReport): ConformationReport {
  return data.betterSide === "left" ? data.leftReport : data.rightReport;
}

function buildFullReportPdfReport(data: StoredFullReport): ConformationReport {
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

function buildReportForPdf(
  report: ReportDetail,
  parsed: ParsedStoredReport | null,
): ConformationReport | null {
  if (!report.report_text || !parsed) return null;

  if (parsed.kind === "full") {
    return buildFullReportPdfReport(parsed.data);
  }

  if (parsed.kind === "single") {
    try {
      let data: unknown = JSON.parse(report.report_text);
      if (typeof data === "string") {
        data = JSON.parse(data);
      }
      const nestedReport = (data as { report?: unknown }).report;
      if (isConformationReport(nestedReport)) {
        return nestedReport;
      }
    } catch {
      // fall through to DB-backed build
    }

    if (report.overall_score == null) return null;

    return {
      balance: {
        score: report.balance_score ?? 0,
        notes: parsed.notes.balance ?? "",
      },
      shoulder_angle: {
        score: report.shoulder_score ?? 0,
        notes: parsed.notes.shoulder_angle ?? "",
      },
      hip_angle: {
        score: report.hip_score ?? 0,
        notes: parsed.notes.hip_angle ?? "",
      },
      topline_quality: {
        score: report.topline_score ?? 0,
        notes: parsed.notes.topline_quality ?? "",
      },
      leg_alignment: {
        score: report.leg_score ?? 0,
        notes: parsed.notes.leg_alignment ?? "",
      },
      overall_score: report.overall_score,
      summary: parsed.summary,
    };
  }

  return null;
}

function formatReportDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function ReportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const reportId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const viewerRef = useRef<HorseViewer3DHandle>(null);

  useEffect(() => {
    if (!reportId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    async function loadReport() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("reports")
        .select(
          "id, created_at, horse_name, breed, age, sex, discipline, overall_score, balance_score, shoulder_score, hip_score, topline_score, leg_score, report_text, overlay_url, glb_url, pdf_url",
        )
        .eq("id", reportId)
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        setReport(data as ReportDetail);
      }

      setLoading(false);
    }

    void loadReport();
  }, [reportId, router]);

  const parsedReport =
    report?.report_text != null
      ? parseStoredReportText(report.report_text)
      : null;
  const horseDetailLines = report ? formatHorseDetailLines(report) : [];
  const glbUrl = report?.glb_url?.trim() || null;
  const overlayUrl = report?.overlay_url?.trim() || null;
  const fullReportData =
    parsedReport?.kind === "full" ? parsedReport.data : null;
  const singleReportSummary =
    parsedReport?.kind === "single" ? parsedReport.summary : null;
  const singleReportNotes =
    parsedReport?.kind === "single" ? parsedReport.notes : null;
  const betterSideReport = fullReportData
    ? getBetterSideReport(fullReportData)
    : null;

  async function handleShareScore() {
    if (!report || report.overall_score == null) return;

    const name = report.horse_name?.trim() || "my horse";
    const score = report.overall_score;
    const message = `I just analyzed ${name} on EquiForm! ${name} scored ${score}/100 on conformation analysis. Try it at equiform.app 🐴 #EquiForm #HorseConformation`;
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://equiform.app")}&quote=${encodeURIComponent(message)}`;

    const supabase = createClient();
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    if (currentSession?.user) {
      await supabase.from("share_events").insert({
        user_id: currentSession.user.id,
        horse_name: name,
        score,
        shared_own_page: true,
        shared_equiform_page: false,
      });
    }

    window.open(shareUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDownloadPdf() {
    if (!report) return;

    if (report.pdf_url) {
      window.open(
        getReportDownloadPath(report.id),
        "_blank",
        "noopener,noreferrer",
      );
      return;
    }

    const overlayUrl = report.overlay_url?.trim();
    const pdfReport = buildReportForPdf(report, parsedReport);

    if (!overlayUrl || !pdfReport) {
      setPdfError(USER_FACING.pdfUnavailable);
      return;
    }

    setPdfLoading(true);
    setPdfError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const model3dSnapshot = glbUrl
        ? viewerRef.current?.captureSnapshot() ?? undefined
        : undefined;

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
          ...(parsedReport?.kind === "full" &&
          parsedReport.data.leftRightVarianceSummary
            ? {
                leftRightVariance: parsedReport.data.leftRightVariance,
                leftRightVarianceSummary:
                  parsedReport.data.leftRightVarianceSummary,
              }
            : {}),
          horse_name: report.horse_name ?? undefined,
          breed: report.breed ?? undefined,
          age: report.age ?? undefined,
          sex: report.sex ?? undefined,
          discipline: report.discipline ?? undefined,
          glb_url: report.glb_url ?? undefined,
          ...(model3dSnapshot ? { model3d_snapshot: model3dSnapshot } : {}),
        }),
      });

      const data = (await response.json()) as { pdfUrl?: string; error?: string };

      if (!response.ok || !data.pdfUrl) {
        throw new Error(data.error ?? "PDF generation failed. Please try again.");
      }

      setReport((current) =>
        current ? { ...current, pdf_url: data.pdfUrl ?? null } : current,
      );
      window.open(
        getReportDownloadPath(report.id),
        "_blank",
        "noopener,noreferrer",
      );
    } catch (err) {
      setPdfError(formatPdfError(err));
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <AppHamburgerMenu />
      <Link
        href="/my-reports"
        className="inline-block px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        ← Back to My Reports
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
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-400">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
            Loading report…
          </div>
        ) : notFound || !report ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-12 text-center">
            <p className="text-sm text-zinc-300">Report not found</p>
            <Link
              href="/my-reports"
              className="mt-6 inline-block text-sm font-medium text-accent transition hover:text-accent-hover"
            >
              ← Back to My Reports
            </Link>
          </div>
        ) : (
          <article>
            <h1 className="text-2xl font-semibold text-white">
              {report.horse_name?.trim() || "Unnamed Horse"}
            </h1>
            {horseDetailLines.length > 0 ? (
              <div className="mt-2 space-y-1">
                {horseDetailLines.map((line) => (
                  <p key={line} className="text-sm text-zinc-400">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
            <p className="mt-2 text-sm text-zinc-400">
              {formatReportDate(report.created_at)}
            </p>

            <div className="mt-4 border-b border-zinc-800 pb-6">
              <p className="text-sm font-medium text-zinc-400">
                {fullReportData ? "Combined score" : "Overall score"}
              </p>
              <p className="mt-1 text-5xl font-bold text-accent">
                {report.overall_score ?? "—"}
                <span className="text-2xl font-normal text-zinc-500">/100</span>
              </p>
              {report.overall_score != null ? (
                <button
                  type="button"
                  onClick={() => void handleShareScore()}
                  className="mt-4 w-full rounded-lg border border-accent bg-transparent px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent/10"
                >
                  Share Your Score
                </button>
              ) : null}
              {fullReportData ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Weighted: best side 40%, other side 20%, front 20%, hind 20%
                </p>
              ) : null}
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={pdfLoading}
                  className="rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pdfLoading ? "Generating PDF…" : "Download PDF Report"}
                </button>
                {pdfError ? (
                  <p className="mt-2 text-sm text-red-400" role="alert">
                    {pdfError}
                  </p>
                ) : null}
              </div>
            </div>

            {overlayUrl ? (
              <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
                <h2 className="text-lg font-semibold text-white">
                  {fullReportData
                    ? `Conformation Overlay — ${
                        fullReportData.betterSide === "right"
                          ? "Right"
                          : "Left"
                      } Side (best side)`
                    : "Conformation Overlay"}
                </h2>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={overlayUrl}
                  alt="Conformation overlay"
                  className="mt-4 max-h-[400px] w-full rounded-lg border border-zinc-800 object-contain"
                />
              </div>
            ) : null}

            {glbUrl ? (
              <>
                <HorseViewer3D
                  ref={viewerRef}
                  className="mt-8"
                  landmarks={{ left: {}, front: {}, hind: {} }}
                  coatColor={fullReportData?.coatColor}
                  markings={fullReportData?.markings}
                  tripoGlbUrl={glbUrl}
                />
                <p className="mt-3 text-xs italic text-zinc-500">
                  3D model is AI-generated from your photos. Results may vary
                  based on photo quality, lighting, camera angle, and horse
                  stance.
                </p>
              </>
            ) : null}

            {singleReportSummary || betterSideReport?.summary ? (
              <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
                <h2 className="text-lg font-semibold text-white">Summary</h2>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {singleReportSummary ??
                    betterSideReport?.summary ??
                    (parsedReport?.kind === "raw" ? parsedReport.raw : "")}
                </p>
              </div>
            ) : parsedReport?.kind === "raw" && report.report_text ? (
              <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
                <h2 className="text-lg font-semibold text-white">Report</h2>
                <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {parsedReport.raw}
                </p>
              </div>
            ) : null}

            {fullReportData ? (
              <div className="mt-8 space-y-6">
                {FULL_REPORT_VIEWS.map(({ view, label, reportKey }) => {
                  const viewReport = fullReportData[reportKey];
                  const isBestSide =
                    (view === "left" || view === "right") &&
                    fullReportData.betterSide === view;

                  return (
                    <div
                      key={view}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                    >
                      <div className="border-b border-zinc-800 pb-3">
                        <h3 className="text-base font-semibold text-white">
                          {label} — {viewReport.overall_score}/100
                          {isBestSide ? (
                            <span className="ml-2 text-xs font-normal text-accent">
                              · best side
                            </span>
                          ) : null}
                        </h3>
                      </div>

                      <ul className="mt-4 space-y-4">
                        {REPORT_SECTIONS_BY_VIEW[view].map(({ key, label: sectionLabel }) => {
                          const section = viewReport[key];

                          return (
                            <li key={key}>
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="text-sm font-medium text-zinc-200">
                                  {sectionLabel}
                                </h4>
                                <span className="text-sm font-semibold text-accent">
                                  {section.score}/100
                                </span>
                              </div>
                              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                                {section.notes}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ) : (
              <ul className="mt-6 space-y-4">
                {SIDE_REPORT_SECTIONS.map(({ key, label }) => {
                  const sectionNotes = singleReportNotes?.[key];

                  return (
                    <li
                      key={key}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium text-zinc-200">
                          {label}
                        </h3>
                        <span className="text-sm font-semibold text-accent">
                          {report[
                            key === "balance"
                              ? "balance_score"
                              : key === "shoulder_angle"
                                ? "shoulder_score"
                                : key === "hip_angle"
                                  ? "hip_score"
                                  : key === "topline_quality"
                                    ? "topline_score"
                                    : "leg_score"
                          ] ?? "—"}
                          /100
                        </span>
                      </div>
                      {sectionNotes ? (
                        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                          {sectionNotes}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        )}
      </main>
    </div>
  );
}
