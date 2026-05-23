"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { AnalyzeApiResponse, ConformationReport } from "@/lib/analyze/types";
import { LANDMARKS } from "@/lib/calibration/landmarks";
import { createClient } from "@/lib/supabase/client";

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const COMPRESS_TARGET_BYTES = 4 * 1024 * 1024;

async function compressImageIfNeeded(
  file: File,
): Promise<{ file: File; previewUrl: string }> {
  if (file.size <= COMPRESS_TARGET_BYTES) {
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

      if (blob.size < COMPRESS_TARGET_BYTES) {
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

    if (!blob || blob.size >= COMPRESS_TARGET_BYTES) {
      throw new Error("Failed to compress image below 4MB");
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

const REPORT_SECTIONS: {
  key: keyof Omit<ConformationReport, "overall_score" | "summary">;
  label: string;
}[] = [
  { key: "balance", label: "Balance (rule of thirds)" },
  { key: "shoulder_angle", label: "Shoulder angle" },
  { key: "hip_angle", label: "Hip angle" },
  { key: "topline_quality", label: "Topline quality" },
  { key: "leg_alignment", label: "Leg alignment" },
];

const PENDING_RESULT_KEY = "equiform_pending_result";

export default function AnalyzeClient() {
  const supabase = createClient();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeApiResponse | null>(null);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") !== "true") return;

    try {
      const stored = sessionStorage.getItem(PENDING_RESULT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AnalyzeApiResponse;
        setResult(parsed);
        setEmailSubmitted(true);
        sessionStorage.removeItem(PENDING_RESULT_KEY);
      }
    } catch {
      // Ignore invalid stored result
    }

    window.history.replaceState({}, "", "/analyze");
  }, []);

  function resetResult() {
    setResult(null);
    setError(null);
    setEmail("");
    setEmailSubmitted(false);
    setEmailError(null);
  }

  function handleAnalyzeAnotherHorse() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
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
      const formData = new FormData();
      formData.append("image", selectedFile);

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

      const data = (await response.json()) as AnalyzeApiResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Analysis failed");
      }

      setResult(data);
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
      const overlayImageBase64 = result.overlayImage.includes(",")
        ? result.overlayImage.split(",")[1]!
        : result.overlayImage;

      const response = await fetch("/api/analyze/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overlayImageBase64,
          report: result.report,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "PDF generation failed");
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

  return (
    <div className="relative min-h-screen bg-black text-zinc-100">
      <Link
        href="/buy-rosettes"
        className="absolute right-4 top-4 z-10 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        Buy Rosettes 🌹
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
          AI-powered equine conformation analysis from a single side profile photo
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <label
            className="flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed border-zinc-700 px-6 py-10 text-center transition hover:border-accent/60 hover:bg-accent/10"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <span className="text-sm font-medium text-zinc-200">
              Upload horse photo
            </span>
            <span className="mt-2 text-xs text-zinc-500">
              JPG, PNG, or WEBP · max 10MB · side profile recommended
            </span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileInput}
            />
          </label>

          {previewUrl ? (
            <div className="mt-6">
              <p className="mb-2 text-xs font-medium text-zinc-400">Preview</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Uploaded horse"
                className="mx-auto max-h-96 w-full rounded-lg border border-zinc-800 object-contain"
              />
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-xs text-zinc-300">
            <p className="font-medium text-accent">For best results:</p>
            <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-zinc-400">
              <li>Use a clear side profile photo (left or right facing)</li>
              <li>
                Horse must be standing still — walking or moving photos won&apos;t
                work
              </li>
              <li>Horse should fill most of the frame</li>
              <li>
                Photo should be taken at horse&apos;s level, not from above or below
              </li>
              <li>Avoid photos with multiple horses</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={typeof window === "undefined" ? true : !selectedFile || loading}
            className="mt-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Analyzing…" : "Analyze This Horse"}
          </button>

          {loading ? (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm text-zinc-400">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
              Detecting landmarks and scoring conformation…
            </div>
          ) : null}

          {error ? (
            <p className="mt-4 text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        {result && !emailSubmitted ? (
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
        ) : null}

        {result && emailSubmitted ? (
          <section className="mt-8 space-y-8">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">
                  Overlay analysis
                </h2>
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={pdfLoading}
                  className="rounded-lg border border-accent/50 bg-accent/15 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pdfLoading ? "Generating PDF…" : "Download PDF Report"}
                </button>
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
                {REPORT_SECTIONS.map(({ key, label }) => {
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
                onClick={handleAnalyzeAnotherHorse}
                className="mt-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent-hover"
              >
                Analyze Another Horse
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
