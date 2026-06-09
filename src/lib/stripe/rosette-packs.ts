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
    price: 1500,
    priceDisplay: "$15.00",
    perReport: "$15.00 per report",
    stripePriceId: "price_1TgT6W8GXemQ32esIlNOq58o",
  },
  {
    id: "sv-3",
    name: "3 Single View Full Reports",
    reportType: "single_view",
    rosettes: 3,
    price: 0,
    priceDisplay: "3-pack",
    perReport: "3 reports",
    stripePriceId: "price_1TgT6W8GXemQ32esbLIWni35",
  },
  {
    id: "sv-5",
    name: "5 Single View Full Reports",
    reportType: "single_view",
    rosettes: 5,
    price: 0,
    priceDisplay: "5-pack",
    perReport: "5 reports",
    stripePriceId: "price_1TgT6X8GXemQ32eslRSVBKre",
  },
  {
    id: "sv3d-1",
    name: "Single View Full Report + 3D",
    reportType: "single_view",
    rosettes: 1,
    price: 2000,
    priceDisplay: "$20.00",
    perReport: "$20.00 per report",
    stripePriceId: "price_1TgT6Y8GXemQ32esnix8ekz8",
  },
  {
    id: "sv3d-3",
    name: "3 Single View Full Reports + 3D",
    reportType: "single_view",
    rosettes: 3,
    price: 0,
    priceDisplay: "3-pack",
    perReport: "3 reports",
    stripePriceId: "price_1TgT6Y8GXemQ32est3K9t4bo",
  },
  {
    id: "sv3d-5",
    name: "5 Single View Full Reports + 3D",
    reportType: "single_view",
    rosettes: 5,
    price: 0,
    priceDisplay: "5-pack",
    perReport: "5 reports",
    stripePriceId: "price_1TgT6Z8GXemQ32es1LMh10Ug",
  },
  {
    id: "fv-1",
    name: "Four-View Full Report",
    reportType: "full_report",
    rosettes: 1,
    price: 2500,
    priceDisplay: "$25.00",
    perReport: "$25.00 per report",
    stripePriceId: "price_1TgT6Z8GXemQ32esZsNcDoJk",
  },
  {
    id: "fv-3",
    name: "3 Four-View Full Reports",
    reportType: "full_report",
    rosettes: 3,
    price: 0,
    priceDisplay: "3-pack",
    perReport: "3 reports",
    stripePriceId: "price_1TgT6a8GXemQ32esm53NHDly",
  },
  {
    id: "fv-5",
    name: "5 Four-View Full Reports",
    reportType: "full_report",
    rosettes: 5,
    price: 0,
    priceDisplay: "5-pack",
    perReport: "5 reports",
    stripePriceId: "price_1TgT6a8GXemQ32estqs3Q1Ij",
  },
  {
    id: "fv3d-1",
    name: "Four-View Full Report + 3D",
    reportType: "full_report",
    rosettes: 1,
    price: 3000,
    priceDisplay: "$30.00",
    perReport: "$30.00 per report",
    stripePriceId: "price_1TgT6b8GXemQ32esQjdIPpLM",
  },
  {
    id: "fv3d-3",
    name: "3 Four-View Full Reports + 3D",
    reportType: "full_report",
    rosettes: 3,
    price: 0,
    priceDisplay: "3-pack",
    perReport: "3 reports",
    stripePriceId: "price_1TgT6c8GXemQ32esAOt4zXdm",
  },
  {
    id: "fv3d-5",
    name: "5 Four-View Full Reports + 3D",
    reportType: "full_report",
    rosettes: 5,
    price: 0,
    priceDisplay: "5-pack",
    perReport: "5 reports",
    stripePriceId: "price_1TgT6c8GXemQ32esFj0jG54M",
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
