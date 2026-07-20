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
    singlePriceDisplay: "$10",
    description:
      "One side profile photo, AI conformation analysis with scores and overlay",
    reportType: "single_view",
    packages: [
      {
        packId: "sv-1",
        reportCount: 1,
        stripePriceId: "price_1TvM6V6SA5I9u4vonneizoQQ",
        label: "1 Report",
      },
      {
        packId: "sv-3",
        reportCount: 3,
        stripePriceId: "price_1TvMYN6SA5I9u4voq3sZyrIs",
        label: "3 Reports",
        priceDisplay: "$27",
        savingsDisplay: "$3",
      },
      {
        packId: "sv-5",
        reportCount: 5,
        stripePriceId: "price_1TvMZz6SA5I9u4vom2PtIZRu",
        label: "5 Reports",
        priceDisplay: "$42",
        savingsDisplay: "$8",
      },
    ],
  },
  {
    id: "single-view-3d",
    title: "Single View Full Report + 3D",
    singlePriceDisplay: "$14",
    description:
      "One side profile photo, AI conformation analysis plus interactive 3D model",
    reportType: "single_view",
    packages: [
      {
        packId: "sv3d-1",
        reportCount: 1,
        stripePriceId: "price_1TvMmn6SA5I9u4vo2PARZAfZ",
        label: "1 Report",
      },
      {
        packId: "sv3d-3",
        reportCount: 3,
        stripePriceId: "price_1TvMow6SA5I9u4volmaR4a41",
        label: "3 Reports",
        priceDisplay: "$38",
        savingsDisplay: "$4",
      },
      {
        packId: "sv3d-5",
        reportCount: 5,
        stripePriceId: "price_1TvMt86SA5I9u4vopvfFfSIs",
        label: "5 Reports",
        priceDisplay: "$60",
        savingsDisplay: "$10",
      },
    ],
  },
  {
    id: "four-view",
    title: "Four-View Full Report",
    singlePriceDisplay: "$18",
    description:
      "Four photos, complete conformation analysis with scores, overlays, and detailed report",
    reportType: "full_report",
    packages: [
      {
        packId: "fv-1",
        reportCount: 1,
        stripePriceId: "price_1TvMbi6SA5I9u4voGJDn4bvS",
        label: "1 Report",
      },
      {
        packId: "fv-3",
        reportCount: 3,
        stripePriceId: "price_1TvMcl6SA5I9u4voKiHgSIpa",
        label: "3 Reports",
        priceDisplay: "$49",
        savingsDisplay: "$5",
      },
      {
        packId: "fv-5",
        reportCount: 5,
        stripePriceId: "price_1TvMg16SA5I9u4vo0ZRj6V0N",
        label: "5 Reports",
        priceDisplay: "$80",
        savingsDisplay: "$10",
      },
    ],
  },
  {
    id: "four-view-3d",
    title: "Four-View Full Report + 3D",
    singlePriceDisplay: "$24",
    description:
      "Four photos, complete analysis plus interactive 3D model you can rotate and explore",
    reportType: "full_report",
    highlighted: true,
    packages: [
      {
        packId: "fv3d-1",
        reportCount: 1,
        stripePriceId: "price_1TvMhQ6SA5I9u4vofl7bySja",
        label: "1 Report",
      },
      {
        packId: "fv3d-3",
        reportCount: 3,
        stripePriceId: "price_1TvMjL6SA5I9u4voS3QAyxGg",
        label: "3 Reports",
        priceDisplay: "$65",
        savingsDisplay: "$7",
      },
      {
        packId: "fv3d-5",
        reportCount: 5,
        stripePriceId: "price_1TvMks6SA5I9u4voTaEsI8Ls",
        label: "5 Reports",
        priceDisplay: "$105",
        savingsDisplay: "$15",
      },
    ],
  },
];
