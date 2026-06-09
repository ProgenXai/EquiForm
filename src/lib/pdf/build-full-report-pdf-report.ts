import type { ConformationReport } from "@/lib/analyze/types";

type ReportSectionKey =
  | "balance"
  | "shoulder_angle"
  | "hip_angle"
  | "topline_quality"
  | "leg_alignment";

export function buildFullReportPdfReport(data: {
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
