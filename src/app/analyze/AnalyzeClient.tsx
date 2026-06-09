"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { FileCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type {
  AnalyzeApiResponse,
  ConformationReport,
  DetectedLandmarkPoint,
  FullReportApiResponse,
} from "@/lib/analyze/types";
import { extractJsonObject } from "@/lib/analyze/landmark-parser";
import type { CalibrationViewMode } from "@/lib/calibration/landmarks";
import { LANDMARKS } from "@/lib/calibration/landmarks";
import { formatDisciplineList } from "@/lib/format-discipline";
import type { Session } from "@supabase/supabase-js";

import type { HorseViewer3DHandle } from "@/components/HorseViewer3D";
import TypeaheadInput from "@/components/TypeaheadInput";
import { createClient } from "@/lib/supabase/client";
import {
  BREED_SUGGESTIONS,
  DISCIPLINE_SUGGESTIONS,
} from "@/lib/horse-form-suggestions";

const HorseViewer3D = dynamic(
  () => import("@/components/HorseViewer3D"),
  { ssr: false },
);

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

async function compressImageIfNeeded(
  file: File,
  options?: { maxSizeMB?: number },
): Promise<{ file: File; previewUrl: string }> {
  const maxSizeMB = options?.maxSizeMB ?? 2;
  const targetBytes = maxSizeMB * 1024 * 1024;

  if (file.size <= targetBytes) {
    return { file, previewUrl: URL.createObjectURL(file) };
  }

  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    imageBitmap.close();
    throw new Error("Failed to process image");
  }

  let width = imageBitmap.width;
  let height = imageBitmap.height;
  let quality = 0.92;
  let reducedQualityAtCurrentSize = false;
  let blob: Blob | null = null;

  try {
    while (width >= 64 && height >= 64) {
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(imageBitmap, 0, 0, width, height);

      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });

      if (!blob) {
        throw new Error("Failed to compress image");
      }

      if (blob.size < targetBytes) {
        break;
      }

      if (!reducedQualityAtCurrentSize && quality > 0.55) {
        quality -= 0.1;
        reducedQualityAtCurrentSize = true;
      } else {
        width = Math.floor(width * 0.85);
        height = Math.floor(height * 0.85);
        quality = 0.85;
        reducedQualityAtCurrentSize = false;
      }
    }

    if (!blob || blob.size >= targetBytes) {
      throw new Error(`Failed to compress image below ${maxSizeMB}MB`);
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    const compressedFile = new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
    });

    return { file: compressedFile, previewUrl: URL.createObjectURL(blob) };
  } finally {
    imageBitmap.close();
  }
}

type ReportSectionKey = keyof Omit<ConformationReport, "overall_score" | "summary">;

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

const APP_SUBTITLE =
  "The most advanced AI equine conformation analysis available";

const SIDE_VIEW_UPLOAD_HINT =
  "JPG, PNG, or WEBP · side profile recommended";

const PENDING_RESULT_KEY = "equiform_pending_result";

type BalanceResponse = {
  single_view_balance?: number;
  single_view_3d_balance?: number;
  full_report_balance?: number;
  full_report_3d_balance?: number;
};

type AnalysisMode = "quick" | "full";

const ANALYSIS_MODE_OPTIONS: {
  value: AnalysisMode;
  label: string;
  detail: string;
  recommended?: boolean;
}[] = [
  {
    value: "full",
    label: "FULL REPORT",
    detail: "1 full report credit — complete 4-view analysis",
    recommended: true,
  },
  {
    value: "quick",
    label: "SINGLE VIEW",
    detail: "1 single view credit — one view only",
  },
];

type FullReportView = "left" | "right" | "front" | "hind";

type FullReportSlot = {
  previewUrl: string;
  supabaseUrl: string;
  storagePath: string;
};

const FULL_REPORT_CREDIT_COST = 1;
const FULL_REPORT_STORAGE_BUCKET = "horse-photos";
const FULL_REPORT_TEMP_PREFIX = "full-report-temp";

const FULL_REPORT_SLOTS: { view: FullReportView; label: string }[] = [
  { view: "left", label: "Left Side" },
  { view: "right", label: "Right Side" },
  { view: "front", label: "Front View" },
  { view: "hind", label: "Hind View" },
];

const SIDE_PROFILE_DO = [
  "Full side profile, head to hoof fully visible",
  "Standing square on level ground",
  "All four feet planted naturally",
  "Good lighting, horse clearly visible against background",
  "Step back so full horse fills about 2/3 of the frame",
] as const;

const SIDE_PROFILE_DONT = [
  "Angled, 3/4, or front-facing photos",
  "Motion, cocked legs, or stretched halter poses",
  "Dark horses in dark settings or heavy shadows",
  "Obstructions blocking any part of the body",
] as const;

const FRONT_VIEW_DO = [
  "Horse facing directly toward the camera",
  "Standing square, all four feet visible on level ground",
  "Camera at chest height",
  "Step back so full horse fills about 2/3 of the frame",
] as const;

const FRONT_VIEW_DONT = [
  "Angled or off-center — must face camera straight on",
  "Camera too high or too low",
  "Feet partially obscured or off level ground",
  "Motion or unnatural stance",
] as const;

const HIND_VIEW_DO = [
  "Horse facing directly away from the camera",
  "Tail tied or braided up — hind legs fully visible",
  "Standing square, all four feet visible on level ground",
  "Camera at hip height",
  "Step back so full horse fills about 2/3 of the frame",
] as const;

const HIND_VIEW_DONT = [
  "Tail covering hind legs",
  "Angled — must face directly away from camera",
  "Camera too high or too low",
  "Feet partially obscured or off level ground",
] as const;

const VIEW_MODE_GUIDELINES: Record<
  FullReportView,
  { do: readonly string[]; dont: readonly string[] }
> = {
  left: { do: SIDE_PROFILE_DO, dont: SIDE_PROFILE_DONT },
  right: { do: SIDE_PROFILE_DO, dont: SIDE_PROFILE_DONT },
  front: { do: FRONT_VIEW_DO, dont: FRONT_VIEW_DONT },
  hind: { do: HIND_VIEW_DO, dont: HIND_VIEW_DONT },
};

function ViewModeGuidelinesCards({ view }: { view: FullReportView }) {
  const { do: doItems, dont: dontItems } = VIEW_MODE_GUIDELINES[view];

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <h4 className="text-sm font-semibold text-green-400">Do</h4>
        <ul className="mt-2 space-y-2">
          {doItems.map((item) => (
            <li
              key={item}
              className="flex gap-1.5 text-xs leading-relaxed text-zinc-300"
            >
              <span className="shrink-0" aria-hidden="true">
                ✅
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
        <h4 className="text-sm font-semibold text-red-400">Don&apos;t</h4>
        <ul className="mt-2 space-y-2">
          {dontItems.map((item) => (
            <li
              key={item}
              className="flex gap-1.5 text-xs leading-relaxed text-zinc-300"
            >
              <span className="shrink-0" aria-hidden="true">
                ❌
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const HORSE_SEX_OPTIONS = [
  "Mare",
  "Gelding",
  "Stallion",
  "Colt",
  "Filly",
] as const;

const COAT_COLOR_SUGGESTIONS = [
  "Bay",
  "Dark Bay",
  "Black",
  "Chestnut",
  "Sorrel",
  "Palomino",
  "Buckskin",
  "Dun",
  "Grullo",
  "Gray",
  "Roan",
  "Bay Roan",
  "Red Roan",
  "Blue Roan",
  "Cremello",
  "Perlino",
  "White",
  "Paint",
  "Appaloosa",
  "Pinto",
] as const;

function coerceReportText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => coerceReportText(item))
      .filter(Boolean)
      .join("\n");
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of [
      "notes",
      "text",
      "analysis",
      "content",
      "summary",
      "description",
    ]) {
      if (typeof record[key] === "string") {
        return record[key].trim();
      }
    }
  }

  return "";
}

function normalizeViewReport(report: ConformationReport): ConformationReport {
  const section = (value: ConformationReport["balance"]) => ({
    score: Math.min(100, Math.max(0, Math.round(Number(value?.score) || 0))),
    notes: coerceReportText(value?.notes),
  });

  return {
    balance: section(report.balance),
    shoulder_angle: section(report.shoulder_angle),
    hip_angle: section(report.hip_angle),
    topline_quality: section(report.topline_quality),
    leg_alignment: section(report.leg_alignment),
    overall_score: Math.min(
      100,
      Math.max(0, Math.round(Number(report.overall_score) || 0)),
    ),
    summary: coerceReportText(report.summary),
  };
}

function extractApiErrorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (value instanceof Error && value.message.trim()) {
    return value.message.trim();
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error.trim();
    }
  }

  return fallback;
}

function formatBalanceBadge(
  count: number,
  labelSingular: string,
  labelPlural: string,
): string {
  const label = count === 1 ? labelSingular : labelPlural;
  return `${count} ${label} remaining`;
}

function getBalanceBadges(balances: {
  single_view_balance: number;
  single_view_3d_balance: number;
  full_report_balance: number;
  full_report_3d_balance: number;
}): string[] {
  const badges: string[] = [];

  if (balances.single_view_balance > 0) {
    badges.push(
      formatBalanceBadge(
        balances.single_view_balance,
        "Single View Report",
        "Single View Reports",
      ),
    );
  }

  if (balances.single_view_3d_balance > 0) {
    badges.push(
      formatBalanceBadge(
        balances.single_view_3d_balance,
        "Single View + 3D Report",
        "Single View + 3D Reports",
      ),
    );
  }

  if (balances.full_report_balance > 0) {
    badges.push(
      formatBalanceBadge(
        balances.full_report_balance,
        "Four-View Report",
        "Four-View Reports",
      ),
    );
  }

  if (balances.full_report_3d_balance > 0) {
    badges.push(
      formatBalanceBadge(
        balances.full_report_3d_balance,
        "Four-View + 3D Report",
        "Four-View + 3D Reports",
      ),
    );
  }

  return badges;
}

function parseViewReportValue(value: unknown): ConformationReport {
  let candidate: unknown = value;

  if (typeof candidate === "string") {
    const parsed: unknown = JSON.parse(extractJsonObject(candidate));
    candidate =
      parsed && typeof parsed === "object" && "report" in parsed
        ? (parsed as { report: unknown }).report
        : parsed;
  } else if (
    candidate &&
    typeof candidate === "object" &&
    "report" in candidate
  ) {
    candidate = (candidate as { report: unknown }).report;
  }

  if (!candidate || typeof candidate !== "object") {
    throw new Error("Invalid full report view data");
  }

  return normalizeViewReport(candidate as ConformationReport);
}

function parseLandmarkPoints(
  value: unknown,
): Record<string, DetectedLandmarkPoint> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const points: Record<string, DetectedLandmarkPoint> = {};

  for (const [key, point] of Object.entries(value as Record<string, unknown>)) {
    if (!point || typeof point !== "object") continue;

    const candidate = point as { x?: unknown; y?: unknown };
    if (typeof candidate.x === "number" && typeof candidate.y === "number") {
      points[key] = { x: candidate.x, y: candidate.y };
    }
  }

  return points;
}

