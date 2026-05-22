"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { drawPlacementPreview } from "@/lib/calibration/draw-placement";
import { renderConformationOverlayLayers } from "@/lib/calibration/overlay-layers";
import {
  landmarkMapToConformation,
  landmarkMapToFractional,
  type LandmarkMap,
} from "@/lib/calibration/pixel-landmarks";
import {
  LANDMARKS,
  LANDMARK_COUNT,
  type HorseFacing,
  type LandmarkId,
  type Point,
} from "@/lib/calibration/landmarks";

const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

function isAcceptedUploadFile(file: File): boolean {
  if (ACCEPTED_FILE_TYPES.includes(file.type)) return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith(".heic") || lower.endsWith(".heif");
}
const REPOSITION_HIT_RADIUS_PX = 20;

function findNearestPointIndex(
  click: Point,
  points: (Point | null)[],
  radius: number,
): number | null {
  let bestIndex: number | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point) continue;
    const distance = Math.hypot(point.x - click.x, point.y - click.y);
    if (distance <= radius && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function drawSelectedPointHighlight(
  ctx: CanvasRenderingContext2D,
  point: Point,
  label: string,
) {
  ctx.save();
  ctx.fillStyle = "rgba(251, 146, 60, 0.55)";
  ctx.strokeStyle = "#f97316";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fdba74";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(label, point.x + 12, point.y - 12);
  ctx.restore();
}

function emptyPoints(): (Point | null)[] {
  return Array.from({ length: LANDMARK_COUNT }, () => null);
}

function pointsToMap(points: (Point | null)[]): LandmarkMap {
  const map: LandmarkMap = {};
  LANDMARKS.forEach((landmark, index) => {
    const point = points[index];
    if (point) map[landmark.id] = point;
  });
  return map;
}

function getCanvasPoint(
  event: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

export default function CalibrationTool() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [horseId, setHorseId] = useState("");
  const [facing, setFacing] = useState<HorseFacing>("LEFT");
  const [photoUrl, setPhotoUrl] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [points, setPoints] = useState<(Point | null)[]>(emptyPoints);
  const [step, setStep] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  );

  const currentLandmark = LANDMARKS[step];
  const allPlaced = points.every((p) => p !== null);
  const horseIdValid = horseId.trim().length > 0;
  const photoControlsDisabled = !horseIdValid || busy;

  const paintCanvas = useCallback(
    (
      snapshot: (Point | null)[],
      highlightIndex: number | null,
    ) => {
      const canvas = canvasRef.current;
      const image = imageRef.current;
      if (!canvas || !image || !imageLoaded) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const map = pointsToMap(snapshot);

      if (showOverlay) {
        try {
          const landmarks = landmarkMapToConformation(
            map,
            canvas.width,
            canvas.height,
          );
          renderConformationOverlayLayers(
            ctx,
            landmarks,
            canvas.width,
            canvas.height,
          );
        } catch {
          // Incomplete landmarks — skip overlay until all points are placed
        }
      }

      if (!showOverlay) {
        snapshot.forEach((point, index) => {
          if (!point) return;
          const landmark = LANDMARKS[index];
          const suffix = landmark.referenceOnly ? " (ref)" : "";
          drawPlacementPreview(ctx, point, `${landmark.label}${suffix}`);
        });
      }

      if (highlightIndex !== null) {
        const selected = snapshot[highlightIndex];
        if (selected) {
          const landmark = LANDMARKS[highlightIndex];
          const suffix = landmark.referenceOnly ? " (ref)" : "";
          drawSelectedPointHighlight(
            ctx,
            selected,
            `${landmark.label}${suffix}`,
          );
        }
      }
    },
    [imageLoaded, showOverlay],
  );

  const redraw = useCallback(() => {
    paintCanvas(points, selectedPointIndex);
  }, [paintCanvas, points, selectedPointIndex]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedPointIndex !== null) {
        setSelectedPointIndex(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedPointIndex]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const resetForNextHorse = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    imageRef.current = null;
    setHorseId("");
    setUrlInput("");
    setPhotoUrl("");
    setStoragePath(null);
    setImageLoaded(false);
    setPoints(emptyPoints());
    setStep(0);
    setShowOverlay(false);
    setSelectedPointIndex(null);
    setError(null);
  }, []);

  const drawImageToCanvas = useCallback((img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return false;
    }

    const maxWidth = Math.max(container.clientWidth - 2, 320);
    const maxHeight = Math.max(480, window.innerHeight - 120);
    const scale = Math.min(
      maxWidth / img.naturalWidth,
      maxHeight / img.naturalHeight,
      1,
    );
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return false;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return true;
  }, []);

  const loadImageElement = useCallback(
    (src: string) => {
      return new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const applyToCanvas = () => {
            if (!drawImageToCanvas(img)) {
              reject(new Error("Canvas not ready"));
              return;
            }

            imageRef.current = img;
            setPoints(emptyPoints());
            setStep(0);
            setShowOverlay(false);
            setSelectedPointIndex(null);
            setImageLoaded(true);
            resolve();
          };

          // Canvas is always mounted; rAF ensures layout dimensions are ready
          requestAnimationFrame(applyToCanvas);
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = src;
      });
    },
    [drawImageToCanvas],
  );

  const handleLoadFromUrl = async () => {
    setError(null);
    setStatus(null);
    const url = urlInput.trim();
    if (!url) {
      setError("Enter a public image URL.");
      return;
    }
    if (!horseIdValid) {
      setError("Enter a Horse ID before loading a photo.");
      return;
    }

    setBusy(true);
    try {
      const proxyUrl = `/api/admin/calibration/proxy-image?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to load image from URL");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      await loadImageElement(objectUrl);
      setPhotoUrl(url);
      setStoragePath(null);
      setStatus("Photo loaded from URL.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photo");
    } finally {
      setBusy(false);
    }
  };

  const uploadAndLoadFile = async (file: File) => {
    if (!horseIdValid) {
      setError("Enter a Horse ID before uploading a photo.");
      return;
    }
    if (!isAcceptedUploadFile(file)) {
      setError("Only JPG, PNG, WEBP, and HEIC files are allowed.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File must be 10MB or smaller.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("horseId", horseId.trim());

      const response = await fetch("/api/admin/calibration/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        error?: string;
        publicUrl?: string;
        path?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Upload failed");
      }

      const publicUrl = data.publicUrl!;
      await loadImageElement(publicUrl);
      setPhotoUrl(publicUrl);
      setStoragePath(data.path ?? null);
      setStatus("Photo uploaded and loaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void uploadAndLoadFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void uploadAndLoadFile(file);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageLoaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const point = getCanvasPoint(event, canvas);

    if (allPlaced) {
      if (selectedPointIndex !== null) {
        const next = [...points];
        next[selectedPointIndex] = point;
        setPoints(next);
        paintCanvas(next, selectedPointIndex);
        setError(null);
        return;
      }

      const hitIndex = findNearestPointIndex(
        point,
        points,
        REPOSITION_HIT_RADIUS_PX,
      );
      if (hitIndex !== null) {
        setSelectedPointIndex(hitIndex);
        setError(null);
      }
      return;
    }

    if (step >= LANDMARK_COUNT || showOverlay) return;

    setPoints((prev) => {
      const next = [...prev];
      next[step] = point;
      return next;
    });
    if (step < LANDMARK_COUNT - 1) {
      setStep((s) => s + 1);
    }
    setError(null);
  };

  const handleBack = () => {
    if (step === 0) return;
    const prevStep = step - 1;
    setPoints((p) => {
      const next = [...p];
      next[prevStep] = null;
      return next;
    });
    setStep(prevStep);
    setShowOverlay(false);
    setSelectedPointIndex(null);
  };

  const handleReset = () => {
    setPoints(emptyPoints());
    setStep(0);
    setShowOverlay(false);
    setSelectedPointIndex(null);
    setStatus(null);
    setError(null);
  };

  const handleGenerateOverlay = () => {
    if (!allPlaced) {
      setError("Place all 18 landmarks before generating the overlay.");
      return;
    }
    setShowOverlay(true);
    setStatus("Overlay generated.");
    setError(null);
  };

  const handleSave = async () => {
    if (!allPlaced) {
      setError("Place all 18 landmarks before saving.");
      return;
    }
    if (!horseIdValid) {
      setError("Horse ID is required.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      setError("Canvas not ready.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const pixelMap = pointsToMap(points);
      const fractionalPoints = landmarkMapToFractional(
        pixelMap,
        canvas.width,
        canvas.height,
      );

      const response = await fetch("/api/admin/calibration/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horseId: horseId.trim(),
          facing,
          photoUrl: photoUrl || undefined,
          points: fractionalPoints,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        action?: "created" | "updated";
        id?: string;
        name?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Save failed");
      const displayName = data.name ?? horseId.trim();
      const successMessage =
        data.action === "updated"
          ? `Horse "${displayName}" updated successfully. Ready for the next horse.`
          : `Horse "${displayName}" saved successfully. Ready for the next horse.`;

      resetForNextHorse();
      setStatus(successMessage);

      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
      statusTimeoutRef.current = setTimeout(() => {
        setStatus(null);
        statusTimeoutRef.current = null;
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageLoaded) return;
    if (!showOverlay) {
      setError("Generate the overlay before downloading.");
      return;
    }
    const link = document.createElement("a");
    link.download = `${horseId.trim() || "horse"}_calibration_overlay.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setStatus("Overlay downloaded.");
  };

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-zinc-800 bg-zinc-900 p-4">
        <div>
          <h1 className="text-lg font-semibold">EquiForm Calibration</h1>
          <p className="mt-1 text-xs text-zinc-400">
            Place 18 landmarks in order on the horse photo.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Horse ID <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={horseId}
            onChange={(e) => setHorseId(e.target.value)}
            placeholder="e.g. horse_001"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-xs font-medium text-zinc-400">Horse facing</p>
          <div className="mt-2 flex gap-2">
            {(["LEFT", "RIGHT"] as HorseFacing[]).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => setFacing(dir)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  facing === dir
                    ? "bg-accent text-white"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {dir}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-accent/30 bg-accent/10 p-3">
          <p className="text-xs font-medium text-accent">Current step</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {!imageLoaded
              ? "Load a photo to begin"
              : allPlaced
                ? "All points placed"
                : `Click: ${currentLandmark.label}`}
          </p>
          {imageLoaded && !allPlaced ? (
            <p className="mt-1 text-xs text-zinc-500">
              Point {step + 1} of {LANDMARK_COUNT}
            </p>
          ) : null}
          <p className="mt-2 text-xs leading-relaxed text-zinc-300">
            {allPlaced
              ? selectedPointIndex !== null
                ? "Click to move the selected point. Press Escape to cancel."
                : "Click a dot to reposition it (within 20px). Generate overlay or save."
              : imageLoaded
                ? currentLandmark.instruction
                : "Enter a Horse ID and load a photo, then place landmarks in order starting at the tail."}
          </p>
        </div>

        <ul className="space-y-1 text-xs">
          {LANDMARKS.map((landmark, index) => {
            const placed = points[index] !== null;
            const active = index === step && !allPlaced;
            const selected = selectedPointIndex === index;
            return (
              <li
                key={landmark.id}
                className={`flex items-center gap-2 rounded px-2 py-1 ${
                  selected
                    ? "bg-amber-950/50 ring-1 ring-amber-500/60"
                    : active
                      ? "bg-zinc-800"
                      : ""
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                    placed
                      ? "bg-accent text-white"
                      : "border border-zinc-600 text-zinc-500"
                  }`}
                >
                  {placed ? "✓" : index + 1}
                </span>
                <span className={placed ? "text-zinc-200" : "text-zinc-500"}>
                  {landmark.label}
                  {landmark.referenceOnly ? " (ref)" : ""}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0 || busy}
            className="flex-1 rounded-lg border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40"
          >
            Back one step
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={busy}
            className="flex-1 rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40 disabled:opacity-40"
          >
            Reset all
          </button>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-4">
          <p className="text-xs font-medium text-zinc-400">Load photo</p>

          <div className="space-y-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://… public image URL"
              disabled={photoControlsDisabled ? true : false}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleLoadFromUrl()}
              disabled={photoControlsDisabled ? true : false}
              className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
            >
              Load Photo from URL
            </button>
          </div>

          <div>
            <label
              className={`flex w-full cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-3 py-4 text-center text-xs transition ${
                isDragging
                  ? "border-accent bg-accent/15"
                  : "border-zinc-700 hover:border-zinc-500"
              } ${photoControlsDisabled ? "pointer-events-none opacity-50" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <span className="font-medium text-zinc-300">Upload or drag & drop</span>
              <span className="mt-1 text-zinc-500">JPG, PNG, WEBP, HEIC · max 10MB</span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                disabled={photoControlsDisabled ? true : false}
                onChange={handleFileInput}
              />
            </label>
          </div>
        </div>

        <div className="mt-auto space-y-2 border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={handleGenerateOverlay}
            disabled={!allPlaced || busy}
            className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-40"
          >
            Generate Overlay
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!allPlaced || busy}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold hover:bg-accent-hover disabled:opacity-40"
          >
            Save Calibration
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!showOverlay || busy}
            className="w-full rounded-lg border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40"
          >
            Download Overlay PNG
          </button>
        </div>

        {status ? (
          <p className="text-xs text-accent" role="status">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </aside>

      <main className="flex flex-1 flex-col p-4">
        <div
          ref={containerRef}
          className="relative flex flex-1 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50"
        >
          {!imageLoaded ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
              <p className="max-w-md text-center text-sm text-zinc-500">
                {horseIdValid
                  ? "Load a horse photo using the sidebar (URL, upload, or drag & drop)."
                  : "Enter a Horse ID, then load a photo to begin calibration."}
              </p>
            </div>
          ) : null}
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className={`max-h-[calc(100vh-4rem)] max-w-full rounded-lg shadow-2xl ${
              imageLoaded ? "cursor-crosshair" : "invisible"
            }`}
            style={{
              cursor: allPlaced
                ? selectedPointIndex !== null
                  ? "crosshair"
                  : "pointer"
                : showOverlay
                  ? "default"
                  : "crosshair",
            }}
          />
        </div>
      </main>
    </div>
  );
}
