export type CreditBalances = {
  single_view_balance: number;
  single_view_3d_balance: number;
  full_report_balance: number;
  full_report_3d_balance: number;
};

export const CREDIT_BALANCE_ROWS = [
  { key: "single_view_balance", label: "Single View" },
  { key: "single_view_3d_balance", label: "Single View + 3D" },
  { key: "full_report_balance", label: "Four-View" },
  { key: "full_report_3d_balance", label: "Four-View + 3D" },
] as const satisfies ReadonlyArray<{
  key: keyof CreditBalances;
  label: string;
}>;

export function hasAnyCredits(balances: CreditBalances): boolean {
  return CREDIT_BALANCE_ROWS.some((row) => balances[row.key] > 0);
}

export function getNonZeroCreditRows(balances: CreditBalances) {
  return CREDIT_BALANCE_ROWS.filter((row) => balances[row.key] > 0);
}
