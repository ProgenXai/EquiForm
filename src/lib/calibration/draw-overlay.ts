import { createCanvas, loadImage, type CanvasRenderingContext2D } from "canvas";
import type {
  FrontConformationLandmarks,
  HindConformationLandmarks,
} from "@/lib/analyze/landmark-parser";
import { computeToplineY, type ConformationLandmarks } from "@/lib/conformation/landmarks";

function xPx(frac: number, imageWidth: number): number {
  return frac * imageWidth;
}

function yPx(frac: number, imageHeight: number): number {
  return frac * imageHeight;
}

type Point = { x: number; y: number };

function toPoint(
  lm: ConformationLandmarks,
  xKey: keyof ConformationLandmarks,
  yKey: keyof ConformationLandmarks,
  w: number,
  h: number
): Point {
  return { x: xPx(lm[xKey] as number, w), y: yPx(lm[yKey] as number, h) };
}

function drawVerticalReference(
  ctx: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  imageHeight: number,
  lineWidth: number
) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x, yTop);
  ctx.lineTo(x, imageHeight);
  ctx.stroke();
  ctx.restore();
}

function drawLegStack(ctx: CanvasRenderingContext2D, points: Point[], lineWidth: number) {
  if (points.length < 2) return;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

function drawJointDot(ctx: CanvasRenderingContext2D, p: Point, radius: number) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
  ctx.strokeStyle = "rgba(15, 15, 15, 0.85)";
  ctx.lineWidth = Math.max(2, radius * 0.35);
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** Short-back square: top-left (loin_x, toplineY); top-right (withers_x, toplineY); bottom at girth_y. */
function drawYellowSquare(
  ctx: CanvasRenderingContext2D,
  loinX: number,
  withersX: number,
  topY: number,
  girthY: number,
  lineWidth: number
) {
  ctx.strokeStyle = "rgba(240, 230, 0, 0.9)";
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(loinX, topY);
  ctx.lineTo(withersX, topY);
  ctx.lineTo(withersX, girthY);
  ctx.lineTo(loinX, girthY);
  ctx.closePath();
  ctx.stroke();
}

/**
 * AQHA balance trapezoid — bottom-left (point_of_buttock_x, girth_y); top-left (loin_x, loin_y).
 */
function drawGreenTrapezoid(
  ctx: CanvasRenderingContext2D,
  pointOfButtockX: number,
  pointOfShoulderX: number,
  girthY: number,
  withersX: number,
  withersY: number,
  loinX: number,
  loinY: number,
  lineWidth: number
) {
  ctx.strokeStyle = "rgba(50, 210, 50, 0.9)";
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(pointOfButtockX, girthY);
  ctx.lineTo(pointOfShoulderX, girthY);
  ctx.lineTo(withersX, withersY);
  ctx.lineTo(loinX, loinY);
  ctx.lineTo(pointOfButtockX, girthY);
  ctx.stroke();
}

export async function drawConformationOverlay(
  imageBuffer: Buffer,
  landmarks: ConformationLandmarks,
  imageWidth: number,
  imageHeight: number
): Promise<Buffer> {
  const canvas = createCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext("2d");

  const img = await loadImage(imageBuffer);
  ctx.drawImage(img, 0, 0, imageWidth, imageHeight);

  const lineWidth = Math.max(4, Math.floor(imageWidth / 350));
  const thinLine = Math.max(2, Math.floor(imageWidth / 500));
  const jointRadius = Math.max(6, Math.floor(imageWidth / 100));
  const legLineWidth = Math.max(3, Math.floor(imageWidth / 400));
  const refLineWidth = Math.max(2, Math.floor(imageWidth / 500));

  const shoulderX = xPx(landmarks.point_of_shoulder_x, imageWidth);
  const girthX = xPx(landmarks.girth_x, imageWidth);
  const flankX = xPx(landmarks.flank_x, imageWidth);
  const buttockX = xPx(landmarks.point_of_buttock_x, imageWidth);
  const withersX = xPx(landmarks.withers_x, imageWidth);
  const loinX = xPx(landmarks.loin_x, imageWidth);
  const withersY = yPx(landmarks.withers_y, imageHeight);
  const loinY = yPx(landmarks.loin_y, imageHeight);
  const buttockY = yPx(landmarks.buttock_y, imageHeight);
  const girthY = yPx(landmarks.girth_y, imageHeight);
  const toplineY = yPx(computeToplineY(landmarks), imageHeight);

  const poll = toPoint(landmarks, "poll_x", "poll_y", imageWidth, imageHeight);
  const shoulder = toPoint(landmarks, "point_of_shoulder_x", "shoulder_y", imageWidth, imageHeight);
  const forearm = toPoint(landmarks, "forearm_x", "forearm_y", imageWidth, imageHeight);
  const frontKnee = toPoint(landmarks, "front_knee_x", "front_knee_y", imageWidth, imageHeight);
  const frontFetlock = toPoint(landmarks, "front_fetlock_x", "front_fetlock_y", imageWidth, imageHeight);
  const frontHoof = toPoint(landmarks, "front_hoof_x", "front_hoof_y", imageWidth, imageHeight);
  const withers = toPoint(landmarks, "withers_x", "withers_y", imageWidth, imageHeight);
  const girth = toPoint(landmarks, "girth_x", "girth_y", imageWidth, imageHeight);
  const loin = toPoint(landmarks, "loin_x", "loin_y", imageWidth, imageHeight);
  const flank = toPoint(landmarks, "flank_x", "flank_y", imageWidth, imageHeight);
  const tail = toPoint(landmarks, "tail_x", "tail_y", imageWidth, imageHeight);
  const buttockJoint: Point = { x: buttockX, y: buttockY };
  const pointOfHip = toPoint(landmarks, "point_of_hip_x", "point_of_hip_y", imageWidth, imageHeight);
  const stifle = toPoint(landmarks, "stifle_x", "stifle_y", imageWidth, imageHeight);
  const gaskin = toPoint(landmarks, "gaskin_x", "gaskin_y", imageWidth, imageHeight);
  const hindHock = toPoint(landmarks, "hind_hock_x", "hind_hock_y", imageWidth, imageHeight);
  const hindFetlock = toPoint(landmarks, "hind_fetlock_x", "hind_fetlock_y", imageWidth, imageHeight);
  const hindHoof = toPoint(landmarks, "hind_hoof_x", "hind_hoof_y", imageWidth, imageHeight);

  ctx.strokeStyle = "rgba(120, 200, 255, 0.85)";
  ctx.lineWidth = thinLine;
  ctx.beginPath();
  ctx.moveTo(0, girthY);
  ctx.lineTo(imageWidth, girthY);
  ctx.stroke();

  const redVerticalXs = [flankX, girthX, shoulderX, buttockX];
  ctx.strokeStyle = "rgba(220, 40, 40, 0.9)";
  ctx.lineWidth = lineWidth;
  for (const x of redVerticalXs) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, imageHeight);
    ctx.stroke();
  }

  drawYellowSquare(ctx, loinX, withersX, toplineY, girthY, lineWidth);
  drawGreenTrapezoid(
    ctx,
    buttockX,
    shoulderX,
    girthY,
    withersX,
    withersY,
    loinX,
    loinY,
    lineWidth
  );

  drawVerticalReference(ctx, shoulderX, toplineY, imageHeight, refLineWidth);
  drawVerticalReference(ctx, buttockX, toplineY, imageHeight, refLineWidth);

  drawLegStack(ctx, [forearm, frontKnee, frontFetlock, frontHoof], legLineWidth);
  drawLegStack(ctx, [gaskin, hindHock, hindFetlock, hindHoof], legLineWidth);

  const landmarkDots = [
    poll,
    shoulder,
    forearm,
    frontKnee,
    frontFetlock,
    frontHoof,
    withers,
    girth,
    loin,
    flank,
    pointOfHip,
    tail,
    buttockJoint,
    stifle,
    gaskin,
    hindHock,
    hindFetlock,
    hindHoof,
  ];

  for (let i = 0; i < landmarkDots.length; i++) {
    const p = landmarkDots[i];
    drawJointDot(ctx, p, jointRadius);
  }

  return canvas.toBuffer("image/jpeg", { quality: 0.95 });
}

