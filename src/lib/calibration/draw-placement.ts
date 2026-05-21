import type { Point } from "@/lib/calibration/landmarks";

export function drawPlacementPreview(
  ctx: CanvasRenderingContext2D,
  point: Point,
  label: string,
) {
  ctx.save();
  ctx.fillStyle = "rgba(34, 197, 94, 0.35)";
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(label, point.x + 10, point.y - 10);
  ctx.restore();
}
