"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const PAGE_GAP_PX = 12;

type PdfCanvasViewerProps = {
  url: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; pageCount: number }
  | { status: "error"; message: string };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

/** pdfjs-dist document handle — destroy() tears down the worker-backed instance. */
type PdfDocumentHandle = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<import("pdfjs-dist").PDFPageProxy>;
  destroy: () => Promise<void>;
};

function releasePdfDocument(
  pdf: PdfDocumentHandle | null | undefined,
): void {
  if (!pdf) return;
  void pdf.destroy().catch(() => {});
}

export function PdfCanvasViewer({ url }: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pagesHostRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<PdfDocumentHandle | null>(null);
  const renderGenerationRef = useRef(0);
  const widthRef = useRef(0);
  /** Zoom used for the last canvas render. */
  const renderZoomRef = useRef(1);
  /** Live zoom shown via CSS during an active pinch / trackpad gesture. */
  const liveZoomRef = useRef(1);
  const pinchRef = useRef<{
    startDistance: number;
    startZoom: number;
  } | null>(null);
  const wheelCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [containerWidth, setContainerWidth] = useState(0);
  const [renderZoom, setRenderZoom] = useState(1);
  const [liveZoom, setLiveZoom] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  renderZoomRef.current = renderZoom;
  liveZoomRef.current = liveZoom;

  const retry = useCallback(() => {
    setLoadState({ status: "loading" });
    setReloadToken((token) => token + 1);
  }, []);

  const commitZoom = useCallback((next: number) => {
    const zoom = clamp(next, MIN_ZOOM, MAX_ZOOM);
    liveZoomRef.current = zoom;
    renderZoomRef.current = zoom;
    setLiveZoom(zoom);
    setRenderZoom(zoom);
  }, []);

  // Measure the scroll container for fit-to-width.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = Math.floor(el.clientWidth);
      if (next > 0 && next !== widthRef.current) {
        widthRef.current = next;
        setContainerWidth(next);
      }
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch + parse PDF.
  useEffect(() => {
    let cancelled = false;
    let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | null = null;

    async function loadPdf() {
      setLoadState({ status: "loading" });
      releasePdfDocument(pdfRef.current);
      pdfRef.current = null;

      try {
        // Polyfill APIs required by pdfjs-dist 5.x (not in all Chromium builds yet).
        const mapProto = Map.prototype as Map<unknown, unknown> & {
          getOrInsertComputed?: (
            key: unknown,
            callbackFn: (key: unknown) => unknown,
          ) => unknown;
        };
        if (typeof mapProto.getOrInsertComputed !== "function") {
          Object.defineProperty(Map.prototype, "getOrInsertComputed", {
            configurable: true,
            writable: true,
            value(key: unknown, callbackFn: (key: unknown) => unknown) {
              if (this.has(key)) {
                return this.get(key);
              }
              const value = callbackFn(key);
              this.set(key, value);
              return value;
            },
          });
        }

        // Legacy build includes broader runtime compatibility for Next/Turbopack clients.
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const response = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
        });

        if (!response.ok) {
          const message =
            response.status === 401 || response.status === 403
              ? "Please sign in to view this report."
              : response.status === 404
                ? "PDF not found for this report."
                : `Could not load PDF (${response.status}).`;
          throw new Error(message);
        }

        const data = new Uint8Array(await response.arrayBuffer());
        loadingTask = pdfjs.getDocument({ data });
        const pdf = (await loadingTask.promise) as PdfDocumentHandle;
        if (cancelled) {
          await pdf.destroy();
          return;
        }

        pdfRef.current = pdf;
        liveZoomRef.current = 1;
        renderZoomRef.current = 1;
        setLiveZoom(1);
        setRenderZoom(1);
        setLoadState({ status: "ready", pageCount: pdf.numPages });
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : "Could not open this PDF.";
        setLoadState({ status: "error", message });
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
      releasePdfDocument(pdfRef.current);
      pdfRef.current = null;
    };
  }, [url, reloadToken]);

  // Render all pages at fit-width × committed zoom.
  useEffect(() => {
    if (loadState.status !== "ready" || containerWidth <= 0) return;

    const pdf = pdfRef.current;
    const host = pagesHostRef.current;
    if (!pdf || !host) return;

    const doc = pdf;
    const pagesHost = host;
    const generation = ++renderGenerationRef.current;
    let cancelled = false;
    const renderTasks: Array<{ cancel: () => void }> = [];

    async function renderPages() {
      pagesHost.replaceChildren();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetCssWidth = containerWidth * renderZoom;

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        if (cancelled || generation !== renderGenerationRef.current) return;

        const page = await doc.getPage(pageNumber);
        if (cancelled || generation !== renderGenerationRef.current) {
          page.cleanup();
          return;
        }

        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = targetCssWidth / baseViewport.width;
        const viewport = page.getViewport({ scale: cssScale * dpr });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        canvas.style.display = "block";
        canvas.style.margin = "0 auto";
        if (pageNumber < doc.numPages) {
          canvas.style.marginBottom = `${PAGE_GAP_PX}px`;
        }
        canvas.setAttribute("aria-label", `PDF page ${pageNumber}`);

        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          page.cleanup();
          throw new Error("Canvas is not available in this browser.");
        }

        pagesHost.appendChild(canvas);

        const task = page.render({
          canvas,
          viewport,
        });
        renderTasks.push(task);
        await task.promise;
        page.cleanup();
      }
    }

    void renderPages().catch((error) => {
      if (cancelled || generation !== renderGenerationRef.current) return;
      const message =
        error instanceof Error ? error.message : "Could not render this PDF.";
      setLoadState({ status: "error", message });
    });

    return () => {
      cancelled = true;
      for (const task of renderTasks) {
        try {
          task.cancel();
        } catch {
          // Ignore cancel races during unmount / re-render.
        }
      }
    };
  }, [loadState, containerWidth, renderZoom]);

  // Pinch-zoom + ctrl/meta-wheel zoom. One-finger scroll stays native.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        pinchRef.current = null;
        return;
      }
      pinchRef.current = {
        startDistance: touchDistance(event.touches[0], event.touches[1]),
        startZoom: liveZoomRef.current,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 2 || !pinchRef.current) return;
      if (pinchRef.current.startDistance <= 0) return;

      event.preventDefault();
      const distance = touchDistance(event.touches[0], event.touches[1]);
      const next = clamp(
        pinchRef.current.startZoom * (distance / pinchRef.current.startDistance),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      liveZoomRef.current = next;
      setLiveZoom(next);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      if (!pinchRef.current) return;
      pinchRef.current = null;
      commitZoom(liveZoomRef.current);
    };

    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.01);
      const next = clamp(liveZoomRef.current * factor, MIN_ZOOM, MAX_ZOOM);
      liveZoomRef.current = next;
      setLiveZoom(next);

      if (wheelCommitTimerRef.current) {
        clearTimeout(wheelCommitTimerRef.current);
      }
      wheelCommitTimerRef.current = setTimeout(() => {
        commitZoom(liveZoomRef.current);
      }, 140);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      if (wheelCommitTimerRef.current) {
        clearTimeout(wheelCommitTimerRef.current);
      }
    };
  }, [commitZoom]);

  const previewScale = liveZoom / renderZoom;
  const hostStyle: CSSProperties = {
    transform: previewScale === 1 ? undefined : `scale(${previewScale})`,
    transformOrigin: "top center",
  };

  const overlayStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    padding: "24px",
    textAlign: "center",
    background: "rgba(0,0,0,0.72)",
    color: "#e4e4e7",
    zIndex: 2,
  };

  return (
    <div className="relative min-h-0 w-full flex-1 bg-zinc-950">
      <div
        ref={containerRef}
        className="h-full w-full overflow-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y" }}
        aria-label="PDF document"
      >
        <div ref={pagesHostRef} className="mx-auto w-full px-0 py-1" style={hostStyle} />
      </div>

      {loadState.status === "loading" ? (
        <div style={overlayStyle} role="status" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-accent" />
          <p className="text-sm text-zinc-300">Loading PDF…</p>
        </div>
      ) : null}

      {loadState.status === "error" ? (
        <div style={overlayStyle} role="alert">
          <p className="text-sm text-zinc-200">{loadState.message}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-full bg-zinc-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
