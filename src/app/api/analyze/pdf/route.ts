import { createRequire } from "node:module";

import { createClient } from "@supabase/supabase-js";
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
import { createServiceRoleClient } from "@/lib/supabase/server";

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
  reportId?: string;
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
  breed?: string;
  age?: string;
  sex?: string;
  discipline?: string;
  model3d_snapshot?: string;
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
const PDF_STORAGE_BUCKET = "horse-photos";
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

function drawReportHorseDetailsHeader(
  page: PDFPage,
  y: number,
  fontBold: PDFFont,
  fontRegular: PDFFont,
  body: PdfRequestBody,
): number {
  let cursorY = y;
  const horseName =
    typeof body.horse_name === "string" ? body.horse_name.trim() : "";

  if (horseName) {
    page.drawText(horseName, {
      x: MARGIN,
      y: cursorY,
      size: 18,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursorY -= 22;
  }

  const detailLines = [
    typeof body.breed === "string" && body.breed.trim()
      ? `Breed: ${body.breed.trim()}`
      : null,
    typeof body.age === "string" && body.age.trim()
      ? `Age: ${body.age.trim()}`
      : null,
    typeof body.sex === "string" && body.sex.trim()
      ? `Sex: ${body.sex.trim()}`
      : null,
    typeof body.discipline === "string" && body.discipline.trim()
      ? `Discipline: ${body.discipline.trim()}`
      : null,
  ].filter((line): line is string => Boolean(line));

  for (const line of detailLines) {
    page.drawText(line, {
      x: MARGIN,
      y: cursorY,
      size: 10,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    });
    cursorY -= 14;
  }

  return cursorY - 6;
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

async function persistReportPdf(
  pdfBytes: Uint8Array,
  userId: string,
  reportId: string,
  serviceClient: ReturnType<typeof createServiceRoleClient>,
): Promise<string> {
  const storagePath = `reports/${userId}/${reportId}.pdf`;

  const { error: uploadError } = await serviceClient.storage
    .from(PDF_STORAGE_BUCKET)
    .upload(storagePath, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload PDF: ${uploadError.message}`);
  }

  const { data: publicUrlData } = serviceClient.storage
    .from(PDF_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  const pdfUrl = publicUrlData.publicUrl;

  const { error: updateError } = await serviceClient
    .from("reports")
    .update({ pdf_url: pdfUrl })
    .eq("id", reportId)
    .eq("user_id", userId);

  if (updateError) {
    throw new Error(`Failed to save PDF URL: ${updateError.message}`);
  }

  return pdfUrl;
}

export async function POST(request: Request) {
  let body: PdfRequestBody;

  try {
    body = (await request.json()) as PdfRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reportId =
    typeof body.reportId === "string" ? body.reportId.trim() : "";

  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const serviceClient = createServiceRoleClient();

  const { data: existingReport, error: existingReportError } =
    await serviceClient
      .from("reports")
      .select("pdf_url")
      .eq("id", reportId)
      .eq("user_id", user.id)
      .maybeSingle();

  if (existingReportError) {
    return NextResponse.json(
      { error: "Failed to load report" },
      { status: 500 },
    );
  }

  if (!existingReport) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (existingReport.pdf_url) {
    return NextResponse.json({ pdfUrl: existingReport.pdf_url });
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

    let model3dSnapshotImage: PDFImage | null = null;
    if (body.model3d_snapshot?.trim()) {
      model3dSnapshotImage = await embedOverlayImage(
        pdfDoc,
        body.model3d_snapshot.trim(),
      );
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

    y = drawReportHorseDetailsHeader(page, y, fontBold, fontRegular, body);

    const overallText = `Overall Score: ${report.overall_score} / 100`;
    page.drawText(overallText, {
      x: MARGIN,
      y,
      size: 13,
      font: fontBold,
      color: ACCENT_RGB,
    });
    y -= 32;

    if (!isFullReport) {
      const overlayMaxHeight = Math.max(200, y - MARGIN - 40);
      const imageScale = Math.min(
        CONTENT_WIDTH / overlayImage!.width,
        overlayMaxHeight / overlayImage!.height,
      );
      const imageWidth = overlayImage!.width * imageScale;
      const imageHeight = overlayImage!.height * imageScale;

      page.drawImage(overlayImage!, {
        x: MARGIN + (CONTENT_WIDTH - imageWidth) / 2,
        y: y - imageHeight,
        width: imageWidth,
        height: imageHeight,
      });
      y -= imageHeight + 20;
    } else if (fullReportOverlayImage) {
      const overlayLabel = getFullReportOverlayLabel(body.better_side);
      y = drawFullReportOverlay(
        page,
        y,
        fullReportOverlayImage,
        overlayLabel,
        fontRegular,
      );
    }

    if (isFullReport) {
      const photoLabels = FULL_REPORT_IMAGE_FIELDS.map(({ label }) => label);
      y = drawHorizontalPhotoRow(
        page,
        y,
        fullReportImages,
        photoLabels,
        fontRegular,
      );
    }

    drawFooter(page, fontRegular);
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;

    const MIN_CONTENT_Y = MARGIN + 32;

    const forceNewPage = () => {
      drawFooter(page, fontRegular);
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    };

    const ensureSpace = (needed: number) => {
      if (y - needed >= MIN_CONTENT_Y) return;
      forceNewPage();
    };

    const ensureLineSpace = (lineHeight: number) => {
      if (y - lineHeight >= MIN_CONTENT_Y) return;
      forceNewPage();
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

    y -= 12;
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

    if (model3dSnapshotImage) {
      y -= 24;

      ensureSpace(28);
      drawCenteredText(page, "3D Model View", y, fontBold, 16, rgb(0.1, 0.1, 0.1));
      y -= 28;

      const horseName =
        typeof body.horse_name === "string" ? body.horse_name.trim() : "";
      if (horseName) {
        ensureSpace(26);
        drawCenteredText(page, horseName, y, fontBold, 20, rgb(0.1, 0.1, 0.1));
        y -= 26;
      }

      const detailLines = [
        typeof body.breed === "string" && body.breed.trim()
          ? `Breed: ${body.breed.trim()}`
          : null,
        typeof body.age === "string" && body.age.trim()
          ? `Age: ${body.age.trim()}`
          : null,
        typeof body.sex === "string" && body.sex.trim()
          ? `Sex: ${body.sex.trim()}`
          : null,
        typeof body.discipline === "string" && body.discipline.trim()
          ? `Discipline: ${body.discipline.trim()}`
          : null,
      ].filter((line): line is string => Boolean(line));

      for (const line of detailLines) {
        ensureSpace(14);
        drawCenteredText(page, line, y, fontRegular, 10, rgb(0.35, 0.35, 0.35));
        y -= 14;
      }

      y -= 10;
      ensureSpace(28);
      const model3dOverallText = `Overall Score: ${report.overall_score}/100`;
      drawCenteredText(page, model3dOverallText, y, fontBold, 14, ACCENT_RGB);
      y -= 28;

      const snapshotMaxHeight = 350;
      const availableSnapshotHeight = Math.max(120, y - MIN_CONTENT_Y - 36);
      const snapshotScale = Math.min(
        CONTENT_WIDTH / model3dSnapshotImage.width,
        Math.min(snapshotMaxHeight, availableSnapshotHeight) /
          model3dSnapshotImage.height,
      );
      const snapshotWidth = model3dSnapshotImage.width * snapshotScale;
      const snapshotHeight = model3dSnapshotImage.height * snapshotScale;

      ensureSpace(snapshotHeight + 36);
      page.drawImage(model3dSnapshotImage, {
        x: MARGIN + (CONTENT_WIDTH - snapshotWidth) / 2,
        y: y - snapshotHeight,
        width: snapshotWidth,
        height: snapshotHeight,
      });
      y -= snapshotHeight + 20;

      ensureSpace(16);
      drawCenteredText(
        page,
        "Generated by EquiForm — equiform.app",
        y,
        fontRegular,
        9,
        rgb(0.45, 0.45, 0.45),
      );
      y -= 16;
    }

    for (const pdfPage of pdfDoc.getPages()) {
      drawFooter(pdfPage, fontRegular);
    }

    const pdfBytes = await pdfDoc.save();
    const pdfUrl = await persistReportPdf(
      pdfBytes,
      user.id,
      reportId,
      serviceClient,
    );

    return NextResponse.json({ pdfUrl });
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
