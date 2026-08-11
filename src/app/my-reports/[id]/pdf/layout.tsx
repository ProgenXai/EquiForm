import type { Viewport } from "next";

/**
 * Root layout locks maximumScale: 1 (no pinch-zoom). Re-enable scaling on the
 * PDF viewer so users can pinch to shrink/enlarge the report on mobile.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function ReportPdfViewerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
