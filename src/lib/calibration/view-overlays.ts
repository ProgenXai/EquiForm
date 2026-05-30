import type { LandmarkDefinition, LandmarkId, Point } from "@/lib/calibration/landmarks";
import type { LandmarkMap } from "@/lib/calibration/pixel-landmarks";

const RED = "rgba(220, 40, 40, 0.9)";
const BLUE = "rgba(60, 140, 255, 0.9)";

function requirePoint(map: LandmarkMap, id: LandmarkId): Point {
  const point = map[id];
  if (!point) {
    throw new Error(`Missing landmark: ${id}`);
  }
  return point;
}

function overlayScale(imageWidth: number) {
  return {
    lineWidth: Math.max(4, Math.floor(imageWidth / 350)),
    legLineWidth: Math.max(3, Math.floor(imageWidth / 400)),
    jointRadius: Math.max(6, Math.floor(imageWidth / 100)),
  };
}

function drawPlumbLine(
  ctx: CanvasRenderingContext2D,
  top: Point,
  bottom: Point,
  lineWidth: number,
) {
  ctx.save();
  ctx.strokeStyle = RED;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(top.x, bottom.y);
  ctx.stroke();
  ctx.restore();
}

function drawFrontLegPlumbLine(
  ctx: CanvasRenderingContext2D,
  kneeX: number,
  pollY: number,
  hoofY: number,
  lineWidth: number,
) {
  ctx.save();
  ctx.strokeStyle = RED;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(kneeX, hoofY + 30);
  ctx.lineTo(kneeX, pollY);
  ctx.stroke();
  ctx.restore();
}

function drawHindLegPlumbLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  tailHeadY: number,
  hoofY: number,
  lineWidth: number,
) {
  ctx.save();
  ctx.strokeStyle = RED;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, hoofY + 30);
  ctx.lineTo(x, tailHeadY);
  ctx.stroke();
  ctx.restore();
}

function drawVerticalCenterline(
  ctx: CanvasRenderingContext2D,
  top: Point,
  imageHeight: number,
  lineWidth: number,
  centerX?: number,
) {
  const x = centerX ?? top.x;

  ctx.save();
  ctx.strokeStyle = RED;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, top.y);
  ctx.lineTo(x, imageHeight);
  ctx.stroke();
  ctx.restore();
}

function drawHorizontalGuide(
  ctx: CanvasRenderingContext2D,
  left: Point,
  right: Point,
  lineWidth: number,
) {
  ctx.save();
  ctx.strokeStyle = BLUE;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
  ctx.restore();
}

function drawOverlayLabeledDot(
  ctx: CanvasRenderingContext2D,
  point: Point,
  label: string,
  radius: number,
) {
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
  ctx.strokeStyle = "rgba(15, 15, 15, 0.85)";
  ctx.lineWidth = Math.max(2, radius * 0.35);
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = `${Math.max(11, Math.floor(radius * 1.8))}px system-ui, sans-serif`;
  ctx.fillText(label, point.x + radius + 4, point.y - 4);
  ctx.restore();
}

function drawAllLabeledDots(
  ctx: CanvasRenderingContext2D,
  map: LandmarkMap,
  landmarkDefinitions: LandmarkDefinition[],
  jointRadius: number,
) {
  for (const landmark of landmarkDefinitions) {
    const point = map[landmark.id];
    if (!point) continue;
    const suffix = landmark.referenceOnly ? " (ref)" : "";
    drawOverlayLabeledDot(ctx, point, `${landmark.label}${suffix}`, jointRadius);
  }
}

/** Front-view calibration overlay: plumb lines, width guides, labeled dots. */
export function renderFrontViewOverlayLayers(
  ctx: CanvasRenderingContext2D,
  map: LandmarkMap,
  landmarkDefinitions: LandmarkDefinition[],
  imageWidth: number,
  imageHeight: number,
) {
  const { lineWidth, legLineWidth, jointRadius } = overlayScale(imageWidth);

  const leftKnee = requirePoint(map, "left_knee");
  const leftHoof = requirePoint(map, "left_front_hoof");
  const rightKnee = requirePoint(map, "right_knee");
  const rightHoof = requirePoint(map, "right_front_hoof");
  const poll = requirePoint(map, "poll");
  const muzzle = requirePoint(map, "muzzle");
  const leftShoulder = requirePoint(map, "left_shoulder");
  const rightShoulder = requirePoint(map, "right_shoulder");

  drawFrontLegPlumbLine(ctx, leftKnee.x, poll.y, leftHoof.y, legLineWidth);
  drawFrontLegPlumbLine(ctx, rightKnee.x, poll.y, rightHoof.y, legLineWidth);
  drawVerticalCenterline(
    ctx,
    poll,
    imageHeight,
    lineWidth,
    (poll.x + muzzle.x) / 2,
  );
  drawHorizontalGuide(ctx, leftShoulder, rightShoulder, lineWidth);
  drawHorizontalGuide(ctx, leftHoof, rightHoof, lineWidth);
  drawAllLabeledDots(ctx, map, landmarkDefinitions, jointRadius);
}

/** Hind-view calibration overlay: plumb lines, width guides, labeled dots. */
export function renderHindViewOverlayLayers(
  ctx: CanvasRenderingContext2D,
  map: LandmarkMap,
  landmarkDefinitions: LandmarkDefinition[],
  imageWidth: number,
  imageHeight: number,
) {
  const { lineWidth, legLineWidth, jointRadius } = overlayScale(imageWidth);

  const tailHead = requirePoint(map, "tail");
  const tailHeadY = tailHead.y;
  const leftHock = requirePoint(map, "left_hock");
  const leftHoof = requirePoint(map, "left_hind_hoof");
  const rightHock = requirePoint(map, "right_hock");
  const rightHoof = requirePoint(map, "right_hind_hoof");
  const leftHip = requirePoint(map, "left_point_of_hip");
  const rightHip = requirePoint(map, "right_point_of_hip");

  drawHindLegPlumbLine(ctx, leftHock.x, tailHeadY, leftHoof.y, legLineWidth);
  drawHindLegPlumbLine(ctx, rightHock.x, tailHeadY, rightHoof.y, legLineWidth);
  drawVerticalCenterline(ctx, tailHead, imageHeight, lineWidth);
  drawHorizontalGuide(ctx, leftHip, rightHip, lineWidth);
  drawHorizontalGuide(ctx, leftHock, rightHock, lineWidth);
  drawHorizontalGuide(ctx, leftHoof, rightHoof, lineWidth);
  drawAllLabeledDots(ctx, map, landmarkDefinitions, jointRadius);
}
