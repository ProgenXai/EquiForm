import { NextResponse } from "next/server";

import { sendAdminAlert } from "@/lib/email/admin-alerts";
import { REPORT_TIERS } from "@/lib/stripe/report-tiers";
import { ROSETTE_PACKS, findRosettePack } from "@/lib/stripe/rosette-packs";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportTypeKey =
  | "single_view"
  | "single_view_3d"
  | "four_view"
  | "four_view_3d";

type ReportCounts = Record<ReportTypeKey, number>;

type RevenueByType = Record<ReportTypeKey, number>;

const REPORT_TYPE_LABELS: Record<ReportTypeKey, string> = {
  single_view: "Single view",
  single_view_3d: "Single view + 3D",
  four_view: "Four view",
  four_view_3d: "Four view + 3D",
};

function emptyReportCounts(): ReportCounts {
  return {
    single_view: 0,
    single_view_3d: 0,
    four_view: 0,
    four_view_3d: 0,
  };
}

function emptyRevenueByType(): RevenueByType {
  return {
    single_view: 0,
    single_view_3d: 0,
    four_view: 0,
    four_view_3d: 0,
  };
}

function parseDollarDisplay(display: string): number {
  const match = display.match(/\$([\d,]+(?:\.\d{2})?)/);
  if (!match) {
    return 0;
  }

  return Math.round(parseFloat(match[1]!.replace(/,/g, "")) * 100);
}

function getProductTypeFromPackId(packId: string): ReportTypeKey {
  const normalized = packId.toLowerCase();

  if (normalized.includes("full_report_3d") || normalized.startsWith("fv3d")) {
    return "four_view_3d";
  }

  if (normalized.includes("full_report") || normalized.startsWith("fv")) {
    return normalized.includes("3d") ? "four_view_3d" : "four_view";
  }

  if (normalized.includes("single_view_3d") || normalized.startsWith("sv3d")) {
    return "single_view_3d";
  }

  return normalized.includes("3d") ? "single_view_3d" : "single_view";
}

function getPackRevenueCents(packId: string): number {
  const pack = findRosettePack(packId);
  if (!pack) {
    return 0;
  }

  if (pack.price > 0) {
    return pack.price;
  }

  for (const tier of REPORT_TIERS) {
    const pkg = tier.packages.find((option) => option.packId === packId);
    if (pkg?.priceDisplay) {
      return parseDollarDisplay(pkg.priceDisplay);
    }
  }

  for (const tier of REPORT_TIERS) {
    if (tier.packages.some((option) => option.packId === packId)) {
      return parseDollarDisplay(tier.singlePriceDisplay) * pack.rosettes;
    }
  }

  return 0;
}

function resolvePackId(description: string): string | null {
  const trimmed = description.trim();
  if (!trimmed) {
    return null;
  }

  const byId = findRosettePack(trimmed);
  if (byId) {
    return byId.id;
  }

  const byName = ROSETTE_PACKS.find((pack) => pack.name === trimmed);
  if (byName) {
    return byName.id;
  }

  return trimmed;
}

function classifyReport(report: {
  report_text: string | null;
  glb_url: string | null;
}): ReportTypeKey {
  const has3d = Boolean(report.glb_url?.trim());
  let isFourView = false;

  if (report.report_text) {
    try {
      let parsed: unknown = JSON.parse(report.report_text);
      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }

      if (typeof parsed === "object" && parsed !== null) {
        isFourView = (parsed as { type?: string }).type === "full";
      }
    } catch {
      // Ignore malformed report_text for classification.
    }
  }

  if (isFourView && has3d) {
    return "four_view_3d";
  }

  if (isFourView) {
    return "four_view";
  }

  if (has3d) {
    return "single_view_3d";
  }

  return "single_view";
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatReportBreakdown(counts: ReportCounts): string {
  return (Object.keys(REPORT_TYPE_LABELS) as ReportTypeKey[])
    .map((key) => `- ${REPORT_TYPE_LABELS[key]}: ${counts[key]}`)
    .join("\n");
}

function formatRevenueBreakdown(revenue: RevenueByType): string {
  return (Object.keys(REPORT_TYPE_LABELS) as ReportTypeKey[])
    .map((key) => `- ${REPORT_TYPE_LABELS[key]}: ${formatCurrency(revenue[key])}`)
    .join("\n");
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const serviceClient = createServiceRoleClient();

  const reportCounts = emptyReportCounts();
  const revenueByType = emptyRevenueByType();

  const { data: reports, error: reportsError } = await serviceClient
    .from("reports")
    .select("report_text, glb_url")
    .gte("created_at", since);

  if (reportsError) {
    console.error("[daily-digest] failed to query reports:", reportsError);
    return NextResponse.json({ error: reportsError.message }, { status: 500 });
  }

  for (const report of reports ?? []) {
    const type = classifyReport(report);
    reportCounts[type] += 1;
  }

  const totalReports = Object.values(reportCounts).reduce(
    (sum, count) => sum + count,
    0,
  );

  const { data: purchases, error: purchasesError } = await serviceClient
    .from("token_transactions")
    .select("description")
    .eq("type", "purchase")
    .gte("created_at", since);

  if (purchasesError) {
    console.error("[daily-digest] failed to query purchases:", purchasesError);
    return NextResponse.json({ error: purchasesError.message }, { status: 500 });
  }

  let totalRevenueCents = 0;

  for (const purchase of purchases ?? []) {
    const description =
      typeof purchase.description === "string" ? purchase.description : "";
    const packId = resolvePackId(description);

    if (!packId) {
      continue;
    }

    const revenueCents = getPackRevenueCents(packId);
    const productType = getProductTypeFromPackId(packId);
    revenueByType[productType] += revenueCents;
    totalRevenueCents += revenueCents;
  }

  const { count: shareCount, error: sharesError } = await serviceClient
    .from("share_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  if (sharesError) {
    console.error("[daily-digest] failed to query share events:", sharesError);
    return NextResponse.json({ error: sharesError.message }, { status: 500 });
  }

  const periodLabel = `${since} to ${new Date().toISOString()} (UTC)`;
  const digestDate = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const body = [
    `EquiForm Daily Digest — ${digestDate}`,
    "",
    `Reporting period: ${periodLabel}`,
    "",
    "Reports (last 24 hours)",
    `Total reports run: ${totalReports}`,
    formatReportBreakdown(reportCounts),
    "",
    "Credit purchase revenue (last 24 hours)",
    `Total revenue: ${formatCurrency(totalRevenueCents)}`,
    formatRevenueBreakdown(revenueByType),
    "",
    "Social shares (last 24 hours)",
    `Total shares: ${shareCount ?? 0}`,
  ].join("\n");

  await sendAdminAlert(`Daily Digest — ${digestDate}`, body);

  return NextResponse.json({
    ok: true,
    periodStart: since,
    totalReports,
    reportCounts,
    totalRevenueCents,
    revenueByType,
    shareCount: shareCount ?? 0,
  });
}
