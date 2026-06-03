"use client";

import Image from "next/image";
import Link from "next/link";
import { FileCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type {
  AnalyzeApiResponse,
  ConformationReport,
  FullReportApiResponse,
} from "@/lib/analyze/types";
import type { CalibrationViewMode } from "@/lib/calibration/landmarks";
import { LANDMARKS } from "@/lib/calibration/landmarks";
import type { Session } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const ANALYZE_SEND_AS_IS_MAX_BYTES = 5 * 1024 * 1024;
const ANALYZE_COMPRESS_TARGET_BYTES = 3670016;

async function compressImageBeforeAnalyze(file: File): Promise<File> {
  if (file.size <= ANALYZE_SEND_AS_IS_MAX_BYTES) {
    return file;
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
  let blob: Blob | null = null;

  const scaleToMaxWidth = (maxWidth: number) => {
    if (width <= maxWidth) return;
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  };

  const compressAtCurrentDimensions = async (): Promise<Blob | null> => {
    let latestBlob: Blob | null = null;

    for (let quality = 0.85; quality >= 0.3; quality -= 0.1) {
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(imageBitmap, 0, 0, width, height);

      latestBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });

      if (!latestBlob) {
        throw new Error("Failed to compress image");
      }

      if (latestBlob.size <= ANALYZE_COMPRESS_TARGET_BYTES) {
        return latestBlob;
      }
    }

    return latestBlob;
  };

  try {
    scaleToMaxWidth(2048);
    blob = await compressAtCurrentDimensions();

    if (!blob || blob.size > ANALYZE_COMPRESS_TARGET_BYTES) {
      width = imageBitmap.width;
      height = imageBitmap.height;
      scaleToMaxWidth(1600);
      blob = await compressAtCurrentDimensions();
    }

    if (!blob || blob.size > ANALYZE_COMPRESS_TARGET_BYTES) {
      throw new Error("Failed to compress image below 3.5MB");
    }

    await new Promise<void>((resolve, reject) => {
      if (!blob) {
        reject(new Error("Failed to compress image"));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve();
        } else {
          reject(new Error("Failed to convert image to base64"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to convert image to base64"));
      reader.readAsDataURL(blob);
    });

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } finally {
    imageBitmap.close();
  }
}

async function compressImageIfNeeded(
  file: File,
  options?: { maxSizeMB?: number },
): Promise<{ file: File; previewUrl: string }> {
  const maxSizeMB = options?.maxSizeMB ?? 4;
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

      if (quality > 0.55) {
        quality -= 0.1;
      } else {
        width = Math.floor(width * 0.85);
        height = Math.floor(height * 0.85);
        quality = 0.85;
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

const VIEW_MODE_OPTIONS: { value: CalibrationViewMode; label: string }[] = [
  { value: "left", label: "Left Side" },
  { value: "right", label: "Right Side" },
  { value: "front", label: "Front View" },
  { value: "hind", label: "Hind View" },
];

const APP_SUBTITLE =
  "The most advanced AI equine conformation analysis available";

const PHOTO_DISTANCE_TIP =
  "Step back far enough that the full horse fills about 2/3 of the frame";

const SIDE_VIEW_TIPS = [
  "Use a clear side profile photo",
  PHOTO_DISTANCE_TIP,
  "Horse must be standing still",
  "All four feet visible on level ground",
  "Horse standing square with a natural stance",
];

const FRONT_VIEW_TIPS = [
  "Horse facing directly toward the camera",
  PHOTO_DISTANCE_TIP,
  "All four feet visible on level ground",
  "Camera at chest height — not from above or below",
  "Horse standing square with a natural, still stance",
];

const HIND_VIEW_TIPS = [
  "Horse facing directly away from the camera",
  PHOTO_DISTANCE_TIP,
  "All four feet visible on level ground",
  "Camera at hip height — not from above or below",
  "Horse standing square with a natural, still stance",
];

const VIEW_MODE_TIPS: Record<CalibrationViewMode, string[]> = {
  side: SIDE_VIEW_TIPS,
  left: SIDE_VIEW_TIPS,
  right: SIDE_VIEW_TIPS,
  front: FRONT_VIEW_TIPS,
  hind: HIND_VIEW_TIPS,
};

const SIDE_VIEW_UPLOAD_HINT =
  "JPG, PNG, or WEBP · max 10MB · side profile recommended";

const VIEW_MODE_UPLOAD_HINT: Record<CalibrationViewMode, string> = {
  side: SIDE_VIEW_UPLOAD_HINT,
  left: SIDE_VIEW_UPLOAD_HINT,
  right: SIDE_VIEW_UPLOAD_HINT,
  front: "JPG, PNG, or WEBP · max 10MB · front view recommended",
  hind: "JPG, PNG, or WEBP · max 10MB · hind view recommended",
};

const PENDING_RESULT_KEY = "equiform_pending_result";

type BalanceResponse = {
  single_view_balance?: number;
  full_report_balance?: number;
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

export default function AnalyzeClient() {
  const router = useRouter();
  const supabase = createClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("full");
  const [fullReportPhotos, setFullReportPhotos] = useState<
    Partial<Record<FullReportView, FullReportSlot>>
  >({});
  const [fullReportUploadingView, setFullReportUploadingView] =
    useState<FullReportView | null>(null);
  const fullReportPhotosRef = useRef(fullReportPhotos);
  fullReportPhotosRef.current = fullReportPhotos;
  const [viewMode, setViewMode] = useState<CalibrationViewMode>("left");
  const [analyzedViewMode, setAnalyzedViewMode] = useState<CalibrationViewMode>("left");
  const [horseName, setHorseName] = useState("");
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeApiResponse | null>(null);
  const [fullReportResult, setFullReportResult] =
    useState<FullReportApiResponse | null>(null);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [singleViewBalance, setSingleViewBalance] = useState<number | null>(null);
  const [fullReportBalance, setFullReportBalance] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function applyBalanceData(data: BalanceResponse) {
    setSingleViewBalance(data.single_view_balance ?? 0);
    setFullReportBalance(data.full_report_balance ?? 0);
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
    }
  }, [analysisMode]);

  useEffect(() => {
    return () => {
      revokeFullReportPreviewUrls(fullReportPhotosRef.current);
    };
  }, []);

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
        setFullReportBalance(0);
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
  }

  async function handleShareScore() {
    if (!result) return;

    const text = `My horse scored ${result.report.overall_score}/100 on EquiForm! How does your horse measure up? equi-form-pied.vercel.app`;

    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Ignore clipboard errors
    }
  }

  function handleAnalyzeAnotherHorse() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    void clearFullReportPhotos();
    setPreviewUrl(null);
    setSelectedFile(null);
    setFullReportResult(null);
    setHorseName("");
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
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setError(null);
  }

  function handleRemoveSingleViewPhoto() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
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

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Only JPG, PNG, and WEBP files are allowed.");
      return;
    }

    if (file.size > MAX_BYTES) {
      setError("File must be 10MB or smaller.");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    try {
      const { file: processedFile, previewUrl: nextPreviewUrl } =
        await compressImageIfNeeded(file);
      setSelectedFile(processedFile);
      setPreviewUrl(nextPreviewUrl);
      setError(null);
    } catch {
      setError("Failed to process image. Please try another photo.");
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

  async function handleFullReportFile(view: FullReportView, file: File) {
    const slotLabel =
      FULL_REPORT_SLOTS.find((slot) => slot.view === view)?.label ?? "photo";

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Only JPG, PNG, and WEBP files are allowed.");
      return;
    }

    if (file.size > MAX_BYTES) {
      setError("File must be 10MB or smaller.");
      return;
    }

    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    if (!currentSession?.user) {
      setError("Sign in to upload photos for a full report.");
      return;
    }

    setFullReportUploadingView(view);
    setError(null);

    const existingSlot = fullReportPhotosRef.current[view];
    const userId = currentSession.user.id;

    try {
      const { file: processedFile, previewUrl } = await compressImageIfNeeded(file);

      if (existingSlot?.storagePath) {
        await deleteFullReportStorageFiles([existingSlot.storagePath]);
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
    } catch (err) {
      setError(
        err instanceof Error
          ? `Failed to upload ${slotLabel} photo: ${err.message}`
          : `Failed to upload ${slotLabel} photo. Please try another.`,
      );
    } finally {
      setFullReportUploadingView(null);
    }
  }

  function handleFullReportFileInput(
    view: FullReportView,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (file) void handleFullReportFile(view, file);
    event.target.value = "";
  }

  async function handleAnalyze() {
    if (!selectedFile) {
      setError("Upload a photo first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setEmail("");
    setEmailSubmitted(false);
    setEmailError(null);

    try {
      const fileToSend = await compressImageBeforeAnalyze(selectedFile);

      const formData = new FormData();
      formData.append("image", fileToSend);
      formData.append("horseName", horseName.trim());
      formData.append("viewMode", viewMode);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: formData,
      });

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");

      let result: AnalyzeApiResponse & {
        error?: string;
        requiresPayment?: boolean;
        overlayUrl?: string;
      };

      try {
        if (!response.ok || !isJson) {
          if (!isJson) {
            await response.text();
            throw new Error(
              "Photo file is too large. Please try a smaller image.",
            );
          }
        }

        result = (await response.json()) as AnalyzeApiResponse & {
          error?: string;
          requiresPayment?: boolean;
          overlayUrl?: string;
        };
      } catch (parseError) {
        if (
          parseError instanceof Error &&
          parseError.message ===
            "Photo file is too large. Please try a smaller image."
        ) {
          throw parseError;
        }

        throw new Error("Photo file is too large. Please try a smaller image.");
      }

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

      setAnalyzedViewMode(viewMode);
      setResult(result);

      if (session?.access_token) {
        const balanceResponse = await fetch("/api/get-balance", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const balanceData = (await balanceResponse.json()) as BalanceResponse;
        applyBalanceData(balanceData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!result) return;

    setPdfLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overlayUrl: result.overlayUrl,
          report: result.report,
          horse_name: horseName,
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const isPdf = contentType.includes("application/pdf");

      if (!response.ok || !isPdf) {
        await response.text();
        throw new Error("PDF generation failed. Please try again.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `equiform-report-${date}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleDownloadFullReportPdf() {
    if (!fullReportResult) return;

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
      const response = await fetch("/api/analyze/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const isPdf = contentType.includes("application/pdf");

      if (!response.ok || !isPdf) {
        await response.text();
        throw new Error("PDF generation failed. Please try again.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `equiform-full-report-${date}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setPdfLoading(false);
    }
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
    (isLoggedIn && singleViewBalance !== null && singleViewBalance > 0);
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
      fullReportBalance >= FULL_REPORT_CREDIT_COST);
  const analyzeButtonDisabled =
    typeof window === "undefined" ||
    !selectedFile ||
    loading ||
    (!authLoading && !hasAnalyzeAccess);
  const fullReportSubmitDisabled =
    typeof window === "undefined" ||
    !fullReportComplete ||
    loading ||
    fullReportResult !== null ||
    fullReportUploadingView !== null ||
    (!authLoading && !hasFullReportAccess);

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

    const tempPaths = FULL_REPORT_SLOTS.map(
      (slot) => fullReportPhotos[slot.view]?.storagePath,
    ).filter((path): path is string => Boolean(path));

    setLoading(true);
    setError(null);
    setFullReportResult(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

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
          horseName: horseName.trim(),
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");

      let apiResult: FullReportApiResponse & { error?: string };

      try {
        if (!isJson) {
          await response.text();
          throw new Error("Full report analysis failed");
        }

        apiResult = (await response.json()) as FullReportApiResponse & {
          error?: string;
        };
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message) {
          throw parseError;
        }

        throw new Error("Full report analysis failed");
      }

      if (!response.ok) {
        throw new Error(apiResult.error ?? "Full report analysis failed");
      }

      setFullReportResult({
        ...apiResult,
        frontOverlayUrl: apiResult.frontOverlayUrl,
        hindOverlayUrl: apiResult.hindOverlayUrl,
      });

      if (session?.access_token) {
        const balanceResponse = await fetch("/api/get-balance", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const balanceData = (await balanceResponse.json()) as BalanceResponse;
        applyBalanceData(balanceData);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Full report analysis failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white w-full px-6 py-8">
      {analysisMode === "quick" && previewUrl ? (
        <button
          type="button"
          onClick={handleRemoveSingleViewPhoto}
          className="-ml-6 -mt-8 mb-2 block px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
        >
          ← Back
        </button>
      ) : null}
      {analysisMode === "full" && hasFullReportPhotoPreview ? (
        <button
          type="button"
          onClick={() => void handleRemoveFullReportPhotos()}
          className="-ml-6 -mt-8 mb-2 block px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
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
              href="/examples"
              className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
              onClick={() => setMenuOpen(false)}
            >
              Examples
            </Link>
            <Link
              href="/my-reports"
              className="block px-4 py-2 text-sm font-semibold text-accent transition hover:bg-zinc-800 hover:text-accent-hover"
              onClick={() => setMenuOpen(false)}
            >
              My Reports
            </Link>
            <Link
              href="/buy-rosettes"
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
          <div className="mb-6">
            <p className="mb-2 text-xs font-medium text-zinc-400">Photo view</p>
            <div
              className="flex rounded-lg border border-zinc-700 bg-zinc-950 p-1"
              role="group"
              aria-label="Photo view"
            >
              {VIEW_MODE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setViewMode(option.value)}
                  aria-pressed={viewMode === option.value}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                    viewMode === option.value
                      ? "bg-accent text-black shadow-sm"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {previewUrl ? (
              <p className="mt-2 text-xs text-amber-400">
                Make sure you&apos;ve selected the correct view above before analyzing.
              </p>
            ) : null}
          </div>
          {!previewUrl ? (
            <>
              <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-xs text-zinc-300">
                <p className="font-medium text-accent">For best results:</p>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-zinc-400">
                  {VIEW_MODE_TIPS[viewMode].map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
              <p className="mt-4 text-center">
                <Link
                  href="/examples"
                  className="text-sm font-medium text-accent transition hover:text-accent-hover"
                >
                  View Photo Examples
                </Link>
              </p>
              <label
                className="mt-4 flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-zinc-700 px-6 py-10 text-center transition hover:border-accent/60 hover:bg-accent/10"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <span className="text-sm font-medium text-zinc-200">
                  Upload horse photo
                </span>
                <span className="mt-2 text-xs text-zinc-500">
                  {VIEW_MODE_UPLOAD_HINT[viewMode]}
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
            </>
          ) : null}

          {previewUrl ? (
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
                  src={previewUrl}
                  alt="Uploaded horse"
                  className="max-h-96 w-full rounded-lg border border-zinc-800 object-contain"
                />
              </div>
            </div>
          ) : null}

          {previewUrl ? (
            <div className="mt-6">
              <label
                htmlFor="horse-name"
                className="mb-2 block text-xs font-medium text-zinc-400"
              >
                Horse name (optional)
              </label>
              <input
                id="horse-name"
                type="text"
                value={horseName}
                onChange={(event) => setHorseName(event.target.value)}
                placeholder="e.g. Blazin High Alibi"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
              />
            </div>
          ) : null}

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
              onClick={() => void handleAnalyze()}
              disabled={analyzeButtonDisabled}
              className={`w-full rounded-lg px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed ${
                authLoading || hasAnalyzeAccess
                  ? "bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
                  : "cursor-not-allowed bg-zinc-700 text-zinc-400"
              }`}
            >
              {loading ? "Analyzing…" : "Analyze This Horse"}
            </button>

            {!authLoading && !isAdmin && !isLoggedIn ? (
              <Link
                href="/"
                className="mt-3 block w-full rounded-lg bg-accent px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                Sign In
              </Link>
            ) : null}

            {!authLoading && !isAdmin && isLoggedIn && (singleViewBalance === 0 || singleViewBalance === null) ? (
              <Link
                href="/buy-rosettes"
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
              Detecting landmarks and scoring conformation…
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
                Upload one photo for each view in any order. All four photos must be of the same horse.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {FULL_REPORT_SLOTS.map((slot) => {
                  const uploaded = fullReportPhotos[slot.view];
                  const isUploading = fullReportUploadingView === slot.view;
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

                      <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
                        <p className="text-xs font-medium text-accent">
                          For best results:
                        </p>
                        <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-zinc-400">
                          {VIEW_MODE_TIPS[slot.view].map((tip) => (
                            <li key={tip}>{tip}</li>
                          ))}
                        </ul>
                      </div>

                      <input
                        id={inputId}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
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

              <div className="mt-6">
                <label
                  htmlFor="full-report-horse-name"
                  className="mb-2 block text-xs font-medium text-zinc-400"
                >
                  Horse name (optional)
                </label>
                <input
                  id="full-report-horse-name"
                  type="text"
                  value={horseName}
                  onChange={(event) => setHorseName(event.target.value)}
                  placeholder="e.g. Blazin High Alibi"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
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

                {error ? (
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
                  fullReportBalance < FULL_REPORT_CREDIT_COST) ? (
                  <Link
                    href="/buy-rosettes"
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
                  Analyzing all four views — this may take a minute…
                </div>
              ) : null}

              {fullReportResult ? (
                <section className="mt-8 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
                  {(() => {
                    const betterSideReport =
                      getBetterSideReport(fullReportResult);
                    const betterSideLabel =
                      fullReportResult.betterSide === "left"
                        ? "Left Side"
                        : "Right Side";

                    return (
                      <>
                        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-zinc-800 pb-4">
                          <div>
                            <h2 className="text-lg font-semibold text-white">
                              Full Report
                            </h2>
                            {fullReportResult.horseName ? (
                              <p className="mt-1 text-sm text-zinc-400">
                                {fullReportResult.horseName}
                              </p>
                            ) : null}
                          </div>
                          <p className="text-2xl font-bold text-accent">
                            {fullReportResult.combinedScore}
                            <span className="text-sm font-normal text-zinc-500">
                              /100
                            </span>
                          </p>
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
                          <h3 className="text-sm font-semibold text-white">
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

                        <p className="mt-8 text-sm leading-relaxed text-zinc-300">
                          {betterSideReport.summary}
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
                                              {section.score}/100
                                            </span>
                                          </div>
                                          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                                            {section.notes}
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
                            disabled={pdfLoading}
                            className="rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {pdfLoading
                              ? "Generating PDF…"
                              : "Download PDF Report"}
                          </button>
                          <p className="mt-1 text-xs text-amber-400">
                            ⚠️ Download now — PDF is only available on this
                            screen
                          </p>
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
          <section className="mt-8 space-y-8">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">
                  Overlay analysis
                </h2>
                <div className="flex flex-col items-end">
                  <button
                    type="button"
                    onClick={() => void handleDownloadPdf()}
                    disabled={pdfLoading}
                    className="rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {pdfLoading ? "Generating PDF…" : "Download PDF Report"}
                  </button>
                  <p className="mt-1 text-xs text-amber-400">
                    ⚠️ Download now — PDF is only available on this screen
                  </p>
                </div>
              </div>
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
              <div className="flex items-baseline justify-between gap-4 border-b border-zinc-800 pb-4">
                <h2 className="text-lg font-semibold text-white">
                  Conformation report
                </h2>
                <p className="text-2xl font-bold text-accent">
                  {result.report.overall_score}
                  <span className="text-sm font-normal text-zinc-500">/100</span>
                </p>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-zinc-300">
                {result.report.summary}
              </p>

              <ul className="mt-6 space-y-4">
                {REPORT_SECTIONS_BY_VIEW[analyzedViewMode].map(({ key, label }) => {
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
              <button
                type="button"
                onClick={() => void handleShareScore()}
                className="mt-6 w-full rounded-lg border border-accent bg-transparent px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent/10"
              >
                {shareCopied ? "Copied! 🎉" : "Share Your Score"}
              </button>
              <button
                type="button"
                onClick={handleAnalyzeAnotherHorse}
                className="mt-3 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                Analyze Another Horse
              </button>
            </div>
          </section>
        ) : null}
      </main>
      </div>
    </div>
  );
}