function landmarkToPoint(
  point: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
): Point {
  return { x: point.x * imageWidth, y: point.y * imageHeight };
}

function drawFullWidthHorizontal(
  ctx: CanvasRenderingContext2D,
  y: number,
  imageWidth: number,
  lineWidth: number,
) {
  ctx.strokeStyle = "rgba(120, 200, 255, 0.85)";
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(imageWidth, y);
  ctx.stroke();
}

function drawFullHeightVertical(
  ctx: CanvasRenderingContext2D,
  x: number,
  imageHeight: number,
  lineWidth: number,
) {
  drawRedVertical(ctx, x, 0, imageHeight, lineWidth);
}

function drawRedVertical(
  ctx: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  yBottom: number,
  lineWidth: number,
) {
  ctx.strokeStyle = "rgba(220, 40, 40, 0.9)";
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(x, yTop);
  ctx.lineTo(x, yBottom);
  ctx.stroke();
}

export async function drawFrontConformationOverlay(
  imageBuffer: Buffer,
  landmarks: FrontConformationLandmarks,
  imageWidth: number,
  imageHeight: number,
): Promise<Buffer> {
  const canvas = createCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext("2d");

  const img = await loadImage(imageBuffer);
  ctx.drawImage(img, 0, 0, imageWidth, imageHeight);

  const lineWidth = Math.max(4, Math.floor(imageWidth / 350));

  const leftShoulder = landmarkToPoint(
    landmarks.left_point_of_shoulder,
    imageWidth,
    imageHeight,
  );
  const rightShoulder = landmarkToPoint(
    landmarks.right_point_of_shoulder,
    imageWidth,
    imageHeight,
  );
  const leftKnee = landmarkToPoint(landmarks.left_knee, imageWidth, imageHeight);
  const rightKnee = landmarkToPoint(landmarks.right_knee, imageWidth, imageHeight);

  drawFullHeightVertical(ctx, imageWidth / 2, imageHeight, lineWidth);
  drawRedVertical(ctx, leftKnee.x, leftShoulder.y, imageHeight, lineWidth);
  drawRedVertical(ctx, rightKnee.x, rightShoulder.y, imageHeight, lineWidth);

  return canvas.toBuffer("image/jpeg", { quality: 0.95 });
}

