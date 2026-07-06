import { parseReportResponse } from "@/lib/analyze/landmark-parser";
import type { ConformationReport } from "@/lib/analyze/types";
import { formatDisciplineList } from "@/lib/format-discipline";
import { buildFullReportPdfReport, parseStoredLeftRightVariance } from "@/lib/pdf/build-full-report-pdf-report";
import type { ReportPdfRequestBody } from "@/lib/pdf/generate-report-pdf";

type StoredReportRow = {
  horse_name: string | null;
  breed: string | null;
  age: string | null;
  sex: string | null;
  coat_color: string | null;
  discipline: string | null;
  report_text: string | null;
  overlay_url: string | null;
  balance_score: number | null;
  shoulder_score: number | null;
  hip_score: number | null;
  topline_score: number | null;
  leg_score: number | null;
  overall_score: number | null;
};

function isConformationReport(value: unknown): value is ConformationReport {
  if (typeof value !== "object" || value === null) return false;
  const report = value as ConformationReport;
  return (
    typeof report.summary === "string" &&
    typeof report.overall_score === "number" &&
    typeof report.balance?.score === "number"
  );
}

function buildReportFromScores(row: StoredReportRow): ConformationReport | null {
  if (
    row.overall_score == null ||
    row.balance_score == null ||
    row.shoulder_score == null ||
    row.hip_score == null ||
    row.topline_score == null ||
    row.leg_score == null
  ) {
    return null;
  }

  const emptyNotes = "See full report in EquiForm for detailed analysis.";

  return {
    balance: { score: row.balance_score, notes: emptyNotes },
    shoulder_angle: { score: row.shoulder_score, notes: emptyNotes },
    hip_angle: { score: row.hip_score, notes: emptyNotes },
    topline_quality: { score: row.topline_score, notes: emptyNotes },
    leg_alignment: { score: row.leg_score, notes: emptyNotes },
    overall_score: row.overall_score,
    summary: row.report_text?.trim() || emptyNotes,
  };
}

export function buildReportPdfBodyFromStoredReport(
  row: StoredReportRow,
  options?: { model3dPlaceholder?: boolean },
): ReportPdfRequestBody | null {
  const overlayUrl = row.overlay_url?.trim();
  if (!overlayUrl) return null;

  const horseMeta = {
    horse_name: row.horse_name ?? undefined,
    breed: row.breed ?? undefined,
    age: row.age ?? undefined,
    sex: row.sex ?? undefined,
    coat_color: row.coat_color ?? undefined,
    discipline: row.discipline ? formatDisciplineList(row.discipline) : undefined,
  };

  const model3dFields =
    options?.model3dPlaceholder === true
      ? { model3d_placeholder: true as const }
      : {};

  if (row.report_text) {
    try {
      let parsed: unknown = JSON.parse(row.report_text);
      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }

      if (typeof parsed === "object" && parsed !== null) {
        const data = parsed as Record<string, unknown>;

        if (data.type === "full") {
          const leftReport = data.leftReport;
          const rightReport = data.rightReport;
          const frontReport = data.frontReport;
          const hindReport = data.hindReport;
          const pdfAssets = data.pdfAssets;

          if (
            isConformationReport(leftReport) &&
            isConformationReport(rightReport) &&
            isConformationReport(frontReport) &&
            isConformationReport(hindReport)
          ) {
            const assets =
              typeof pdfAssets === "object" && pdfAssets !== null
                ? (pdfAssets as Record<string, unknown>)
                : null;

            const leftImage =
              typeof assets?.leftImage === "string" ? assets.leftImage.trim() : "";
            const rightImage =
              typeof assets?.rightImage === "string" ? assets.rightImage.trim() : "";
            const frontImage =
              typeof assets?.frontImage === "string" ? assets.frontImage.trim() : "";
            const hindImage =
              typeof assets?.hindImage === "string" ? assets.hindImage.trim() : "";

            if (leftImage && rightImage && frontImage && hindImage) {
              const varianceFields = parseStoredLeftRightVariance(data);

              return {
                overlayUrl,
                frontOverlayUrl:
                  typeof assets?.frontOverlayUrl === "string"
                    ? assets.frontOverlayUrl.trim()
                    : undefined,
                hindOverlayUrl:
                  typeof assets?.hindOverlayUrl === "string"
                    ? assets.hindOverlayUrl.trim()
                    : undefined,
                better_side:
                  data.betterSide === "left" || data.betterSide === "right"
                    ? data.betterSide
                    : undefined,
                leftImage,
                rightImage,
                frontImage,
                hindImage,
                report: buildFullReportPdfReport({
                  combinedScore:
                    typeof data.combinedScore === "number"
                      ? data.combinedScore
                      : leftReport.overall_score,
                  leftReport,
                  rightReport,
                  frontReport,
                  hindReport,
                  ...varianceFields,
                }),
                ...varianceFields,
                ...horseMeta,
                ...model3dFields,
              };
            }
          }
        }

        const nestedReport = data.report;
        if (isConformationReport(nestedReport)) {
          return {
            overlayUrl,
            report: nestedReport,
            ...horseMeta,
            ...model3dFields,
          };
        }
      }
    } catch {
      // Fall through to plain-text parsing.
    }

    try {
      return {
        overlayUrl,
        report: parseReportResponse(row.report_text),
        ...horseMeta,
        ...model3dFields,
      };
    } catch {
      const fallbackReport = buildReportFromScores(row);
      if (!fallbackReport) return null;

      return {
        overlayUrl,
        report: fallbackReport,
        ...horseMeta,
        ...model3dFields,
      };
    }
  }

  const fallbackReport = buildReportFromScores(row);
  if (!fallbackReport) return null;

  return {
    overlayUrl,
    report: fallbackReport,
    ...horseMeta,
    ...model3dFields,
  };
}
