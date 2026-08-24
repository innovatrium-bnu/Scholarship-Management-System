/**
 * Turning donor rows into the three piles the Donors screen shows.
 *
 * This is presentation, not arithmetic, and that distinction is why it has no
 * PHP counterpart while `funds.ts` does. Every **amount** here comes from
 * `funds.ts`, which is transliterated and mirrored case for case; what this file
 * adds is which table row an amount belongs on and what to label it. A second
 * copy of that in PHP would be a second copy of a table layout.
 *
 * The three piles are the ones the requirement names — Pledged, Received
 * (unassigned), Received (assigned) — and they are amounts rather than row
 * states, because one receipt can be part allocated. So a single donation can
 * produce two lines, and the line is the unit the screen filters and totals.
 */
import { isPositive, unassignedOf } from "./funds";
import type { Donation, Donor, Pledge } from "./types";

/** The filter the screen offers, plus the "everything" position. */
export type FundBucket = "All" | "Pledged" | "Received (unassigned)" | "Received (assigned)";

export const FUND_BUCKETS: readonly FundBucket[] = [
  "All",
  "Pledged",
  "Received (unassigned)",
  "Received (assigned)",
];

export interface FundLine {
  /** Stable within a render: the instalment, donation or allocation id. */
  id: string;
  bucket: Exclude<FundBucket, "All">;
  donorId: string;
  donorName: string;
  amount: number;
  /** Pledged: when it falls due. Received: when it arrived or was assigned. */
  dateOn: string;
  /** Pledged only, and only once the due date has passed. */
  overdue?: boolean;
  /** Received (assigned) only. */
  awardId?: string;
  allocationId?: string;
  /** Received (unassigned) only — what is left to assign. */
  donationId?: string;
  reference?: string;
  method?: string;
}

/**
 * Every line, in one pass over the three collections.
 *
 * A cancelled or completed pledge contributes no pledged lines: cancelled money
 * is not owed, and completed means it all arrived, so an outstanding instalment
 * on one would be a contradiction the screen should not present as a fact.
 */
export function fundLines(
  donors: readonly Donor[],
  pledges: readonly Pledge[],
  donations: readonly Donation[],
  asOf: string,
): FundLine[] {
  const nameOf = new Map(donors.map((donor) => [donor.id, donor.name]));
  const settled = new Set(
    donations
      .map((donation) => donation.instalmentId)
      .filter((id): id is string => id !== undefined),
  );

  const lines: FundLine[] = [];

  for (const pledge of pledges) {
    if (pledge.status !== "Active") continue;

    for (const instalment of pledge.instalments) {
      if (settled.has(instalment.id)) continue;

      lines.push({
        id: instalment.id,
        bucket: "Pledged",
        donorId: pledge.donorId,
        donorName: nameOf.get(pledge.donorId) ?? "Unknown donor",
        amount: instalment.amount,
        dateOn: instalment.dueOn,
        overdue: instalment.dueOn <= asOf,
        reference: pledge.reference,
      });
    }
  }

  for (const donation of donations) {
    const donorName = nameOf.get(donation.donorId) ?? "Unknown donor";

    for (const allocation of donation.allocations) {
      if (allocation.status !== "Active") continue;

      lines.push({
        id: allocation.id,
        bucket: "Received (assigned)",
        donorId: donation.donorId,
        donorName,
        amount: allocation.amount,
        dateOn: allocation.allocatedOn,
        awardId: allocation.awardId,
        allocationId: allocation.id,
      });
    }

    const left = unassignedOf(donation);

    // Only a receipt with something left produces an unassigned line. A fully
    // assigned one is not a row saying "nothing here"; it is simply not in
    // this pile.
    //
    // `isPositive`, not `left > 0`. A receipt of 333,333.33 spent across four
    // awards leaves 5.8e-11 of float residue, which `> 0` reads as money: the
    // pile gained a row reading "PKR 0" with a live Assign button behind it,
    // and pressing it was a dead end because the server refuses anything below
    // a paisa. That residue is exactly what TOLERANCE was defined for.
    if (isPositive(left)) {
      lines.push({
        id: `${donation.id}-unassigned`,
        bucket: "Received (unassigned)",
        donorId: donation.donorId,
        donorName,
        amount: left,
        dateOn: donation.receivedOn,
        donationId: donation.id,
        reference: donation.reference,
        method: donation.method,
      });
    }
  }

  return lines;
}

/** The lines in one pile, or all of them. */
export function inBucket(lines: readonly FundLine[], bucket: FundBucket): FundLine[] {
  return bucket === "All" ? [...lines] : lines.filter((line) => line.bucket === bucket);
}

/**
 * The total of a field the amounts already came from.
 *
 * A sum of values `funds.ts` computed, not a re-derivation of them — which is
 * the line this file stays on the right side of.
 */
export function sumLines(lines: readonly FundLine[]): number {
  return lines.reduce((total, line) => total + line.amount, 0);
}

/** "in 34 days", "12 days ago", "today". */
export function renewalPhrase(endsOn: string, asOf: string): string {
  const days = Math.round(
    (Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000,
  );

  if (days === 0) return "today";
  if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;

  return `${-days} day${days === -1 ? "" : "s"} ago`;
}
