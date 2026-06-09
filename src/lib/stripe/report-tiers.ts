import type { ReportPackType } from "@/lib/stripe/rosette-packs";

export type ReportTierId =
  | "single-view"
  | "single-view-3d"
  | "four-view"
  | "four-view-3d";

export type ReportPackageOption = {
  packId: string;
  reportCount: 1 | 3 | 5;
  stripePriceId: string;
  label: string;
  priceDisplay?: string;
  savingsDisplay?: string;
};

export type ReportTier = {
  id: ReportTierId;
  title: string;
  description: string;
  singlePriceDisplay: string;
  reportType: ReportPackType;
  highlighted?: boolean;
  packages: ReportPackageOption[];
};

export const REPORT_TIERS: ReportTier[] = [
  {
    id: "single-view",
    title: "Single View Full Report",
    singlePriceDisplay: "$15",
    description:
      "One side profile photo, AI conformation analysis with scores and overlay",
    reportType: "single_view",
    packages: [
      {
        packId: "sv-1",
        reportCount: 1,
        stripePriceId: "price_1TgT6W8GXemQ32esIlNOq58o",
        label: "1 Report",
      },
      {
        packId: "sv-3",
        reportCount: 3,
        stripePriceId: "price_1TgT6W8GXemQ32esbLIWni35",
        label: "3 Reports",
        priceDisplay: "$38",
        savingsDisplay: "$7",
      },
      {
        packId: "sv-5",
        reportCount: 5,
        stripePriceId: "price_1TgT6X8GXemQ32eslRSVBKre",
        label: "5 Reports",
        priceDisplay: "$60",
        savingsDisplay: "$15",
      },
    ],
  },
  {
    id: "single-view-3d",
    title: "Single View Full Report + 3D",
    singlePriceDisplay: "$20",
    description:
      "One side profile photo, AI conformation analysis plus interactive 3D model",
    reportType: "single_view",
    packages: [
      {
        packId: "sv3d-1",
        reportCount: 1,
        stripePriceId: "price_1TgT6Y8GXemQ32esnix8ekz8",
        label: "1 Report",
      },
      {
        packId: "sv3d-3",
        reportCount: 3,
        stripePriceId: "price_1TgT6Y8GXemQ32est3K9t4bo",
        label: "3 Reports",
        priceDisplay: "$50",
        savingsDisplay: "$10",
      },
      {
        packId: "sv3d-5",
        reportCount: 5,
        stripePriceId: "price_1TgT6Z8GXemQ32es1LMh10Ug",
        label: "5 Reports",
        priceDisplay: "$80",
        savingsDisplay: "$20",
      },
    ],
  },
  {
    id: "four-view",
    title: "Four-View Full Report",
    singlePriceDisplay: "$25",
    description:
      "Four photos, complete conformation analysis with scores, overlays, and detailed report",
    reportType: "full_report",
    packages: [
      {
        packId: "fv-1",
        reportCount: 1,
        stripePriceId: "price_1TgT6Z8GXemQ32esZsNcDoJk",
        label: "1 Report",
      },
      {
        packId: "fv-3",
        reportCount: 3,
        stripePriceId: "price_1TgT6a8GXemQ32esm53NHDly",
        label: "3 Reports",
        priceDisplay: "$63",
        savingsDisplay: "$12",
      },
      {
        packId: "fv-5",
        reportCount: 5,
        stripePriceId: "price_1TgT6a8GXemQ32estqs3Q1Ij",
        label: "5 Reports",
        priceDisplay: "$100",
        savingsDisplay: "$25",
      },
    ],
  },
  {
    id: "four-view-3d",
    title: "Four-View Full Report + 3D",
    singlePriceDisplay: "$30",
    description:
      "Four photos, complete analysis plus interactive 3D model you can rotate and explore",
    reportType: "full_report",
    highlighted: true,
    packages: [
      {
        packId: "fv3d-1",
        reportCount: 1,
        stripePriceId: "price_1TgT6b8GXemQ32esQjdIPpLM",
        label: "1 Report",
      },
      {
        packId: "fv3d-3",
        reportCount: 3,
        stripePriceId: "price_1TgT6c8GXemQ32esAOt4zXdm",
        label: "3 Reports",
        priceDisplay: "$75",
        savingsDisplay: "$15",
      },
      {
        packId: "fv3d-5",
        reportCount: 5,
        stripePriceId: "price_1TgT6c8GXemQ32esFj0jG54M",
        label: "5 Reports",
        priceDisplay: "$120",
        savingsDisplay: "$30",
      },
    ],
  },
];