function parseAnalyzeApiResponse(
  raw: AnalyzeApiResponse & {
    error?: string;
    requiresPayment?: boolean;
    glbUrl?: string | null;
    disclaimer?: string;
  },
): AnalyzeApiResponse & { glbUrl?: string | null; disclaimer?: string } {
  return {
    overlayImage:
      typeof raw.overlayImage === "string"
        ? raw.overlayImage
        : typeof raw.overlayUrl === "string"
          ? raw.overlayUrl
          : "",
    overlayUrl: typeof raw.overlayUrl === "string" ? raw.overlayUrl : undefined,
    report: parseViewReportValue(raw.report),
    landmarks: parseLandmarkPoints(raw.landmarks),
    reportId: typeof raw.reportId === "string" ? raw.reportId : null,
    pdfUrl: typeof raw.pdfUrl === "string" ? raw.pdfUrl : null,
    ...(typeof raw.glbUrl === "string" ? { glbUrl: raw.glbUrl } : {}),
    ...(typeof raw.disclaimer === "string" ? { disclaimer: raw.disclaimer } : {}),
  };
}

function parseFullReportApiResponse(
  raw: FullReportApiResponse & {
    error?: unknown;
    meshyTaskId?: string | null;
    glbUrl?: string | null;
  },
): FullReportApiResponse {
  return {
    overlayImage:
      typeof raw.overlayImage === "string"
        ? raw.overlayImage
        : typeof raw.overlayUrl === "string"
          ? raw.overlayUrl
          : "",
    overlayUrl: typeof raw.overlayUrl === "string" ? raw.overlayUrl : undefined,
    frontOverlayUrl:
      typeof raw.frontOverlayUrl === "string" ? raw.frontOverlayUrl : undefined,
    hindOverlayUrl:
      typeof raw.hindOverlayUrl === "string" ? raw.hindOverlayUrl : undefined,
    leftReport: parseViewReportValue(raw.leftReport),
    rightReport: parseViewReportValue(raw.rightReport),
    frontReport: parseViewReportValue(raw.frontReport),
    hindReport: parseViewReportValue(raw.hindReport),
    combinedScore: Math.min(
      100,
      Math.max(0, Math.round(Number(raw.combinedScore) || 0)),
    ),
    betterSide: raw.betterSide === "right" ? "right" : "left",
    landmarks: {
      left: parseLandmarkPoints(raw.landmarks?.left),
      right: parseLandmarkPoints(raw.landmarks?.right),
      front: parseLandmarkPoints(raw.landmarks?.front),
      hind: parseLandmarkPoints(raw.landmarks?.hind),
    },
    horseName: typeof raw.horseName === "string" ? raw.horseName : null,
    coatColor: typeof raw.coatColor === "string" ? raw.coatColor : undefined,
    markings: Array.isArray(raw.markings)
      ? raw.markings.filter((marking): marking is string => typeof marking === "string")
      : undefined,
    markingsDescription:
      typeof raw.markingsDescription === "string"
        ? raw.markingsDescription
        : undefined,
    tripoGlbUrl:
      typeof raw.tripoGlbUrl === "string" ? raw.tripoGlbUrl : null,
    reportId: typeof raw.reportId === "string" ? raw.reportId : null,
    pdfUrl: typeof raw.pdfUrl === "string" ? raw.pdfUrl : null,
  };
}

function buildFullReportPdfReport(
  fullReportResult: FullReportApiResponse,
): ConformationReport {
  const viewReports: { label: string; report: ConformationReport }[] = [
    { label: "Left Side", report: fullReportResult.leftReport },
    { label: "Right Side", report: fullReportResult.rightReport },
    { label: "Front View", report: fullReportResult.frontReport },
    { label: "Hind View", report: fullReportResult.hindReport },
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
    overall_score: fullReportResult.combinedScore,
    summary: `Full Report combined score: ${fullReportResult.combinedScore}/100 (weighted: best side 40%, other side 20%, front 20%, hind 20%).\n\n${summary}`,
  };
}

function getBetterSideReport(
  fullReportResult: FullReportApiResponse,
): ConformationReport {
  return fullReportResult.betterSide === "left"
    ? fullReportResult.leftReport
    : fullReportResult.rightReport;
}

function getFullReportViewReport(
  fullReportResult: FullReportApiResponse,
  view: FullReportView,
): ConformationReport {
  switch (view) {
    case "left":
      return fullReportResult.leftReport;
    case "right":
      return fullReportResult.rightReport;
    case "front":
      return fullReportResult.frontReport;
    case "hind":
      return fullReportResult.hindReport;
  }
}

type ReportHorseDetails = {
  horseName: string;
  breed: string;
  age: string;
  sex: string;
  coatColor: string;
  discipline: string;
};

function ReportHorseDetailsHeader({ details }: { details: ReportHorseDetails }) {
  const displayName = details.horseName.trim() || "Unnamed Horse";
  const breedLine = details.breed.trim()
    ? `Breed: ${details.breed.trim()}`
    : null;
  const metaParts = [
    details.age.trim() ? `Age: ${details.age.trim()}` : null,
    details.sex.trim() ? `Sex: ${details.sex.trim()}` : null,
    details.coatColor.trim() ? `Coat Color: ${details.coatColor.trim()}` : null,
  ].filter((part): part is string => part !== null);
  const metaLine = metaParts.length > 0 ? metaParts.join(" · ") : null;
  const disciplineLine = details.discipline.trim()
    ? `Discipline: ${formatDisciplineList(details.discipline)}`
    : null;

  return (
    <div className="border-b border-zinc-800 pb-4">
      <h2 className="text-2xl font-bold text-white">{displayName}</h2>
      {breedLine ? <p className="mt-2 text-sm text-zinc-400">{breedLine}</p> : null}
      {metaLine ? <p className="mt-1 text-sm text-zinc-400">{metaLine}</p> : null}
      {disciplineLine ? (
        <p className="mt-1 text-sm text-zinc-400">{disciplineLine}</p>
      ) : null}
    </div>
  );
}

