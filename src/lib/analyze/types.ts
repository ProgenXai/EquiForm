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
  reportId?: string | null;
  pdfUrl?: string | null;
};

export type FullReportApiResponse = {
  overlayImage: string;
  overlayUrl?: string;
  frontOverlayUrl?: string;
  hindOverlayUrl?: string;
  leftReport: ConformationReport;
  rightReport: ConformationReport;
  frontReport: ConformationReport;
  hindReport: ConformationReport;
  combinedScore: number;
  betterSide: "left" | "right";
  landmarks: {
    left: Record<string, DetectedLandmarkPoint>;
    right: Record<string, DetectedLandmarkPoint>;
    front: Record<string, DetectedLandmarkPoint>;
    hind: Record<string, DetectedLandmarkPoint>;
  };
  horseName: string | null;
  coatColor?: string;
  markings?: string[];
  markingsDescription?: string;
  tripoGlbUrl?: string | null;
  reportId?: string | null;
  pdfUrl?: string | null;
};
