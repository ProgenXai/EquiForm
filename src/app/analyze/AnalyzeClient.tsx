"use client";

import Image from "next/image";
import { useState } from "react";

import type { AnalyzeApiResponse, ConformationReport } from "@/lib/analyze/types";
import { LANDMARKS } from "@/lib/calibration/landmarks";

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

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

export default function AnalyzeClient() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeApiResponse | null>(null);

  function resetResult() {
    setResult(null);
    setError(null);
  }

  function handleFile(file: File) {
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

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError(null);
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) handleFile(file);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleAnalyze() {
    if (!selectedFile) {
      setError("Upload a photo first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await fetch("/api/analyze", {
        method: "POST",
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

  return (
    <div className="min-h-screen bg-black text-zinc-100">
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

        {result ? (
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
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
