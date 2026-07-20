export type ReportPackType = "single_view" | "full_report";

export type RosettePack = {
  id: string;
  name: string;
  reportType: ReportPackType;
  rosettes: number;
  price: number;
  priceDisplay: string;
  perReport: string;
  stripePriceId: string;
};

export const ROSETTE_PACKS: RosettePack[] = [
  {
    id: "sv-1",
    name: "Single View Full Report",
    reportType: "single_view",
    rosettes: 1,
    price: 1000,
    priceDisplay: "$10.00",
    perReport: "$10.00 per report",
    stripePriceId: "price_1TvM6V6SA5I9u4vonneizoQQ",
  },
  {
    id: "sv-3",
    name: "3 Single View Full Reports",
    reportType: "single_view",
    rosettes: 3,
    price: 2700,
    priceDisplay: "$27.00",
    perReport: "$9.00 per report",
    stripePriceId: "price_1TvMYN6SA5I9u4voq3sZyrIs",
  },
  {
    id: "sv-5",
    name: "5 Single View Full Reports",
    reportType: "single_view",
    rosettes: 5,
    price: 4200,
    priceDisplay: "$42.00",
    perReport: "$8.40 per report",
    stripePriceId: "price_1TvMZz6SA5I9u4vom2PtIZRu",
  },
  {
    id: "sv3d-1",
    name: "Single View Full Report + 3D",
    reportType: "single_view",
    rosettes: 1,
    price: 1400,
    priceDisplay: "$14.00",
    perReport: "$14.00 per report",
    stripePriceId: "price_1TvMmn6SA5I9u4vo2PARZAfZ",
  },
  {
    id: "sv3d-3",
    name: "3 Single View Full Reports + 3D",
    reportType: "single_view",
    rosettes: 3,
    price: 3800,
    priceDisplay: "$38.00",
    perReport: "$12.67 per report",
    stripePriceId: "price_1TvMow6SA5I9u4volmaR4a41",
  },
  {
    id: "sv3d-5",
    name: "5 Single View Full Reports + 3D",
    reportType: "single_view",
    rosettes: 5,
    price: 6000,
    priceDisplay: "$60.00",
    perReport: "$12.00 per report",
    stripePriceId: "price_1TvMt86SA5I9u4vopvfFfSIs",
  },
  {
    id: "fv-1",
    name: "Four-View Full Report",
    reportType: "full_report",
    rosettes: 1,
    price: 1800,
    priceDisplay: "$18.00",
    perReport: "$18.00 per report",
    stripePriceId: "price_1TvMbi6SA5I9u4voGJDn4bvS",
  },
  {
    id: "fv-3",
    name: "3 Four-View Full Reports",
    reportType: "full_report",
    rosettes: 3,
    price: 4900,
    priceDisplay: "$49.00",
    perReport: "$16.33 per report",
    stripePriceId: "price_1TvMcl6SA5I9u4voKiHgSIpa",
  },
  {
    id: "fv-5",
    name: "5 Four-View Full Reports",
    reportType: "full_report",
    rosettes: 5,
    price: 8000,
    priceDisplay: "$80.00",
    perReport: "$16.00 per report",
    stripePriceId: "price_1TvMg16SA5I9u4vo0ZRj6V0N",
  },
  {
    id: "fv3d-1",
    name: "Four-View Full Report + 3D",
    reportType: "full_report",
    rosettes: 1,
    price: 2400,
    priceDisplay: "$24.00",
    perReport: "$24.00 per report",
    stripePriceId: "price_1TvMhQ6SA5I9u4vofl7bySja",
  },
  {
    id: "fv3d-3",
    name: "3 Four-View Full Reports + 3D",
    reportType: "full_report",
    rosettes: 3,
    price: 6500,
    priceDisplay: "$65.00",
    perReport: "$21.67 per report",
    stripePriceId: "price_1TvMjL6SA5I9u4voS3QAyxGg",
  },
  {
    id: "fv3d-5",
    name: "5 Four-View Full Reports + 3D",
    reportType: "full_report",
    rosettes: 5,
    price: 10500,
    priceDisplay: "$105.00",
    perReport: "$21.00 per report",
    stripePriceId: "price_1TvMks6SA5I9u4voTaEsI8Ls",
  },
];

/** @deprecated Use ROSETTE_PACKS */
export const SINGLE_VIEW_PACKS = ROSETTE_PACKS.filter(
  (pack) => pack.reportType === "single_view",
);

/** @deprecated Use ROSETTE_PACKS */
export const FULL_REPORT_PACKS = ROSETTE_PACKS.filter(
  (pack) => pack.reportType === "full_report",
);

export function findRosettePack(packId: string): RosettePack | undefined {
  return ROSETTE_PACKS.find((pack) => pack.id === packId);
}

export function findRosettePackByPriceId(
  stripePriceId: string,
): RosettePack | undefined {
  return ROSETTE_PACKS.find((pack) => pack.stripePriceId === stripePriceId);
}