export default function AnalyzeClient() {
  const router = useRouter();
  const supabase = createClient();
  const [singleViewPhoto, setSingleViewPhoto] = useState<FullReportSlot | null>(
    null,
  );
  const [singleViewUploading, setSingleViewUploading] = useState(false);
  const [singleViewUploadError, setSingleViewUploadError] = useState<string | null>(
    null,
  );
  const singleViewPhotoRef = useRef(singleViewPhoto);
  singleViewPhotoRef.current = singleViewPhoto;
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("full");
  const [fullReportPhotos, setFullReportPhotos] = useState<
    Partial<Record<FullReportView, FullReportSlot>>
  >({});
  const [fullReportUploadingViews, setFullReportUploadingViews] = useState<
    Set<FullReportView>
  >(() => new Set());
  const fullReportPhotosRef = useRef(fullReportPhotos);
  fullReportPhotosRef.current = fullReportPhotos;
  const [horseName, setHorseName] = useState("");
  const [breed, setBreed] = useState("");
  const [coatColor, setCoatColor] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullReportDisplayError, setFullReportDisplayError] = useState(false);
  const [result, setResult] = useState<
    (AnalyzeApiResponse & { glbUrl?: string | null; disclaimer?: string }) | null
  >(null);
  const [fullReportResult, setFullReportResult] =
    useState<FullReportApiResponse | null>(null);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [singleViewBalance, setSingleViewBalance] = useState<number | null>(null);
  const [singleView3DBalance, setSingleView3DBalance] = useState<number | null>(
    null,
  );
  const [fullReportBalance, setFullReportBalance] = useState<number | null>(null);
  const [fullReport3DBalance, setFullReport3DBalance] = useState<number | null>(
    null,
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminGenerate3D, setAdminGenerate3D] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [meshyTaskId, setMeshyTaskId] = useState<string | null>(null);
  const [fullReportGlbUrl, setFullReportGlbUrl] = useState<string | null>(null);
  const [singleViewGlbUrl, setSingleViewGlbUrl] = useState<string | null>(null);
  const [meshy3DError, setMeshy3DError] = useState<string | null>(null);
  const [showCommunitySharePrompt, setShowCommunitySharePrompt] = useState(false);
  const [showPdf3DModal, setShowPdf3DModal] = useState(false);
  const [pdf3DModalMode, setPdf3DModalMode] = useState<"single" | "full" | null>(
    null,
  );
  const [singlePdfModalSlideIn, setSinglePdfModalSlideIn] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const shareEventIdRef = useRef<string | null>(null);
  const singleViewViewerRef = useRef<HorseViewer3DHandle>(null);
  const fullReportViewerRef = useRef<HorseViewer3DHandle>(null);
  const fullReport3DSectionRef = useRef<HTMLDivElement>(null);

  function applyBalanceData(data: BalanceResponse) {
    setSingleViewBalance(data.single_view_balance ?? 0);
    setSingleView3DBalance(data.single_view_3d_balance ?? 0);
    setFullReportBalance(data.full_report_balance ?? 0);
    setFullReport3DBalance(data.full_report_3d_balance ?? 0);
  }

  async function refreshSingleView3DBalance(userId: string) {
    const { data: tokenRow } = await supabase
      .from("user_tokens")
      .select("single_view_3d_balance")
      .eq("user_id", userId)
      .maybeSingle();

    setSingleView3DBalance(tokenRow?.single_view_3d_balance ?? 0);
  }

  async function refreshFullReport3DBalance(userId: string) {
    const { data: tokenRow } = await supabase
      .from("user_tokens")
      .select("full_report_3d_balance")
      .eq("user_id", userId)
      .maybeSingle();

    setFullReport3DBalance(tokenRow?.full_report_3d_balance ?? 0);
  }

  useEffect(() => {
    if (!menuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function deleteFullReportStorageFiles(paths: string[]) {
    if (paths.length === 0) return;

    const { error } = await supabase.storage
      .from(FULL_REPORT_STORAGE_BUCKET)
      .remove(paths);

    if (error) {
      console.error("[analyze] full report temp cleanup failed:", error);
    }
  }

  function revokeFullReportPreviewUrls(
    photos: Partial<Record<FullReportView, FullReportSlot>>,
  ) {
    for (const slot of Object.values(photos)) {
      if (slot?.previewUrl) {
        URL.revokeObjectURL(slot.previewUrl);
      }
    }
  }

  async function clearFullReportPhotos() {
    const photos = fullReportPhotosRef.current;
    const paths = FULL_REPORT_SLOTS.map(
      (slot) => photos[slot.view]?.storagePath,
    ).filter((path): path is string => Boolean(path));

    await deleteFullReportStorageFiles(paths);
    revokeFullReportPreviewUrls(photos);
    setFullReportPhotos({});
  }

  useEffect(() => {
    if (analysisMode !== "full") {
      void clearFullReportPhotos();
      setFullReportResult(null);
      setMeshyTaskId(null);
      setFullReportGlbUrl(null);
      setMeshy3DError(null);
    }
  }, [analysisMode]);

  useEffect(() => {
    return () => {
      revokeFullReportPreviewUrls(fullReportPhotosRef.current);
      const slot = singleViewPhotoRef.current;
      if (slot?.previewUrl) {
        URL.revokeObjectURL(slot.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!meshyTaskId) return;

    const taskId = meshyTaskId;
    const reportId = fullReportResult?.reportId ?? result?.reportId;
    let cancelled = false;

    async function pollMeshyStatus() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const query = new URLSearchParams({ taskId });
      if (reportId) {
        query.set("reportId", reportId);
      }

      try {
        const response = await fetch(`/api/meshy-status?${query.toString()}`, {
          headers: {
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
        });

        const data = (await response.json()) as {
          status?: string;
          glbUrl?: string;
          error?: unknown;
        };

        if (cancelled) return;

        if (data.glbUrl) {
          if (fullReportResult?.reportId) {
            setFullReportGlbUrl(data.glbUrl);
          } else {
            setSingleViewGlbUrl(data.glbUrl);
          }
          setMeshyTaskId(null);
          setMeshy3DError(null);
          return;
        }

        if (!response.ok || data.status === "FAILED") {
          setMeshy3DError(
            extractApiErrorMessage(data.error, "3D model generation failed"),
          );
          setMeshyTaskId(null);
        }
      } catch {
        if (!cancelled) {
          setMeshy3DError("Failed to check 3D model status");
          setMeshyTaskId(null);
        }
      }
    }

    void pollMeshyStatus();
    const intervalId = window.setInterval(() => {
      void pollMeshyStatus();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [meshyTaskId, fullReportResult?.reportId, result?.reportId]);

  useEffect(() => {
    if (!fullReportGlbUrl) return;

    fullReport3DSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [fullReportGlbUrl]);

  useEffect(() => {
    if (!showPdf3DModal || !pdf3DModalMode) {
      setSinglePdfModalSlideIn(false);
      return;
    }

    const frame = requestAnimationFrame(() => setSinglePdfModalSlideIn(true));
    return () => cancelAnimationFrame(frame);
  }, [showPdf3DModal, pdf3DModalMode]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);

      if (session?.user) {
        setIsLoggedIn(true);

        const balanceResponse = await fetch("/api/get-balance", {
          headers: {
            Authorization: `Bearer ${session.access_token ?? ""}`,
          },
        });

        const balanceData = (await balanceResponse.json()) as BalanceResponse;
        applyBalanceData(balanceData);
        await refreshSingleView3DBalance(session.user.id);
        await refreshFullReport3DBalance(session.user.id);

        const adminResponse = await fetch("/api/check-admin", {
          headers: {
            Authorization: `Bearer ${session.access_token ?? ""}`,
          },
        });

        const adminData = (await adminResponse.json()) as { isAdmin?: boolean };
        setIsAdmin(adminData.isAdmin === true);
        console.log("isAdmin:", adminData.isAdmin === true);
      } else {
        setSingleViewBalance(0);
        setSingleView3DBalance(0);
        setFullReportBalance(0);
        setFullReport3DBalance(0);
        setIsAdmin(false);
        console.log("isAdmin:", false);
      }

      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  function resetResult() {
    setResult(null);
    setError(null);
    setEmail("");
    setEmailSubmitted(false);
    setEmailError(null);
    setShowCommunitySharePrompt(false);
    shareEventIdRef.current = null;
    setMeshyTaskId(null);
    setSingleViewGlbUrl(null);
    setMeshy3DError(null);
  }

  async function updateShareEventEquiformPage(sharedEquiformPage: boolean) {
    const eventId = shareEventIdRef.current;
    if (!eventId) return;

    await supabase
      .from("share_events")
      .update({ shared_equiform_page: sharedEquiformPage })
      .eq("id", eventId);
  }

  async function handleShareScore() {
    if (!result) return;

    const name = horseName.trim() || "my horse";
    const score = result.report.overall_score;
    const message = `I just analyzed ${name} on EquiForm! ${name} scored ${score}/100 on conformation analysis. Try it at equiform.app 🐴 #EquiForm #HorseConformation`;
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://equiform.app")}&quote=${encodeURIComponent(message)}`;

    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    if (currentSession?.user) {
      const { data, error } = await supabase
        .from("share_events")
        .insert({
          user_id: currentSession.user.id,
          horse_name: name,
          score,
          shared_own_page: true,
          shared_equiform_page: false,
        })
        .select("id")
        .single();

      if (!error && data) {
        shareEventIdRef.current = data.id;
      }
    }

    window.open(shareUrl, "_blank", "noopener,noreferrer");
    setShowCommunitySharePrompt(true);
  }

  async function handleShareToCommunityPage() {
    await updateShareEventEquiformPage(true);
    window.open(
      "https://www.facebook.com/profile.php?id=61590285407751",
      "_blank",
      "noopener,noreferrer",
    );
    setShowCommunitySharePrompt(false);
  }

  async function handleDismissCommunitySharePrompt() {
    await updateShareEventEquiformPage(false);
    setShowCommunitySharePrompt(false);
  }

  async function clearSingleViewPhoto() {
    const slot = singleViewPhotoRef.current;
    if (slot?.storagePath) {
      await deleteFullReportStorageFiles([slot.storagePath]);
    }
    if (slot?.previewUrl) {
      URL.revokeObjectURL(slot.previewUrl);
    }
    setSingleViewPhoto(null);
  }

  function handleAnalyzeAnotherHorse() {
    void clearSingleViewPhoto();
    void clearFullReportPhotos();
    setFullReportResult(null);
    setMeshyTaskId(null);
    setFullReportGlbUrl(null);
    setSingleViewGlbUrl(null);
    setMeshy3DError(null);
    setHorseName("");
    setBreed("");
    setCoatColor("");
    setAge("");
    setSex("");
    setDiscipline("");
    setSingleViewUploadError(null);
    setLoading(false);
    setPdfLoading(false);
    setCheckoutLoading(false);
    resetResult();
    try {
      sessionStorage.removeItem(PENDING_RESULT_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  function handleTryAnotherPhoto() {
    void clearSingleViewPhoto();
    setError(null);
  }

  function handleRemoveSingleViewPhoto() {
    void clearSingleViewPhoto();
    setError(null);
    resetResult();
  }

  async function handleRemoveFullReportPhotos() {
    await clearFullReportPhotos();
    setError(null);
    setFullReportResult(null);
  }

  async function handleFile(file: File) {
    resetResult();
    setSingleViewUploadError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setSingleViewUploadError("Only JPG, PNG, and WEBP files are allowed.");
      return;
    }

    if (file.size > MAX_BYTES) {
      setSingleViewUploadError("File must be 10MB or smaller.");
      return;
    }

    if (!session?.user) {
      setSingleViewUploadError("Sign in to upload photos for analysis.");
      return;
    }

    setSingleViewUploading(true);
    setSingleViewUploadError(null);

    const existingSlot = singleViewPhotoRef.current;
    const userId = session.user.id;

    try {
      const { file: processedFile, previewUrl } =
        await compressImageIfNeeded(file);

      if (existingSlot?.storagePath) {
        void deleteFullReportStorageFiles([existingSlot.storagePath]);
      }

      const storagePath = `${FULL_REPORT_TEMP_PREFIX}/${userId}/${Date.now()}-single.jpg`;

      const { error: uploadError } = await supabase.storage
        .from(FULL_REPORT_STORAGE_BUCKET)
        .upload(storagePath, processedFile, {
          contentType: "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from(FULL_REPORT_STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      if (existingSlot?.previewUrl && existingSlot.previewUrl !== previewUrl) {
        URL.revokeObjectURL(existingSlot.previewUrl);
      }

      setSingleViewPhoto({
        previewUrl,
        supabaseUrl: publicUrlData.publicUrl,
        storagePath,
      });
    } catch (err) {
      setSingleViewUploadError(
        err instanceof Error
          ? `Failed to upload photo: ${err.message}`
          : "Failed to upload photo. Please try another.",
      );
    } finally {
      setSingleViewUploading(false);
    }
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function uploadFullReportPhotoSlot(
    view: FullReportView,
    file: File,
    userId: string,
  ) {
    const { file: processedFile, previewUrl } = await compressImageIfNeeded(file);
    const existingSlot = fullReportPhotosRef.current[view];

    if (existingSlot?.storagePath) {
      void deleteFullReportStorageFiles([existingSlot.storagePath]);
    }

    const storagePath = `${FULL_REPORT_TEMP_PREFIX}/${userId}/${Date.now()}-${view}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(FULL_REPORT_STORAGE_BUCKET)
      .upload(storagePath, processedFile, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicUrlData } = supabase.storage
      .from(FULL_REPORT_STORAGE_BUCKET)
      .getPublicUrl(storagePath);

    setFullReportPhotos((current) => {
      const existing = current[view];
      if (existing?.previewUrl && existing.previewUrl !== previewUrl) {
        URL.revokeObjectURL(existing.previewUrl);
      }

      return {
        ...current,
        [view]: {
          previewUrl,
          supabaseUrl: publicUrlData.publicUrl,
          storagePath,
        },
      };
    });
  }

  async function uploadFullReportPhotosInParallel(
    uploads: { view: FullReportView; file: File }[],
  ) {
    if (uploads.length === 0) {
      return;
    }

    for (const { file } of uploads) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Only JPG, PNG, and WEBP files are allowed.");
        return;
      }

      if (file.size > MAX_BYTES) {
        setError("File must be 10MB or smaller.");
        return;
      }
    }

    if (!session?.user) {
      setError("Sign in to upload photos for a full report.");
      return;
    }

    const userId = session.user.id;
    setFullReportUploadingViews(new Set(uploads.map((upload) => upload.view)));
    setError(null);

    try {
      await Promise.all(
        uploads.map(({ view, file }) =>
          uploadFullReportPhotoSlot(view, file, userId),
        ),
      );
    } catch (err) {
      const failedView = uploads[0]?.view ?? "left";
      const slotLabel =
        FULL_REPORT_SLOTS.find((slot) => slot.view === failedView)?.label ??
        "photo";

      setError(
        err instanceof Error
          ? `Failed to upload ${slotLabel} photo: ${err.message}`
          : `Failed to upload ${slotLabel} photo. Please try another.`,
      );
    } finally {
      setFullReportUploadingViews(new Set());
    }
  }

  function handleFullReportFileInput(
    view: FullReportView,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const startIndex = FULL_REPORT_SLOTS.findIndex((slot) => slot.view === view);
    const uploads = files
      .slice(0, FULL_REPORT_SLOTS.length - startIndex)
      .map((file, index) => ({
        view: FULL_REPORT_SLOTS[startIndex + index].view,
        file,
      }));

    void uploadFullReportPhotosInParallel(uploads);
  }

  async function handleAnalyze() {
    if (result) {
      return;
    }

    if (!singleViewPhoto?.supabaseUrl) {
      setError("Upload a photo first.");
      return;
    }

    if (!breed.trim()) {
      setError("Breed is required.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setEmail("");
    setEmailSubmitted(false);
    setEmailError(null);
    setMeshyTaskId(null);
    setSingleViewGlbUrl(null);
    setMeshy3DError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const shouldGenerate3D = (singleView3DBalance ?? 0) > 0;

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          photoUrl: singleViewPhoto.supabaseUrl,
          viewMode: "left",
          breed: breed.trim(),
          coatColor: coatColor.trim(),
          age: age.trim(),
          sex: sex.trim(),
          discipline: formatDisciplineList(discipline),
          horseName: horseName.trim(),
          ...(shouldGenerate3D ? { generate3D: true } : {}),
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");

      if (!isJson) {
        await response.text();
        throw new Error("Analysis failed");
      }

      const result = (await response.json()) as AnalyzeApiResponse & {
        error?: string;
        requiresPayment?: boolean;
        overlayUrl?: string;
        glbUrl?: string | null;
        disclaimer?: string;
        meshyTaskId?: string | null;
      };

      console.log("API response:", result);

      if (!response.ok) {
        throw new Error(result.error ?? "Analysis failed");
      }

      const hasDirectResults = Boolean(
        result.overlayUrl || result.overlayImage || result.report,
      );

      if (hasDirectResults && !result.requiresPayment) {
        setEmailSubmitted(true);
      } else if (result.requiresPayment) {
        setEmailSubmitted(false);
      }

      const savedReportId =
        typeof result.reportId === "string" ? result.reportId.trim() : "";

      try {
        setResult(parseAnalyzeApiResponse(result));
      } catch (displayError) {
        if (savedReportId) {
          setError(
            "Your analysis was saved, but the report could not be displayed. View it in My Reports.",
          );
        } else {
          throw displayError instanceof Error
            ? displayError
            : new Error("Analysis failed");
        }
      }

      if (typeof result.meshyTaskId === "string" && result.meshyTaskId.trim()) {
        setMeshyTaskId(result.meshyTaskId.trim());
      }

      if (session?.access_token && session.user) {
        const balanceResponse = await fetch("/api/get-balance", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const balanceData = (await balanceResponse.json()) as BalanceResponse;
        applyBalanceData(balanceData);
        await refreshSingleView3DBalance(session.user.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  async function submitSingleViewPdfDownload(
    model3dSnapshot?: string,
    options?: { sendEmail?: boolean },
  ) {
    if (!result) return;

    if (!result.reportId) {
      setError("PDF generation failed. Report ID is missing.");
      return;
    }

    setPdfLoading(true);
    setError(null);

    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/analyze/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          reportId: result.reportId,
          overlayUrl: result.overlayUrl,
          report: result.report,
          horse_name: horseName,
          breed,
          age,
          sex,
          coat_color: coatColor,
          discipline: formatDisciplineList(discipline),
          sendEmail: options?.sendEmail === true,
          ...(model3dSnapshot ? { model3d_snapshot: model3dSnapshot } : {}),
          ...(options?.sendEmail && !model3dSnapshot
            ? { model3d_placeholder: true }
            : {}),
        }),
      });

      const data = (await response.json()) as { pdfUrl?: string; error?: string };

      if (!response.ok || !data.pdfUrl) {
        throw new Error(data.error ?? "PDF generation failed. Please try again.");
      }

      setResult((current) =>
        current ? { ...current, pdfUrl: data.pdfUrl } : current,
      );
      window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!result) return;

    if (result.pdfUrl) {
      window.open(result.pdfUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const glbUrl = singleViewGlbUrl ?? result.glbUrl;
    if (glbUrl) {
      setPdf3DModalMode("single");
      setShowPdf3DModal(true);
      return;
    }

    await submitSingleViewPdfDownload();
  }

  async function handleConfirmPdf3DDownload() {
    const mode = pdf3DModalMode;
    if (!mode) return;

    const snapshot =
      mode === "single"
        ? singleViewViewerRef.current?.captureSnapshot()
        : fullReportViewerRef.current?.captureSnapshot();

    setShowPdf3DModal(false);
    setPdf3DModalMode(null);

    if (mode === "single") {
      await submitSingleViewPdfDownload(snapshot ?? undefined, { sendEmail: true });
      return;
    }

    await submitFullReportPdfDownload(snapshot ?? undefined, { sendEmail: true });
  }

  function handleCancelPdf3DModal() {
    setShowPdf3DModal(false);
    setPdf3DModalMode(null);
  }

  async function submitFullReportPdfDownload(
    model3dSnapshot?: string,
    options?: { sendEmail?: boolean },
  ) {
    if (!fullReportResult) return;

    if (!fullReportResult.reportId) {
      setError("PDF generation failed. Report ID is missing.");
      return;
    }

    const leftImage = fullReportPhotos.left?.supabaseUrl;
    const rightImage = fullReportPhotos.right?.supabaseUrl;
    const frontImage = fullReportPhotos.front?.supabaseUrl;
    const hindImage = fullReportPhotos.hind?.supabaseUrl;

    if (!leftImage || !rightImage || !frontImage || !hindImage) {
      setError("PDF generation failed. One or more photos are missing.");
      return;
    }

    setPdfLoading(true);
    setError(null);

    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/analyze/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          reportId: fullReportResult.reportId,
          overlayUrl:
            fullReportResult.overlayUrl ?? fullReportResult.overlayImage,
          frontOverlayUrl: fullReportResult.frontOverlayUrl,
          hindOverlayUrl: fullReportResult.hindOverlayUrl,
          better_side: fullReportResult.betterSide,
          leftImage,
          rightImage,
          frontImage,
          hindImage,
          report: buildFullReportPdfReport(fullReportResult),
          horse_name: fullReportResult.horseName ?? horseName,
          breed,
          age,
          sex,
          coat_color: coatColor,
          discipline: formatDisciplineList(discipline),
          sendEmail: options?.sendEmail === true,
          ...(model3dSnapshot ? { model3d_snapshot: model3dSnapshot } : {}),
          ...(options?.sendEmail && !model3dSnapshot
            ? { model3d_placeholder: true }
            : {}),
        }),
      });

      const data = (await response.json()) as { pdfUrl?: string; error?: string };

      if (!response.ok || !data.pdfUrl) {
        throw new Error(data.error ?? "PDF generation failed. Please try again.");
      }

      setFullReportResult((current) =>
        current ? { ...current, pdfUrl: data.pdfUrl } : current,
      );
      window.open(data.pdfUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleDownloadFullReportPdf() {
    if (!fullReportResult) return;

    if (fullReportResult.pdfUrl) {
      window.open(fullReportResult.pdfUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (fullReportGlbUrl) {
      setPdf3DModalMode("full");
      setShowPdf3DModal(true);
      return;
    }

    await submitFullReportPdfDownload();
  }

  async function handleGetReport() {
    const trimmed = email.trim();
    if (!trimmed.includes("@") || !trimmed.includes(".")) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    if (!result) return;

    setEmailError(null);
    setCheckoutLoading(true);

    try {
      try {
        sessionStorage.setItem(PENDING_RESULT_KEY, JSON.stringify(result));
      } catch {
        // Continue to checkout even if storage fails
      }

      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        setEmailError(data.error ?? "Unable to start checkout. Please try again.");
        setCheckoutLoading(false);
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      setEmailError(
        err instanceof Error ? err.message : "Unable to start checkout. Please try again.",
      );
      setCheckoutLoading(false);
    }
  }

  const hasAnalyzeAccess =
    isAdmin ||
    (isLoggedIn &&
      singleViewBalance !== null &&
      singleView3DBalance !== null &&
      (singleViewBalance > 0 || singleView3DBalance > 0));
  const fullReportFilledCount = FULL_REPORT_SLOTS.filter(
    (slot) => fullReportPhotos[slot.view]?.supabaseUrl,
  ).length;
  const hasFullReportPhotoPreview = FULL_REPORT_SLOTS.some(
    (slot) => fullReportPhotos[slot.view]?.previewUrl,
  );
  const fullReportComplete = fullReportFilledCount === FULL_REPORT_SLOTS.length;
  const hasFullReportAccess =
    isAdmin ||
    (isLoggedIn &&
      fullReportBalance !== null &&
      fullReport3DBalance !== null &&
      (fullReportBalance >= FULL_REPORT_CREDIT_COST ||
        fullReport3DBalance >= FULL_REPORT_CREDIT_COST));
  const requiredHorseDetailsComplete =
    horseName.trim() !== "" &&
    breed.trim() !== "" &&
    coatColor.trim() !== "" &&
    age.trim() !== "" &&
    sex.trim() !== "";
  const singleViewReportComplete = analysisMode === "quick" && result !== null;
  const analyzeButtonDisabled =
    typeof window === "undefined" ||
    !singleViewPhoto?.supabaseUrl ||
    !requiredHorseDetailsComplete ||
    loading ||
    singleViewUploading ||
    (!authLoading && !hasAnalyzeAccess) ||
    singleViewReportComplete;
  const balancesLoaded =
    singleViewBalance !== null &&
    singleView3DBalance !== null &&
    fullReportBalance !== null &&
    fullReport3DBalance !== null;
  const creditBalanceBadges = balancesLoaded
    ? getBalanceBadges({
        single_view_balance: singleViewBalance,
        single_view_3d_balance: singleView3DBalance,
        full_report_balance: fullReportBalance,
        full_report_3d_balance: fullReport3DBalance,
      })
    : [];
  const fullReportSubmitDisabled =
    typeof window === "undefined" ||
    !fullReportComplete ||
    !requiredHorseDetailsComplete ||
    loading ||
    fullReportResult !== null ||
    fullReportUploadingViews.size > 0 ||
    (!authLoading && !hasFullReportAccess);

  const resolvedSingleViewGlbUrl = singleViewGlbUrl ?? result?.glbUrl ?? null;
  const isFullReport3DGenerating = Boolean(
    meshyTaskId && fullReportResult && !fullReportGlbUrl,
  );
  const isSingleView3DGenerating = Boolean(
    meshyTaskId && result && emailSubmitted && !resolvedSingleViewGlbUrl,
  );
  const shouldGenerateSingleView3D = (singleView3DBalance ?? 0) > 0;
  const shouldGenerateFullReport3D = isAdmin
    ? adminGenerate3D
    : (fullReport3DBalance ?? 0) > 0;

  async function handleFullReportSubmit() {
    if (fullReportSubmitDisabled) return;

    const leftUrl = fullReportPhotos.left?.supabaseUrl;
    const rightUrl = fullReportPhotos.right?.supabaseUrl;
    const frontUrl = fullReportPhotos.front?.supabaseUrl;
    const hindUrl = fullReportPhotos.hind?.supabaseUrl;

    if (!leftUrl || !rightUrl || !frontUrl || !hindUrl) {
      setError("Upload all four photos before submitting.");
      return;
    }

    if (!breed.trim()) {
      setError("Breed is required.");
      return;
    }

    const tempPaths = FULL_REPORT_SLOTS.map(
      (slot) => fullReportPhotos[slot.view]?.storagePath,
    ).filter((path): path is string => Boolean(path));

    setLoading(true);
    setError(null);
    setFullReportDisplayError(false);
    setFullReportResult(null);
    setMeshyTaskId(null);
    setFullReportGlbUrl(null);
    setMeshy3DError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const shouldGenerate3D = isAdmin
        ? adminGenerate3D
        : (fullReport3DBalance ?? 0) > 0;

      const response = await fetch("/api/analyze-full", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          leftUrl,
          rightUrl,
          frontUrl,
          hindUrl,
          breed: breed.trim(),
          coatColor: coatColor.trim(),
          age: age.trim(),
          sex: sex.trim(),
          discipline: formatDisciplineList(discipline),
          horseName: horseName.trim(),
          ...(shouldGenerate3D ? { generate3D: true } : {}),
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");

      let apiResult: FullReportApiResponse & {
        error?: unknown;
        meshyTaskId?: string | null;
      };

      try {
        if (!isJson) {
          await response.text();
          throw new Error("Full report analysis failed");
        }

        apiResult = (await response.json()) as FullReportApiResponse & {
          error?: unknown;
          meshyTaskId?: string | null;
        };
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message) {
          throw parseError;
        }

        throw new Error("Full report analysis failed");
      }

      if (!response.ok) {
        throw new Error(
          extractApiErrorMessage(
            apiResult.error,
            "Full report analysis failed",
          ),
        );
      }

      const savedReportId =
        typeof apiResult.reportId === "string" ? apiResult.reportId.trim() : "";

      try {
        setFullReportResult(parseFullReportApiResponse(apiResult));
      } catch (displayError) {
        if (savedReportId) {
          setFullReportDisplayError(true);
        } else {
          throw displayError instanceof Error
            ? displayError
            : new Error("Full report analysis failed");
        }
      }

      if (apiResult.meshyTaskId && (!isAdmin || adminGenerate3D)) {
        setMeshyTaskId(apiResult.meshyTaskId);
      } else {
        setMeshyTaskId(null);
      }

      if (session?.access_token && session.user) {
        const balanceResponse = await fetch("/api/get-balance", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const balanceData = (await balanceResponse.json()) as BalanceResponse;
        applyBalanceData(balanceData);
        await refreshFullReport3DBalance(session.user.id);
      }
    } catch (err) {
      setError(
        extractApiErrorMessage(err, "Full report analysis failed"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white w-full px-6 py-8">
      {analysisMode === "quick" && singleViewPhoto?.previewUrl ? (
        <button
          type="button"
          onClick={handleRemoveSingleViewPhoto}
          className="mb-4 rounded-xl border border-zinc-700 bg-transparent px-6 py-3 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-800"
        >
          ← Back
        </button>
      ) : null}
      {analysisMode === "full" && hasFullReportPhotoPreview ? (
        <button
          type="button"
          onClick={() => void handleRemoveFullReportPhotos()}
          className="mb-4 rounded-xl border border-zinc-700 bg-transparent px-6 py-3 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-800"
        >
          ← Back
        </button>
      ) : null}
      <div ref={menuRef} className="fixed top-4 right-[18%] z-[100]">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="relative z-[100] text-white text-2xl font-bold bg-zinc-800 rounded px-2 py-1"
          aria-expanded={menuOpen}
          aria-haspopup="true"
          aria-label="Menu"
        >
          ☰
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-[100] mt-2 min-w-[12rem] rounded-lg border border-zinc-800 bg-zinc-900 py-2 shadow-lg">
            <Link
              href="/dashboard"
              className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
              onClick={() => setMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/buy-credits"
              className="flex items-center gap-1 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
              onClick={() => setMenuOpen(false)}
            >
              Buy Report Credits{" "}
              <FileCheck
                size={18}
                className="inline-block shrink-0 align-middle text-accent"
                aria-hidden
              />
            </Link>
            <Link
              href="/examples"
              className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
              onClick={() => setMenuOpen(false)}
            >
              Examples
            </Link>
            <Link
              href="/analyze"
              className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
              onClick={() => setMenuOpen(false)}
            >
              Analyze a Horse
            </Link>
            <Link
              href="/my-reports"
              className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
              onClick={() => setMenuOpen(false)}
            >
              My Reports
            </Link>
            <Link
              href="/my-horses"
              className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
              onClick={() => setMenuOpen(false)}
            >
              My Horses
            </Link>
            <Link
              href="/contact"
              className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
              onClick={() => setMenuOpen(false)}
            >
              Contact Us
            </Link>
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                await supabase.auth.signOut();
                router.push("/");
              }}
              className="block w-full px-4 py-2 text-left text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Sign Out
            </button>
          </div>
        ) : null}
      </div>
      <div className="relative max-w-5xl mx-auto w-full">
      <header className="border-b border-zinc-800 bg-black px-6 py-8 text-center">
        <div className="flex justify-center">
          <Image
            src="/equiform-logo.png"
            alt="EquiForm"
            width={500}
            height={500}
            priority
            className="object-contain"
          />
        </div>
        <p className="mt-2 text-lg font-semibold text-white">
          {APP_SUBTITLE}
        </p>
      </header>

      {!authLoading && isLoggedIn ? (
        <div className="mt-6 flex flex-col items-center gap-3 px-6">
          {isAdmin ? (
            <p className="text-center text-xs text-accent">
              <FileCheck
                size={18}
                className="inline-block shrink-0 align-middle text-accent"
                aria-hidden
              />{" "}
              Unlimited credits (admin)
            </p>
          ) : balancesLoaded ? (
            creditBalanceBadges.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                {creditBalanceBadges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-sm font-medium text-accent"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-zinc-400">
                You have no report credits remaining{" "}
                <Link
                  href="/buy-credits"
                  className="font-medium text-accent underline transition hover:text-accent-hover"
                >
                  Buy report credits
                </Link>
              </p>
            )
          ) : null}
        </div>
      ) : null}

      <main className="w-full">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <div
            className="mb-6 grid grid-cols-2 gap-3"
            role="group"
            aria-label="Analysis mode"
          >
            {ANALYSIS_MODE_OPTIONS.map((option) => {
              const isSelected = analysisMode === option.value;

              return (
                <div key={option.value} className="relative">
                  {option.recommended ? (
                    <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-black">
                      RECOMMENDED
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setAnalysisMode(option.value)}
                    aria-pressed={isSelected}
                    className={`flex w-full flex-col items-center rounded-xl border px-4 py-6 text-center transition ${
                      isSelected
                        ? "border-accent bg-accent text-black shadow-sm"
                        : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900"
                    }`}
                  >
                    <span className="text-sm font-bold tracking-wide sm:text-base">
                      {option.label}
                    </span>
                    <span
                      className={`mt-3 text-xs font-medium sm:text-sm ${
                        isSelected ? "text-black/80" : "text-zinc-400"
                      }`}
                    >
                      {option.detail}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {analysisMode === "quick" ? (
            <>
          {!singleViewPhoto?.previewUrl ? (
            <>
              <ViewModeGuidelinesCards view="left" />
              <p className="mt-4 text-center">
                <Link
                  href="/examples"
                  className="text-sm font-medium text-accent transition hover:text-accent-hover"
                >
                  View Photo Examples
                </Link>
              </p>
              <label
                className={`mt-4 flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-zinc-700 px-6 py-10 text-center transition hover:border-accent/60 hover:bg-accent/10 ${
                  singleViewUploading ? "pointer-events-none opacity-60" : ""
                }`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <span className="text-sm font-medium text-zinc-200">
                  {singleViewUploading
                    ? "Uploading photo…"
                    : "Upload a side profile photo of your horse."}
                </span>
                <span className="mt-2 text-xs text-zinc-500">
                  {SIDE_VIEW_UPLOAD_HINT}
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
              <p className="mt-3 text-center text-xs text-zinc-500">
                Not sure what photo to use? See our{" "}
                <Link
                  href="/examples"
                  className="font-medium text-accent transition hover:text-accent-hover"
                >
                  Examples page
                </Link>{" "}
                for guidance.
              </p>
              {singleViewUploadError ? (
                <p className="mt-3 text-sm text-red-400" role="alert">
                  {singleViewUploadError}
                </p>
              ) : null}
            </>
          ) : null}

          {singleViewPhoto?.previewUrl ? (
            <div className="mt-6">
              <p className="mb-2 text-xs font-medium text-zinc-400">Preview</p>
              <div className="relative mx-auto w-full">
                <button
                  type="button"
                  onClick={handleRemoveSingleViewPhoto}
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-base leading-none text-white transition hover:bg-zinc-700"
                >
                  ×
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={singleViewPhoto.previewUrl}
                  alt="Uploaded horse"
                  className="max-h-96 w-full rounded-lg border border-zinc-800 object-contain"
                />
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="horse-name"
                  className="mb-2 block text-xs font-medium text-zinc-400"
                >
                  Horse name{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  id="horse-name"
                  type="text"
                  value={horseName}
                  onChange={(event) => setHorseName(event.target.value)}
                  placeholder="e.g. Blazin High Alibi"
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
                />
              </div>
              <TypeaheadInput
                id="breed"
                label="Breed"
                value={breed}
                onChange={setBreed}
                placeholder="e.g. Quarter Horse, Thoroughbred, Paint"
                required
                suggestions={BREED_SUGGESTIONS}
              />
              <TypeaheadInput
                id="coat-color"
                label="Coat Color"
                value={coatColor}
                onChange={setCoatColor}
                placeholder="e.g. Bay, Black, Palomino, Bay Roan, Chestnut"
                required
                suggestions={COAT_COLOR_SUGGESTIONS}
              />
              <div>
                <label
                  htmlFor="age"
                  className="mb-2 block text-xs font-medium text-zinc-400"
                >
                  Age{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  id="age"
                  type="text"
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                  placeholder="e.g. 5 years, 18 months"
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="sex"
                  className="mb-2 block text-xs font-medium text-zinc-400"
                >
                  Sex{" "}
                  <span className="text-red-500">*</span>
                </label>
                <select
                  id="sex"
                  value={sex}
                  onChange={(event) => setSex(event.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
                >
                  <option value="">Select</option>
                  {HORSE_SEX_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <TypeaheadInput
                id="discipline"
                label="Discipline (optional)"
                value={discipline}
                onChange={setDiscipline}
                placeholder="e.g. Barrel Racing, Dressage, Broodmare"
                suggestions={DISCIPLINE_SUGGESTIONS}
                appendOnSelect
                hint="Select one or more disciplines."
              />
            </div>

          <div className="mt-6">
            {!authLoading ? (
              <>
                {isAdmin ? (
                  <p className="mb-2 text-center text-xs text-accent">
                    <FileCheck
                      size={18}
                      className="inline-block shrink-0 align-middle text-accent"
                      aria-hidden
                    />{" "}
                    Unlimited credits (admin)
                  </p>
                ) : !isLoggedIn ? (
                  <p className="mb-2 text-center text-xs text-zinc-400">
                    Sign in to analyze your horse
                  </p>
                ) : singleViewBalance !== null && singleViewBalance > 0 ? (
                  <p className="mb-2 text-center text-xs text-zinc-400">
                    <FileCheck
                      size={18}
                      className="inline-block shrink-0 align-middle text-accent"
                      aria-hidden
                    />{" "}
                    {singleViewBalance} single view credit
                    {singleViewBalance === 1 ? "" : "s"} remaining
                  </p>
                ) : isLoggedIn ? (
                  <p className="mb-2 text-center text-xs text-zinc-400">
                    You need single view credits to analyze
                  </p>
                ) : null}
              </>
            ) : null}

            <button
              type="button"
              onClick={() =>
                singleViewReportComplete
                  ? handleAnalyzeAnotherHorse()
                  : void handleAnalyze()
              }
              disabled={
                singleViewReportComplete
                  ? loading || pdfLoading
                  : analyzeButtonDisabled
              }
              className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed ${
                singleViewReportComplete || authLoading || hasAnalyzeAccess
                  ? "bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
                  : "cursor-not-allowed bg-zinc-700 text-zinc-400"
              }`}
            >
              {loading
                ? "Analyzing…"
                : singleViewReportComplete
                  ? "Analyze Another Horse"
                  : "Analyze This Horse"}
            </button>

            {!authLoading && !isAdmin && !isLoggedIn ? (
              <Link
                href="/"
                className="mt-3 block w-full rounded-lg bg-accent px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                Sign In
              </Link>
            ) : null}

            {!authLoading && !isAdmin && isLoggedIn && (singleViewBalance === 0 || singleViewBalance === null) && (singleView3DBalance === 0 || singleView3DBalance === null) ? (
              <Link
                href="/buy-credits"
                className="mt-3 block w-full rounded-lg bg-accent px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                Buy Report Credits{" "}
                <FileCheck
                  size={18}
                  className="inline-block shrink-0 align-middle text-white"
                  aria-hidden
                />
              </Link>
            ) : null}
          </div>

          {loading ? (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm text-zinc-400">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
              {shouldGenerateSingleView3D
                ? "Analyzing your horse and generating 3D model — this may take 3–5 minutes. Please don't close this tab."
                : "Analyzing your horse..."}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4">
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
              {!result && !loading ? (
                <button
                  type="button"
                  onClick={handleTryAnotherPhoto}
                  className="mt-3 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
                >
                  Try Another Photo
                </button>
              ) : null}
            </div>
          ) : null}
            </>
          ) : (
            <>
              <p className="mb-4 text-center text-sm text-zinc-400">
                Upload one photo for each labeled view below. All four photos must be of the same horse.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {FULL_REPORT_SLOTS.map((slot) => {
                  const uploaded = fullReportPhotos[slot.view];
                  const isUploading = fullReportUploadingViews.has(slot.view);
                  const inputId = `full-report-upload-${slot.view}`;

                  return (
                    <div
                      key={slot.view}
                      className={`rounded-xl border bg-zinc-950 p-4 ${
                        uploaded ? "border-accent/50" : "border-zinc-800"
                      }`}
                    >
                      <div className="relative mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/80">
                        {uploaded ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={uploaded.previewUrl}
                            alt={`${slot.label} preview`}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <p className="px-4 text-center text-xs text-zinc-500">
                            No photo yet
                          </p>
                        )}
                        {isUploading ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                            <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
                          </div>
                        ) : null}
                      </div>

                      <h3 className="text-sm font-semibold text-zinc-100">
                        {slot.label}
                      </h3>

                      <ViewModeGuidelinesCards view={slot.view} />

                      <input
                        id={inputId}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        multiple
                        className="hidden"
                        disabled={isUploading}
                        onChange={(event) =>
                          handleFullReportFileInput(slot.view, event)
                        }
                      />
                      <label
                        htmlFor={inputId}
                        className={`mt-4 block w-full cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition ${
                          isUploading
                            ? "cursor-not-allowed border-zinc-800 text-zinc-600"
                            : "border-zinc-700 text-zinc-200 hover:border-accent/60 hover:bg-accent/10"
                        }`}
                      >
                        {isUploading
                          ? "Uploading…"
                          : uploaded
                            ? "Replace photo"
                            : "Upload photo"}
                      </label>
                    </div>
                  );
                })}
              </div>

              <p className="mt-4 text-center text-xs text-zinc-500">
                Not sure what photo to use? See our{" "}
                <Link
                  href="/examples"
                  className="font-medium text-accent transition hover:text-accent-hover"
                >
                  Examples page
                </Link>{" "}
                for guidance.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="full-report-horse-name"
                    className="mb-2 block text-xs font-medium text-zinc-400"
                  >
                    Horse name{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="full-report-horse-name"
                    type="text"
                    value={horseName}
                    onChange={(event) => setHorseName(event.target.value)}
                    placeholder="e.g. Blazin High Alibi"
                    required
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
                  />
                </div>
                <TypeaheadInput
                  id="full-report-breed"
                  label="Breed"
                  value={breed}
                  onChange={setBreed}
                  placeholder="e.g. Quarter Horse, Thoroughbred, Paint"
                  required
                  suggestions={BREED_SUGGESTIONS}
                />
                <TypeaheadInput
                  id="full-report-coat-color"
                  label="Coat Color"
                  value={coatColor}
                  onChange={setCoatColor}
                  placeholder="e.g. Bay, Black, Palomino, Bay Roan, Chestnut"
                  required
                  suggestions={COAT_COLOR_SUGGESTIONS}
                />
                <div>
                  <label
                    htmlFor="full-report-age"
                    className="mb-2 block text-xs font-medium text-zinc-400"
                  >
                    Age{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="full-report-age"
                    type="text"
                    value={age}
                    onChange={(event) => setAge(event.target.value)}
                    placeholder="e.g. 5 years, 18 months"
                    required
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="full-report-sex"
                    className="mb-2 block text-xs font-medium text-zinc-400"
                  >
                    Sex{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="full-report-sex"
                    value={sex}
                    onChange={(event) => setSex(event.target.value)}
                    required
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
                  >
                    <option value="">Select</option>
                    {HORSE_SEX_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <TypeaheadInput
                  id="full-report-discipline"
                  label="Discipline (optional)"
                  value={discipline}
                  onChange={setDiscipline}
                  placeholder="e.g. Barrel Racing, Dressage, Broodmare"
                  suggestions={DISCIPLINE_SUGGESTIONS}
                  appendOnSelect
                  hint="Select one or more disciplines."
                />
              </div>

              <div className="mt-6">
                {!authLoading ? (
                  <>
                    {isAdmin ? (
                      <p className="mb-2 text-center text-xs text-accent">
                        <FileCheck
                          size={18}
                          className="inline-block shrink-0 align-middle text-accent"
                          aria-hidden
                        />{" "}
                        Unlimited credits (admin)
                      </p>
                    ) : !isLoggedIn ? (
                      <p className="mb-2 text-center text-xs text-zinc-400">
                        Sign in to analyze your horse
                      </p>
                    ) : fullReportBalance !== null &&
                      fullReportBalance >= FULL_REPORT_CREDIT_COST ? (
                      <p className="mb-2 text-center text-xs text-zinc-400">
                        <FileCheck
                          size={18}
                          className="inline-block shrink-0 align-middle text-accent"
                          aria-hidden
                        />{" "}
                        {fullReportBalance} full report credit
                        {fullReportBalance === 1 ? "" : "s"} remaining
                      </p>
                    ) : isLoggedIn ? (
                      <p className="mb-2 text-center text-xs text-zinc-400">
                        You need {FULL_REPORT_CREDIT_COST} full report credit for
                        a full report
                      </p>
                    ) : null}
                  </>
                ) : null}

                {!fullReportComplete ? (
                  <p className="mb-2 text-center text-xs text-zinc-500">
                    Complete all 4 views to analyze ({fullReportFilledCount}/4)
                  </p>
                ) : !authLoading && isLoggedIn && !hasFullReportAccess && !isAdmin ? (
                  <p className="mb-2 text-center text-xs text-zinc-500">
                    Complete all 4 views to analyze — {FULL_REPORT_CREDIT_COST}{" "}
                    full report credit required
                  </p>
                ) : null}

                {isAdmin ? (
                  <label className="mb-3 flex cursor-pointer items-center justify-center gap-2 text-sm font-medium text-zinc-200">
                    <input
                      type="checkbox"
                      checked={adminGenerate3D}
                      onChange={(event) =>
                        setAdminGenerate3D(event.target.checked)
                      }
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-accent focus:ring-accent"
                    />
                    Generate 3D Model
                  </label>
                ) : null}

                <button
                  type="button"
                  onClick={() => void handleFullReportSubmit()}
                  disabled={fullReportSubmitDisabled}
                  className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed ${
                    !fullReportSubmitDisabled
                      ? "bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
                      : "cursor-not-allowed bg-zinc-700 text-zinc-400"
                  }`}
                >
                  {loading
                    ? "Analyzing…"
                    : `Analyze Full Report — ${FULL_REPORT_CREDIT_COST} credit`}
                </button>

                {fullReportDisplayError ? (
                  <div className="mt-4">
                    <p className="text-sm text-red-400" role="alert">
                      Your report was generated successfully but couldn&apos;t be
                      displayed.{" "}
                      <Link
                        href="/my-reports"
                        className="font-medium text-accent underline transition hover:text-accent-hover"
                      >
                        View it in My Reports
                      </Link>
                      .
                    </p>
                  </div>
                ) : error ? (
                  <div className="mt-4">
                    <p className="text-sm text-red-400" role="alert">
                      {error}
                    </p>
                  </div>
                ) : null}

                {!authLoading && !isAdmin && !isLoggedIn ? (
                  <Link
                    href="/"
                    className="mt-3 block w-full rounded-lg bg-accent px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover"
                  >
                    Sign In
                  </Link>
                ) : null}

                {!authLoading &&
                !isAdmin &&
                isLoggedIn &&
                (fullReportBalance === null ||
                  fullReportBalance < FULL_REPORT_CREDIT_COST) &&
                (fullReport3DBalance === null ||
                  fullReport3DBalance < FULL_REPORT_CREDIT_COST) ? (
                  <Link
                    href="/buy-credits"
                    className="mt-3 block w-full rounded-lg bg-accent px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover"
                  >
                    Buy Report Credits{" "}
                    <FileCheck
                      size={18}
                      className="inline-block shrink-0 align-middle text-white"
                      aria-hidden
                    />
                  </Link>
                ) : null}
              </div>

              {loading ? (
                <div className="mt-4 flex items-center justify-center gap-3 text-sm text-zinc-400">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
                  {shouldGenerateFullReport3D
                    ? "Analyzing your horse and generating 3D model — this may take 3–5 minutes. Please don't close this tab."
                    : "Analyzing your horse..."}
                </div>
              ) : null}

              {fullReportResult ? (
                <section className="mt-8 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
                  {isFullReport3DGenerating ? (
                    <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 border-b border-accent/30 bg-zinc-900/95 px-6 py-3 text-sm text-zinc-200 backdrop-blur">
                      ⏳ Your 3D model is being generated. The Download PDF button
                      will unlock when it&apos;s ready.
                    </div>
                  ) : null}
                  {(() => {
                    const betterSideReport =
                      getBetterSideReport(fullReportResult);
                    const betterSideLabel =
                      fullReportResult.betterSide === "left"
                        ? "Left Side"
                        : "Right Side";

                    return (
                      <>
                        <ReportHorseDetailsHeader
                          details={{
                            horseName: fullReportResult.horseName ?? horseName,
                            breed,
                            age,
                            sex,
                            coatColor,
                            discipline: formatDisciplineList(discipline),
                          }}
                        />

                        <div className="mt-4">
                          <h3 className="text-lg font-semibold text-white">
                            Full Report
                          </h3>
                        </div>

                        <p className="mt-4 text-xs text-zinc-500">
                          Weighted: best side 40%, other side 20%, front 20%,
                          hind 20%
                        </p>

                        <div className="mt-6 overflow-x-auto">
                          <div className="flex gap-3">
                            {FULL_REPORT_SLOTS.map((slot) => {
                              const photo = fullReportPhotos[slot.view];

                              return (
                                <div
                                  key={slot.view}
                                  className="flex min-w-[5.5rem] flex-1 flex-col"
                                >
                                  <div className="h-[200px] max-h-[200px] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50">
                                    {photo?.previewUrl ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={photo.previewUrl}
                                        alt={`${slot.label} photo`}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-full items-center justify-center bg-zinc-900/80">
                                        <p className="text-xs text-zinc-600">
                                          No photo
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                  <p className="mt-2 text-center text-xs font-medium text-zinc-400">
                                    {slot.label}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="mt-8">
                          <p className="text-center text-3xl font-bold text-accent">
                            {fullReportResult.combinedScore}
                            <span className="text-lg font-normal text-zinc-500">
                              /100
                            </span>
                          </p>
                          <h3 className="mt-4 text-sm font-semibold text-white">
                            Conformation Overlays
                          </h3>
                          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                              <p className="mb-2 text-xs font-medium text-zinc-400">
                                Best Side View
                              </p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={
                                  fullReportResult.overlayUrl ??
                                  fullReportResult.overlayImage
                                }
                                alt="Conformation overlay on best side view"
                                className="max-h-[250px] w-full rounded-lg border border-zinc-800 object-contain"
                              />
                            </div>

                            {fullReportResult.frontOverlayUrl ? (
                              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                                <p className="mb-2 text-xs font-medium text-zinc-400">
                                  Front View
                                </p>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={fullReportResult.frontOverlayUrl}
                                  alt="Conformation overlay on front view"
                                  className="max-h-[250px] w-full rounded-lg border border-zinc-800 object-contain"
                                />
                              </div>
                            ) : null}

                            {fullReportResult.hindOverlayUrl ? (
                              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                                <p className="mb-2 text-xs font-medium text-zinc-400">
                                  Hind View
                                </p>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={fullReportResult.hindOverlayUrl}
                                  alt="Conformation overlay on hind view"
                                  className="max-h-[250px] w-full rounded-lg border border-zinc-800 object-contain"
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div ref={fullReport3DSectionRef}>
                        {meshyTaskId && !fullReportGlbUrl ? (
                          <div className="mt-8 flex items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-6 py-10 text-sm text-zinc-400">
                            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
                            Generating 3D model...
                          </div>
                        ) : null}

                        {meshy3DError ? (
                          <p className="mt-4 text-sm text-red-400" role="alert">
                            {meshy3DError}
                          </p>
                        ) : null}

                        {fullReportGlbUrl ? (
                          <>
                            <HorseViewer3D
                              ref={fullReportViewerRef}
                              className="mt-8"
                              landmarks={fullReportResult.landmarks}
                              coatColor={fullReportResult.coatColor}
                              markings={fullReportResult.markings}
                              tripoGlbUrl={fullReportGlbUrl}
                              leftPhotoUrl={fullReportPhotos.left?.supabaseUrl}
                              rightPhotoUrl={fullReportPhotos.right?.supabaseUrl}
                              frontPhotoUrl={fullReportPhotos.front?.supabaseUrl}
                              hindPhotoUrl={fullReportPhotos.hind?.supabaseUrl}
                            />
                            <p className="mt-3 text-base font-semibold text-yellow-400">
                              3D model is AI-generated from your photos. Results may
                              vary based on photo quality, lighting, camera angle, and
                              horse stance.
                            </p>
                          </>
                        ) : null}
                        </div>

                        <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                          {coerceReportText(betterSideReport.summary)}
                        </p>

                        <div className="mt-8 space-y-6">
                          {FULL_REPORT_SLOTS.map((slot) => {
                            const viewReport = getFullReportViewReport(
                              fullReportResult,
                              slot.view,
                            );
                            const isBestSide =
                              (slot.view === "left" || slot.view === "right") &&
                              fullReportResult.betterSide === slot.view;

                            return (
                              <div
                                key={slot.view}
                                className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4"
                              >
                                <div className="border-b border-zinc-800 pb-3">
                                  <h3 className="text-base font-semibold text-white">
                                    {slot.label} — {viewReport.overall_score}/100
                                    {isBestSide ? (
                                      <span className="ml-2 text-xs font-normal text-accent">
                                        · best side
                                      </span>
                                    ) : null}
                                  </h3>
                                </div>

                                <ul className="mt-4 space-y-4">
                                  {REPORT_SECTIONS_BY_VIEW[slot.view].map(
                                    ({ key, label }) => {
                                      const section = viewReport[key];

                                      return (
                                        <li key={key}>
                                          <div className="flex items-center justify-between gap-2">
                                            <h4 className="text-sm font-medium text-zinc-200">
                                              {label}
                                            </h4>
                                            <span className="text-sm font-semibold text-accent">
                                              {section?.score ?? 0}/100
                                            </span>
                                          </div>
                                          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                                            {coerceReportText(section?.notes)}
                                          </p>
                                        </li>
                                      );
                                    },
                                  )}
                                </ul>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-6 flex flex-col items-center">
                          <button
                            type="button"
                            onClick={() => void handleDownloadFullReportPdf()}
                            disabled={pdfLoading || isFullReport3DGenerating}
                            className="rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {pdfLoading
                              ? "Generating PDF…"
                              : "Download PDF Report"}
                          </button>
                          <p className="mt-2 flex items-center gap-1.5 text-sm text-zinc-400">
                            <span aria-hidden="true">✅</span>
                            Your report is automatically saved to My Reports.
                            Click Download PDF to view it now, or find it anytime
                            in My Reports.
                          </p>
                          {isFullReport3DGenerating ? (
                            <p className="mt-2 text-xs text-zinc-500">
                              3D model still generating — PDF will be available when
                              complete
                            </p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={handleAnalyzeAnotherHorse}
                          className="mt-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
                        >
                          Analyze Another Horse
                        </button>
                      </>
                    );
                  })()}
                </section>
              ) : null}
            </>
          )}
        </section>

        {result && !emailSubmitted ? (
          <>
            {console.log("showing payment gate, isAdmin:", isAdmin)}
            <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">
              Your analysis is ready!
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Get your full horse conformation report for just $5.00
            </p>
            <div className="mt-6">
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
              />
              {emailError ? (
                <p className="mt-2 text-sm text-red-400" role="alert">
                  {emailError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void handleGetReport()}
                disabled={checkoutLoading}
                className="mt-4 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                {checkoutLoading ? "Redirecting to checkout…" : "Get My Report — $5.00"}
              </button>
            </div>
          </section>
          </>
        ) : null}

        {result && emailSubmitted ? (
          <section className="mt-8 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
            {isSingleView3DGenerating ? (
              <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-6 border-b border-accent/30 bg-zinc-900/95 px-6 py-3 text-sm text-zinc-200 backdrop-blur">
                ⏳ Your 3D model is being generated. The Download PDF button will
                unlock when it&apos;s ready.
              </div>
            ) : null}
            <div className="space-y-8">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <ReportHorseDetailsHeader
                details={{
                  horseName,
                  breed,
                  age,
                  sex,
                  coatColor,
                  discipline: formatDisciplineList(discipline),
                }}
              />
              <div className="mt-4 flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={pdfLoading || isSingleView3DGenerating}
                  className="rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pdfLoading ? "Generating PDF…" : "Download PDF Report"}
                </button>
                <p className="flex items-center gap-1.5 text-sm text-zinc-400">
                  <span aria-hidden="true">✅</span>
                  Your report is automatically saved to My Reports. Click
                  Download PDF to view it now, or find it anytime in My Reports.
                </p>
                {isSingleView3DGenerating ? (
                  <p className="text-xs text-zinc-500">
                    3D model still generating — PDF will be available when
                    complete
                  </p>
                ) : null}
              </div>
              <p className="mt-4 text-center text-3xl font-bold text-accent">
                {result.report.overall_score}
                <span className="text-lg font-normal text-zinc-500">/100</span>
              </p>
              <div className="relative mt-4 w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.overlayImage}
                  alt="Conformation overlay"
                  className="w-full rounded-lg border border-zinc-800"
                />
                {LANDMARKS.map((landmark) => {
                  const point = result.landmarks[landmark.id];
                  if (!point) return null;
                  return (
                    <span
                      key={landmark.id}
                      style={{
                        position: "absolute",
                        left: `${point.x * 100}%`,
                        top: `${point.y * 100}%`,
                        transform: "translate(12px, -50%)",
                        fontSize: "11px",
                        color: "white",
                        textShadow: "0 0 3px black",
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                      }}
                    >
                      {landmark.label}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h3 className="text-lg font-semibold text-white">
                Conformation report
              </h3>

              <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                {result.report.summary}
              </p>

              <ul className="mt-6 space-y-4">
                {SIDE_REPORT_SECTIONS.map(({ key, label }) => {
                  const section = result.report[key];
                  return (
                    <li
                      key={key}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium text-zinc-200">
                          {label}
                        </h3>
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

              {isSingleView3DGenerating ? (
                <div className="mt-8 flex items-center justify-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-6 py-10 text-sm text-zinc-400">
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
                  Generating 3D model...
                </div>
              ) : null}

              {meshy3DError ? (
                <p className="mt-4 text-sm text-red-400" role="alert">
                  {meshy3DError}
                </p>
              ) : null}

              {resolvedSingleViewGlbUrl ? (
                <>
                  <HorseViewer3D
                    ref={singleViewViewerRef}
                    className="mt-8"
                    landmarks={{ left: result.landmarks }}
                    tripoGlbUrl={resolvedSingleViewGlbUrl}
                  />
                  {result.disclaimer ? (
                    <p className="mt-3 text-base font-semibold text-yellow-400">
                      {result.disclaimer}
                    </p>
                  ) : null}
                </>
              ) : null}

              <button
                type="button"
                onClick={() => void handleShareScore()}
                className="mt-6 w-full rounded-lg border border-accent bg-transparent px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent/10"
              >
                Share Your Score
              </button>
              <button
                type="button"
                onClick={handleAnalyzeAnotherHorse}
                className="mt-3 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                Analyze Another Horse
              </button>
            </div>
            </div>
          </section>
        ) : null}

        {fullReportResult || (result && emailSubmitted) ? (
          <p
            style={{
              fontSize: "11px",
              color: "#9ca3af",
              textAlign: "center",
              padding: "12px 16px",
            }}
          >
            AI-generated analysis is for informational and educational purposes
            only. Not veterinary advice.{" "}
            <a
              href="/disclaimer"
              style={{ color: "#9ca3af", textDecoration: "underline" }}
            >
              Full Disclaimer
            </a>
          </p>
        ) : null}
      </main>
      </div>

      {showPdf3DModal ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 px-4">
          {pdf3DModalMode === "single" ? (
            <div
              className={`w-full max-w-lg rounded-xl border-2 border-yellow-600 bg-yellow-400 p-6 shadow-xl transition-all duration-700 ease-out ${
                singlePdfModalSlideIn
                  ? "translate-x-0 opacity-100"
                  : "translate-x-full opacity-0"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-3xl leading-none" aria-hidden="true">
                  ⚠️
                </span>
                <p className="text-lg font-bold leading-snug text-zinc-900">
                  Position your 3D model before downloading. The current view of your
                  3D model will be captured and included on Page 4 of your PDF report.
                  Rotate the model to your preferred angle, then click Download.
                </p>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleConfirmPdf3DDownload()}
                  disabled={pdfLoading}
                  className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pdfLoading ? "Generating PDF…" : "Download PDF"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelPdf3DModal}
                  disabled={pdfLoading}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`w-full max-w-lg rounded-xl border-2 border-yellow-600 bg-yellow-400 p-6 shadow-xl transition-all duration-700 ease-out ${
                singlePdfModalSlideIn
                  ? "translate-x-0 opacity-100"
                  : "translate-x-full opacity-0"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-3xl leading-none" aria-hidden="true">
                  ⚠️
                </span>
                <p className="text-lg font-bold leading-snug text-zinc-900">
                  Position your 3D model before downloading. The current view of your
                  3D model will be captured and included on Page 4 of your PDF report.
                  Rotate the model to your preferred angle, then click Download.
                </p>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleConfirmPdf3DDownload()}
                  disabled={pdfLoading}
                  className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pdfLoading ? "Generating PDF…" : "Download PDF"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelPdf3DModal}
                  disabled={pdfLoading}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showCommunitySharePrompt ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 text-center shadow-xl">
            <p className="text-base text-zinc-100">
              Want to also share to the EquiForm community page?
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => void handleShareToCommunityPage()}
                className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                Yes, share to EquiForm page
              </button>
              <button
                type="button"
                onClick={() => void handleDismissCommunitySharePrompt()}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-800"
              >
                No thanks
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
