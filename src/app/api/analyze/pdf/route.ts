import { createRequire } from "node:module";

import { NextResponse } from "next/server";
import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFImage,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import type { ConformationReport } from "@/lib/analyze/types";

const require = createRequire(import.meta.url);
// fontkit is CJS-only; required for pdf-lib registerFontkit
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require("fontkit");

export const maxDuration = 30;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

type PdfRequestBody = {
  overlayUrl?: string;
  frontOverlayUrl?: string;
  hindOverlayUrl?: string;
  better_side?: "left" | "right";
  leftImage?: string;
  rightImage?: string;
  frontImage?: string;
  hindImage?: string;
  report?: ConformationReport;
  horse_name?: string;
};

const FULL_REPORT_OVERLAY_MAX_HEIGHT = 200;
const FULL_REPORT_PHOTO_ROW_GAP = 8;
const FULL_REPORT_PHOTO_ROW_HEIGHT = 150;
const SINGLE_VIEW_SCORES_RESERVED_HEIGHT = 220;

const FULL_REPORT_IMAGE_FIELDS = [
  { key: "leftImage" as const, label: "Left Side" },
  { key: "rightImage" as const, label: "Right Side" },
  { key: "frontImage" as const, label: "Front View" },
  { key: "hindImage" as const, label: "Hind View" },
];

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 28;
const ACCENT_RGB = rgb(0, 212 / 255, 200 / 255);
const PDF_SUBTITLE = "AI-Powered Equine Conformation Analysis Report";

const SCORE_ROWS: {
  key: keyof Omit<ConformationReport, "overall_score" | "summary">;
  label: string;
}[] = [
  { key: "balance", label: "Balance (rule of thirds)" },
  { key: "shoulder_angle", label: "Shoulder Angle" },
  { key: "hip_angle", label: "Hip Angle" },
  { key: "topline_quality", label: "Topline Quality" },
  { key: "leg_alignment", label: "Leg Alignment" },
];

function stripBase64Payload(value: string): string {
  const comma = value.indexOf(",");
  return comma >= 0 ? value.slice(comma + 1) : value;
}

function decodeOverlayBytes(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(stripBase64Payload(base64), "base64"));
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

async function embedOverlayImage(
  pdfDoc: PDFDocument,
  base64: string,
): Promise<PDFImage> {
  const bytes = decodeOverlayBytes(base64);
  if (isPng(bytes)) {
    return pdfDoc.embedPng(bytes);
  }
  return pdfDoc.embedJpg(bytes);
}

