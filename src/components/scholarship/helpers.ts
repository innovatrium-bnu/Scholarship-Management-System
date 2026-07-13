export function pkr(n: number): string {
  if (n >= 10_000_000) return `PKR ${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `PKR ${(n / 100_000).toFixed(2)} L`;
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

export function coverageBand(pct: number): string {
  if (pct >= 100) return "100%";
  if (pct >= 75) return "75%";
  if (pct >= 50) return "50%";
  if (pct >= 35) return "35%";
  return "25%";
}

export function coverageSummary(
  coverage: { feeHead: string; benefitKind: string; value: number }[],
): string {
  if (coverage.length === 0) return "—";
  return coverage
    .map((c) => {
      if (c.benefitKind === "Full waiver") return `Full waiver ${c.feeHead}`;
      if (c.benefitKind === "Fixed amount")
        return `PKR ${c.value.toLocaleString("en-PK")} ${c.feeHead}`;
      return `${c.value}% ${c.feeHead}`;
    })
    .join(" + ");
}