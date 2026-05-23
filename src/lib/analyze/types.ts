export type ConformationReportSection = {
  score: number;
  notes: string;
};

export type ConformationReport = {
  balance: ConformationReportSection;
  shoulder_angle: ConformationReportSection;
  hip_angle: ConformationReportSection;
  topline_quality: ConformationReportSection;
  leg_alignment: ConformationReportSection;
  overall_score: number;
  summary: string;
};

export type DetectedLandmarkPoint = {
  x: number;
  y: number;
};

export type ClaudeAnalyzeResponse = {
  landmarks: Record<string, DetectedLandmarkPoint>;
  report: ConformationReport;
};

export type AnalyzeApiResponse = {
  overlayImage: string;
  overlayUrl?: string;
  report: ConformationReport;
  landmarks: Record<string, DetectedLandmarkPoint>;
};