export async function drawHindConformationOverlay(
  imageBuffer: Buffer,
  landmarks: HindConformationLandmarks,
  imageWidth: number,
  imageHeight: number,
): Promise<Buffer> {
  const canvas = createCanvas(imageWidth, imageHeight);
  const ctx = canvas.getContext("2d");

  const img = await loadImage(imageBuffer);
  ctx.drawImage(img, 0, 0, imageWidth, imageHeight);

  const lineWidth = Math.max(4, Math.floor(imageWidth / 350));

  const leftButtock = landmarkToPoint(landmarks.left_buttock, imageWidth, imageHeight);
  const rightButtock = landmarkToPoint(
    landmarks.right_buttock,
    imageWidth,
    imageHeight,
  );
  const leftGaskin = landmarkToPoint(landmarks.left_gaskin, imageWidth, imageHeight);
  const rightGaskin = landmarkToPoint(landmarks.right_gaskin, imageWidth, imageHeight);
  const leftHock = landmarkToPoint(landmarks.left_hock, imageWidth, imageHeight);
  const rightHock = landmarkToPoint(landmarks.right_hock, imageWidth, imageHeight);

  const centerX = (leftButtock.x + rightButtock.x) / 2;

  drawFullHeightVertical(ctx, centerX, imageHeight, lineWidth);
  drawRedVertical(ctx, leftHock.x, leftGaskin.y, imageHeight, lineWidth);
  drawRedVertical(ctx, rightHock.x, rightGaskin.y, imageHeight, lineWidth);

  return canvas.toBuffer("image/jpeg", { quality: 0.95 });
}
