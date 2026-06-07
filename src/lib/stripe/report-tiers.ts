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
  savingsLabel?: string;
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
        stripePriceId: "price_1Te0Ud6SA5I9u4voauwQN15m",
        label: "1 Report",
      },
      {
        packId: "sv-3",
        reportCount: 3,
        stripePriceId: "price_1Te0VY6SA5I9u4voomqK0K79",
        label: "3 Reports",
        savingsLabel: "Save with a 3-pack",
      },
      {
        packId: "sv-5",
        reportCount: 5,
        stripePriceId: "price_1Te0VC6SA5I9u4vozrpsA9k9",
        label: "5 Reports",
        savingsLabel: "Save with a 5-pack",
      },
    ],
  },
  {
    id: "single-view-3d",
    title: "Single View Full Report + 3D",
    singlePriceDisplay: "$18",
    description:
      "One side profile photo, AI conformation analysis plus interactive 3D model",
    reportType: "single_view",
    packages: [
      {
        packId: "sv3d-1",
        reportCount: 1,
        stripePriceId: "price_1Tfko06SA5I9u4voN5wAjmyL",
        label: "1 Report",
      },
      {
        packId: "sv3d-3",
        reportCount: 3,
        stripePriceId: "price_1Tfl9m6SA5I9u4vova2WOBwA",
        label: "3 Reports",
        savingsLabel: "Save with a 3-pack",
      },
      {
        packId: "sv3d-5",
        reportCount: 5,
        stripePriceId: "price_1TflAL6SA5I9u4vogzOdxkCE",
        label: "5 Reports",
        savingsLabel: "Save with a 5-pack",
      },
    ],
  },
  {
    id: "four-view",
    title: "Four-View Full Report",
    singlePriceDisplay: "$20",
    description:
      "Four photos, complete conformation analysis with scores, overlays, and detailed report",
    reportType: "full_report",
    packages: [
      {
        packId: "fv-1",
        reportCount: 1,
        stripePriceId: "price_1TflJp6SA5I9u4voV2oFs2vV",
        label: "1 Report",
      },
      {
        packId: "fv-3",
        reportCount: 3,
        stripePriceId: "price_1Te0XH6SA5I9u4vo2QdMUMt5",
        label: "3 Reports",
        savingsLabel: "Save with a 3-pack",
      },
      {
        packId: "fv-5",
        reportCount: 5,
        stripePriceId: "price_1Te0Wz6SA5I9u4vodJfb7npV",
        label: "5 Reports",
        savingsLabel: "Save with a 5-pack",
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
        stripePriceId: "price_1Tfkoa6SA5I9u4votsxJVd3S",
        label: "1 Report",
      },
      {
        packId: "fv3d-3",
        reportCount: 3,
        stripePriceId: "price_1Te0Wj6SA5I9u4vou6vVxgF9",
        label: "3 Reports",
        savingsLabel: "Save with a 3-pack",
      },
      {
        packId: "fv3d-5",
        reportCount: 5,
        stripePriceId: "price_1TflB16SA5I9u4voSUfusvYf",
        label: "5 Reports",
        savingsLabel: "Save with a 5-pack",
      },
    ],
  },
];