async function fetchEmbeddedImage(
  pdfDoc: PDFDocument,
  url: string,
  label?: string,
): Promise<PDFImage> {
  const trimmedUrl = url.trim();
  const response = await fetch(trimmedUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image${label ? ` (${label})` : ""} from URL: ${response.status} ${response.statusText}`,
    );
  }

  const imageBytes = new Uint8Array(await response.arrayBuffer());
  if (imageBytes.length === 0) {
    throw new Error(
      `Failed to fetch image${label ? ` (${label})` : ""}: empty response`,
    );
  }

  if (isPng(imageBytes)) {
    return pdfDoc.embedPng(imageBytes);
  }

  return pdfDoc.embedJpg(imageBytes);
}

function hasFullReportImages(body: PdfRequestBody): boolean {
  return FULL_REPORT_IMAGE_FIELDS.every(({ key }) => body[key]?.trim());
}

function summarizePdfImageUrl(url: string | undefined): string {
  if (!url?.trim()) return "(missing)";

  const trimmed = url.trim();
  if (trimmed.startsWith("data:")) {
    const commaIndex = trimmed.indexOf(",");
    const header =
      commaIndex >= 0 ? trimmed.slice(0, commaIndex) : trimmed.slice(0, 40);
    return `${header} (${trimmed.length} chars)`;
  }

  if (trimmed.length > 120) {
    return `${trimmed.slice(0, 120)}… (${trimmed.length} chars)`;
  }

  return trimmed;
}

function logPdfRequest(body: PdfRequestBody, isFullReport: boolean) {
  console.log("[analyze/pdf] request received:", {
    isFullReport,
    horse_name: body.horse_name ?? null,
    overlayUrl: summarizePdfImageUrl(body.overlayUrl),
    frontOverlayUrl: summarizePdfImageUrl(body.frontOverlayUrl),
    hindOverlayUrl: summarizePdfImageUrl(body.hindOverlayUrl),
    leftImage: summarizePdfImageUrl(body.leftImage),
    rightImage: summarizePdfImageUrl(body.rightImage),
    frontImage: summarizePdfImageUrl(body.frontImage),
    hindImage: summarizePdfImageUrl(body.hindImage),
    overall_score: body.report?.overall_score ?? null,
  });
}

function measureHorizontalPhotoRowHeight(): number {
  const labelSize = 9;
  const labelGap = 5;
  return FULL_REPORT_PHOTO_ROW_HEIGHT + labelGap + labelSize + 10;
}

function drawHorizontalPhotoRow(
  page: PDFPage,
  topY: number,
  images: PDFImage[],
  labels: string[],
  font: PDFFont,
): number {
  const count = images.length;
  const gap = FULL_REPORT_PHOTO_ROW_GAP;
  const labelSize = 9;
  const labelGap = 5;
  const cellWidth = (CONTENT_WIDTH - gap * (count - 1)) / count;
  const rowHeight = FULL_REPORT_PHOTO_ROW_HEIGHT;
  const rowBottomY = topY - rowHeight;
  const labelY = rowBottomY - labelGap - labelSize;

  for (let i = 0; i < count; i++) {
    const image = images[i]!;
    const label = labels[i]!;
    const cellX = MARGIN + i * (cellWidth + gap);

    const scale = Math.min(
      cellWidth / image.width,
      rowHeight / image.height,
    );
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    const imageY = rowBottomY + (rowHeight - imageHeight) / 2;

    page.drawImage(image, {
      x: cellX + (cellWidth - imageWidth) / 2,
      y: imageY,
      width: imageWidth,
      height: imageHeight,
    });

    const labelWidth = font.widthOfTextAtSize(label, labelSize);
    page.drawText(label, {
      x: cellX + (cellWidth - labelWidth) / 2,
      y: labelY,
      size: labelSize,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  return labelY - labelSize - 8;
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length === 0 || words[0] === "") return [];

  const lines: string[] = [];
  let current = words[0] ?? "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  lines.push(current);
  return lines;
}

function getFullReportOverlayLabel(
  betterSide: "left" | "right" | undefined,
): string {
  const sideLabel = betterSide === "right" ? "Right" : "Left";
  return `Overlay — ${sideLabel} Side (highest scoring view)`;
}

function measureFullReportOverlayBlock(
  image: PDFImage,
  font: PDFFont,
  label: string,
): number {
  const labelSize = 9;
  const labelGap = 6;
  const bottomGap = 10;
  const scale = Math.min(
    CONTENT_WIDTH / image.width,
    FULL_REPORT_OVERLAY_MAX_HEIGHT / image.height,
  );
  const imageHeight = image.height * scale;
  return imageHeight + labelGap + labelSize + bottomGap;
}

function drawFullReportOverlay(
  page: PDFPage,
  yTop: number,
  image: PDFImage,
  label: string,
  font: PDFFont,
): number {
  const labelSize = 9;
  const labelGap = 6;
  const bottomGap = 10;
  const scale = Math.min(
    CONTENT_WIDTH / image.width,
    FULL_REPORT_OVERLAY_MAX_HEIGHT / image.height,
  );
  const imageWidth = image.width * scale;
  const imageHeight = image.height * scale;

  const imageBottomY = yTop - imageHeight;
  page.drawImage(image, {
    x: MARGIN + (CONTENT_WIDTH - imageWidth) / 2,
    y: imageBottomY,
    width: imageWidth,
    height: imageHeight,
  });

  const labelWidth = font.widthOfTextAtSize(label, labelSize);
  const labelY = imageBottomY - labelGap - labelSize;
  page.drawText(label, {
    x: MARGIN + (CONTENT_WIDTH - labelWidth) / 2,
    y: labelY,
    size: labelSize,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });

  return labelY - bottomGap;
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_WIDTH - width) / 2,
    y,
    size,
    font,
    color,
  });
}

function drawFooter(page: PDFPage, font: PDFFont) {
  const text = "Powered by EquiForm";
  const size = 9;
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_WIDTH - width) / 2,
    y: FOOTER_Y,
    size,
    font,
    color: rgb(0.45, 0.45, 0.45),
  });
}

function drawWrappedParagraph(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  lineHeight: number,
  color = rgb(0.15, 0.15, 0.15),
): number {
  const lines = wrapText(text, font, fontSize, maxWidth);
  let cursorY = y;

  for (const line of lines) {
    page.drawText(line, { x, y: cursorY, size: fontSize, font, color });
    cursorY -= lineHeight;
  }

  return cursorY;
}

export async function POST(request: Request) {
  let body: PdfRequestBody;

  try {
    body = (await request.json()) as PdfRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.report) {
    return NextResponse.json({ error: "report is required" }, { status: 400 });
  }

  const isFullReport = hasFullReportImages(body);

  if (!isFullReport && !body.overlayUrl?.trim()) {
    return NextResponse.json(
      { error: "overlayUrl is required" },
      { status: 400 },
    );
  }

  logPdfRequest(body, isFullReport);

  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let overlayImage: PDFImage | null = null;
    let fullReportImages: PDFImage[] = [];
    let fullReportOverlayImage: PDFImage | null = null;

    if (isFullReport) {
      const frontRowUrl =
        body.frontOverlayUrl?.trim() || body.frontImage!.trim();
      const hindRowUrl =
        body.hindOverlayUrl?.trim() || body.hindImage!.trim();

      const fetchResults = await Promise.all([
        fetchEmbeddedImage(pdfDoc, body.leftImage!.trim(), "Left Side"),
        fetchEmbeddedImage(pdfDoc, body.rightImage!.trim(), "Right Side"),
        fetchEmbeddedImage(
          pdfDoc,
          frontRowUrl,
          body.frontOverlayUrl?.trim() ? "Front View overlay" : "Front View",
        ),
        fetchEmbeddedImage(
          pdfDoc,
          hindRowUrl,
          body.hindOverlayUrl?.trim() ? "Hind View overlay" : "Hind View",
        ),
        body.overlayUrl?.trim()
          ? fetchEmbeddedImage(pdfDoc, body.overlayUrl.trim(), "overlay")
          : Promise.resolve(null),
      ]);
      fullReportImages = fetchResults.slice(0, 4) as PDFImage[];
      fullReportOverlayImage = fetchResults[4] ?? null;
    } else {
      overlayImage = await fetchEmbeddedImage(pdfDoc, body.overlayUrl!.trim());
    }

    const report = body.report;
    const generatedAt = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    drawCenteredText(page, "EquiForm", y, fontBold, 26, ACCENT_RGB);
    y -= 24;

    drawCenteredText(
      page,
      PDF_SUBTITLE,
      y,
      fontRegular,
      11,
      rgb(0.2, 0.2, 0.2),
    );
    y -= 20;

    const horseName =
      typeof body.horse_name === "string" ? body.horse_name.trim() : "";
    if (horseName) {
      page.drawText(`Horse: ${horseName}`, {
        x: MARGIN,
        y,
        size: 11,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 18;
    }

    page.drawText(`Generated: ${generatedAt}`, {
      x: MARGIN,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 24;

    let fullReportPhotosDrawn = false;

    const drawFullReportPhotoRow = () => {
      if (!isFullReport || fullReportPhotosDrawn) return;
      const photoLabels = FULL_REPORT_IMAGE_FIELDS.map(({ label }) => label);
      y = drawHorizontalPhotoRow(
        page,
        y,
        fullReportImages,
        photoLabels,
        fontRegular,
      );
      fullReportPhotosDrawn = true;
    };

    const MIN_CONTENT_Y = MARGIN + 32;

    const forceNewPage = () => {
      drawFooter(page, fontRegular);
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    };

    const breakWrittenReportPage = () => {
      forceNewPage();
      if (isFullReport && !fullReportPhotosDrawn) {
        drawFullReportPhotoRow();
      }
    };

    const ensureSpace = (needed: number) => {
      if (y - needed >= MIN_CONTENT_Y) return;
      forceNewPage();
    };

    const ensureLineSpace = (lineHeight: number) => {
      if (y - lineHeight >= MIN_CONTENT_Y) return;
      breakWrittenReportPage();
    };

    const writeSectionHeader = (label: string) => {
      y -= 5;
      page.drawText(label, {
        x: MARGIN,
        y,
        size: 11,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 12;
    };

    if (!isFullReport) {
      const overlayMaxHeight = Math.max(
        280,
        y - MARGIN - 40 - SINGLE_VIEW_SCORES_RESERVED_HEIGHT,
      );
      const imageScale = Math.min(
        CONTENT_WIDTH / overlayImage!.width,
        overlayMaxHeight / overlayImage!.height,
      );
      const imageWidth = overlayImage!.width * imageScale;
      const imageHeight = overlayImage!.height * imageScale;

      ensureSpace(imageHeight + 28);

      page.drawImage(overlayImage!, {
        x: MARGIN + (CONTENT_WIDTH - imageWidth) / 2,
        y: y - imageHeight,
        width: imageWidth,
        height: imageHeight,
      });
      y -= imageHeight + 28;
    }

    ensureSpace(120);
    page.drawText("Conformation Scores", {
      x: MARGIN,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 26;

    for (const { key, label } of SCORE_ROWS) {
      const section = report[key];
      page.drawText(label, {
        x: MARGIN,
        y,
        size: 11,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });
      const scoreText = `${section.score} / 100`;
      const scoreWidth = fontBold.widthOfTextAtSize(scoreText, 11);
      page.drawText(scoreText, {
        x: PAGE_WIDTH - MARGIN - scoreWidth,
        y,
        size: 11,
        font: fontBold,
        color: ACCENT_RGB,
      });
      y -= 20;
    }

    ensureSpace(28);
    const overallText = `Overall Score: ${report.overall_score} / 100`;
    page.drawText(overallText, {
      x: MARGIN,
      y,
      size: 13,
      font: fontBold,
      color: ACCENT_RGB,
    });
    y -= 32;

    if (isFullReport && fullReportOverlayImage) {
      const overlayLabel = getFullReportOverlayLabel(body.better_side);
      const overlayBlockHeight = measureFullReportOverlayBlock(
        fullReportOverlayImage,
        fontRegular,
        overlayLabel,
      );

      if (y - overlayBlockHeight < MIN_CONTENT_Y) {
        forceNewPage();
      }

      y = drawFullReportOverlay(
        page,
        y,
        fullReportOverlayImage,
        overlayLabel,
        fontRegular,
      );
    }

    if (!isFullReport) {
      forceNewPage();
    }

    ensureSpace(36);
    page.drawText("Written Report", {
      x: MARGIN,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 18;

    const writeParagraph = (
      text: string,
      fontSize: number,
      gap: number,
      color = rgb(0.15, 0.15, 0.15),
    ) => {
      const lines = wrapText(text, fontRegular, fontSize, CONTENT_WIDTH);
      const lineHeight = fontSize + 3;

      for (const line of lines) {
        ensureLineSpace(lineHeight);
        page.drawText(line, {
          x: MARGIN,
          y,
          size: fontSize,
          font: fontRegular,
          color,
        });
        y -= lineHeight;
      }

      if (gap > 0) {
        y -= gap;
      }
    };

    writeParagraph(report.summary, 11, 6);

    for (const { key, label } of SCORE_ROWS) {
      const section = report[key];
      writeSectionHeader(label);
      writeParagraph(section.notes, 10, 3, rgb(0.25, 0.25, 0.25));
    }

    if (isFullReport && !fullReportPhotosDrawn) {
      const photoBlockHeight = measureHorizontalPhotoRowHeight();
      if (y - photoBlockHeight >= MIN_CONTENT_Y) {
        drawFullReportPhotoRow();
      }
    }

    for (const pdfPage of pdfDoc.getPages()) {
      drawFooter(pdfPage, fontRegular);
    }

    const pdfBytes = await pdfDoc.save();
    const filename = `equiform-report-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[analyze/pdf] PDF generation failed:", {
      isFullReport,
      horse_name: body.horse_name ?? null,
      overlayUrl: summarizePdfImageUrl(body.overlayUrl),
      frontOverlayUrl: summarizePdfImageUrl(body.frontOverlayUrl),
      hindOverlayUrl: summarizePdfImageUrl(body.hindOverlayUrl),
      leftImage: summarizePdfImageUrl(body.leftImage),
      rightImage: summarizePdfImageUrl(body.rightImage),
      frontImage: summarizePdfImageUrl(body.frontImage),
      hindImage: summarizePdfImageUrl(body.hindImage),
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : error,
    });

    if (error instanceof Error && error.stack) {
      console.error("[analyze/pdf] stack trace:", error.stack);
    }

    const message =
      error instanceof Error ? error.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
