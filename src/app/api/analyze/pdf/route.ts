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

type PdfRequestBody = {
  overlayImageBase64?: string;
  report?: ConformationReport;
  horse_name?: string;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 28;
const ACCENT_RGB = rgb(0, 212 / 255, 200 / 255);

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

  if (!body.overlayImageBase64?.trim()) {
    return NextResponse.json(
      { error: "overlayImageBase64 is required" },
      { status: 400 },
    );
  }

  if (!body.report) {
    return NextResponse.json({ error: "report is required" }, { status: 400 });
  }

  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const overlayImage = await embedOverlayImage(
      pdfDoc,
      body.overlayImageBase64,
    );

    const report = body.report;
    const generatedAt = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    page.drawText("EquiForm", {
      x: MARGIN,
      y,
      size: 26,
      font: fontBold,
      color: ACCENT_RGB,
    });
    y -= 32;

    page.drawText("AQHA Conformation Analysis Report", {
      x: MARGIN,
      y,
      size: 14,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 22;

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

    const maxImageHeight = 340;
    const imageScale = Math.min(
      CONTENT_WIDTH / overlayImage.width,
      maxImageHeight / overlayImage.height,
    );
    const imageWidth = overlayImage.width * imageScale;
    const imageHeight = overlayImage.height * imageScale;

    page.drawImage(overlayImage, {
      x: MARGIN + (CONTENT_WIDTH - imageWidth) / 2,
      y: y - imageHeight,
      width: imageWidth,
      height: imageHeight,
    });
    y -= imageHeight + 28;

    const ensureSpace = (needed: number) => {
      if (y - needed >= MARGIN + 40) return;
      drawFooter(page, fontRegular);
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
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
      ensureSpace(22);
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

    ensureSpace(40);
    page.drawText("Written Report", {
      x: MARGIN,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 24;

    const writeParagraph = (text: string, fontSize: number, gap: number) => {
      const lines = wrapText(text, fontRegular, fontSize, CONTENT_WIDTH);
      const lineHeight = fontSize + 4;

      for (const line of lines) {
        if (y - lineHeight < MARGIN + 40) {
          drawFooter(page, fontRegular);
          page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          y = PAGE_HEIGHT - MARGIN;
        }
        page.drawText(line, {
          x: MARGIN,
          y,
          size: fontSize,
          font: fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= lineHeight;
      }

      y -= gap;
    };

    writeParagraph(report.summary, 11, 16);

    for (const { key, label } of SCORE_ROWS) {
      const section = report[key];
      if (y - 40 < MARGIN + 40) {
        drawFooter(page, fontRegular);
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }

      page.drawText(label, {
        x: MARGIN,
        y,
        size: 11,
        font: fontBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 16;

      y = drawWrappedParagraph(
        page,
        section.notes,
        MARGIN,
        y,
        fontRegular,
        10,
        CONTENT_WIDTH,
        14,
        rgb(0.25, 0.25, 0.25),
      );
      y -= 12;
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
    console.error("[analyze/pdf] failed:", error);
    const message =
      error instanceof Error ? error.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
