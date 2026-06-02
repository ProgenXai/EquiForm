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

export const SINGLE_VIEW_PACKS: RosettePack[] = [
  {
    id: "single-1",
    name: "1 Single View Report",
    reportType: "single_view",
    rosettes: 1,
    price: 500,
    priceDisplay: "$5.00",
    perReport: "$5.00 per report",
    stripePriceId: "price_1Te0Ud6SA5I9u4voauwQN15m",
  },
  {
    id: "single-5",
    name: "5 Single View Reports",
    reportType: "single_view",
    rosettes: 5,
    price: 2200,
    priceDisplay: "$22.00",
    perReport: "$4.40 per report",
    stripePriceId: "price_1Te0VC6SA5I9u4vozrpsA9k9",
  },
  {
    id: "single-10",
    name: "10 Single View Reports",
    reportType: "single_view",
    rosettes: 10,
    price: 4000,
    priceDisplay: "$40.00",
    perReport: "$4.00 per report",
    stripePriceId: "price_1Te0VY6SA5I9u4voomqK0K79",
  },
];

export const FULL_REPORT_PACKS: RosettePack[] = [
  {
    id: "full-1",
    name: "1 Full Report",
    reportType: "full_report",
    rosettes: 1,
    price: 3000,
    priceDisplay: "$30.00",
    perReport: "$30.00 per report",
    stripePriceId: "price_1Te0Wj6SA5I9u4vou6vVxgF9",
  },
  {
    id: "full-3",
    name: "3 Full Reports",
    reportType: "full_report",
    rosettes: 3,
    price: 7900,
    priceDisplay: "$79.00",
    perReport: "$26.33 per report",
    stripePriceId: "price_1Te0Wz6SA5I9u4vodJfb7npV",
  },
  {
    id: "full-10",
    name: "10 Full Reports",
    reportType: "full_report",
    rosettes: 10,
    price: 25000,
    priceDisplay: "$250.00",
    perReport: "$25.00 per report",
    stripePriceId: "price_1Te0XH6SA5I9u4vo2QdMUMt5",
  },
];

/** @deprecated Buy page still uses combined list; prefer SINGLE_VIEW_PACKS / FULL_REPORT_PACKS */
export const ROSETTE_PACKS: RosettePack[] = [
  ...SINGLE_VIEW_PACKS,
  ...FULL_REPORT_PACKS,
];

export function findRosettePack(packId: string): RosettePack | undefined {
  return ROSETTE_PACKS.find((pack) => pack.id === packId);
}
