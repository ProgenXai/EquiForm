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
    stripePriceId: "price_1Te0Ud6SA5I9u4voauwQN15m",
  },
  {
    id: "sv-3",
    name: "3 Single View Full Reports",
    reportType: "single_view",
    rosettes: 3,
    price: 0,
    priceDisplay: "3-pack",
    perReport: "3 reports",
    stripePriceId: "price_1Te0VY6SA5I9u4voomqK0K79",
  },
  {
    id: "sv-5",
    name: "5 Single View Full Reports",
    reportType: "single_view",
    rosettes: 5,
    price: 0,
    priceDisplay: "5-pack",
    perReport: "5 reports",
    stripePriceId: "price_1Tg5YP6SA5I9u4vo8y5rw8Zj",
  },
  {
    id: "sv3d-1",
    name: "Single View Full Report + 3D",
    reportType: "single_view",
    rosettes: 1,
    price: 2000,
    priceDisplay: "$20.00",
    perReport: "$20.00 per report",
    stripePriceId: "price_1Tfko06SA5I9u4voN5wAjmyL",
  },
  {
    id: "sv3d-3",
    name: "3 Single View Full Reports + 3D",
    reportType: "single_view",
    rosettes: 3,
    price: 0,
    priceDisplay: "3-pack",
    perReport: "3 reports",
    stripePriceId: "price_1Tfl9m6SA5I9u4vova2WOBwA",
  },
  {
    id: "sv3d-5",
    name: "5 Single View Full Reports + 3D",
    reportType: "single_view",
    rosettes: 5,
    price: 0,
    priceDisplay: "5-pack",
    perReport: "5 reports",
    stripePriceId: "price_1TflAL6SA5I9u4vogzOdxkCE",
  },
  {
    id: "fv-1",
    name: "Four-View Full Report",
    reportType: "full_report",
    rosettes: 1,
    price: 2500,
    priceDisplay: "$25.00",
    perReport: "$25.00 per report",
    stripePriceId: "price_1TflJp6SA5I9u4voV2oFs2vV",
  },
  {
    id: "fv-3",
    name: "3 Four-View Full Reports",
    reportType: "full_report",
    rosettes: 3,
    price: 0,
    priceDisplay: "3-pack",
    perReport: "3 reports",
    stripePriceId: "price_1Tg5Tp6SA5I9u4vofHjsvjpG",
  },
  {
    id: "fv-5",
    name: "5 Four-View Full Reports",
    reportType: "full_report",
    rosettes: 5,
    price: 0,
    priceDisplay: "5-pack",
    perReport: "5 reports",
    stripePriceId: "price_1Te0Wz6SA5I9u4vodJfb7npV",
  },
  {
    id: "fv3d-1",
    name: "Four-View Full Report + 3D",
    reportType: "full_report",
    rosettes: 1,
    price: 3000,
    priceDisplay: "$30.00",
    perReport: "$30.00 per report",
    stripePriceId: "price_1Tfkoa6SA5I9u4votsxJVd3S",
  },
  {
    id: "fv3d-3",
    name: "3 Four-View Full Reports + 3D",
    reportType: "full_report",
    rosettes: 3,
    price: 0,
    priceDisplay: "3-pack",
    perReport: "3 reports",
    stripePriceId: "price_1Te0Wj6SA5I9u4vou6vVxgF9",
  },
  {
    id: "fv3d-5",
    name: "5 Four-View Full Reports + 3D",
    reportType: "full_report",
    rosettes: 5,
    price: 0,
    priceDisplay: "5-pack",
    perReport: "5 reports",
    stripePriceId: "price_1TflB16SA5I9u4voSUfusvYf",
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
