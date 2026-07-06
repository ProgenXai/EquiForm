import type {
  ConformationReport,
  LeftRightVarianceItem,
} from "@/lib/analyze/types";

type ReportSectionKey =
  | "balance"
  | "shoulder_angle"
  | "hip_angle"
  | "topline_quality"
  | "leg_alignment";

const VARIANCE_CATEGORIES = new Set<LeftRightVarianceItem["category"]>([
  "balance",
  "shoulder_angle",
  "hip_angle",
  "topline_quality",
  "leg_alignment",
]);

export function parseStoredLeftRightVariance(data: Record<string, unknown>): {
  leftRightVariance?: LeftRightVarianceItem[];
  leftRightVarianceSummary?: string | null;
} {
  const leftRightVarianceSummary =
    typeof data.leftRightVarianceSummary === "string"
      ? data.leftRightVarianceSummary
      : null;

  if (!leftRightVarianceSummary) {
    return {};
  }

  const raw = data.leftRightVariance;
  if (!Array.isArray(raw)) {
    return { leftRightVarianceSummary };
  }

  const leftRightVariance = raw.filter((item): item is LeftRightVarianceItem => {
    if (typeof item !== "object" || item === null) return false;
    const value = item as Record<string, unknown>;
    return (
      typeof value.category === "string" &&
      VARIANCE_CATEGORIES.has(value.category as LeftRightVarianceItem["category"]) &&
      typeof value.label === "string" &&
      typeof value.leftScore === "number" &&
      typeof value.rightScore === "number" &&
      typeof value.difference === "number" &&
      (value.higherSide === "left" || value.higherSide === "right") &&
      typeof value.note === "string"
    );
  });

  return { leftRightVariance, leftRightVarianceSummary };
}

export type FullReportPdfReportInput = {
  combinedScore: number;
  leftReport: ConformationReport;
  rightReport: ConformationReport;
  frontReport: ConformationReport;
  hindReport: ConformationReport;
  leftRightVariance?: LeftRightVarianceItem[];
  leftRightVarianceSummary?: string | null;
};

export function buildFullReportPdfReport(
  data: FullReportPdfReportInput,
): ConformationReport {
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
