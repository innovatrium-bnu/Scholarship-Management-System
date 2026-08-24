/**
 * Donor money: what is promised, what arrived, and what is left of it.
 *
 * The sixth pure module. `api/app/Domain/FundService.php` is the same
 * arithmetic in PHP, case for case, and the two test suites mirror each other —
 * change one, change the other, and change both suites. Laravel is
 * authoritative on every write; this copy exists because the Donors screen
 * filters by fund state and the totals must move with the filter, which is the
 * same reason `merge.ts` runs in the browser.
 *
 * ## Why the three states are computed rather than stored
 *
 * The requirement names three — Pledged (pending receipt), Received
 * (unassigned), Received (assigned) — and none of them is a column anywhere.
 *
 * They are not row states. One receipt can be part allocated, so a status
 * column on a donation could only ever describe the whole of it, and money that
 * is genuinely in two buckets would have to be recorded in one. They are
 * amounts, and an amount derived on read cannot drift from the rows underneath
 * it.
 *
 * The same call was made for screening verdicts: a verdict is recomputed on
 * every read so a changed threshold re-sorts the queue immediately, while a
 * decision — the thing a person did — is stored. Receiving money and allocating
 * it are the stored acts here. What they add up to is not.
 */
import type { Donation, Donor, DonorFunding, Pledge } from "./types";

/**
 * A rupee is 100 paisa, and floats do not land on exact hundredths.
 *
 * Balances are compared against this rather than against zero. Without it a
 * donation of 1,000,000 fully allocated across three awards can leave 1.16e-10
 * behind and be reported as still having money in it — a row telling a finance
 * officer to go and find a fraction of a paisa.
 */
export const TOLERANCE = 0.005;

/** Whether a balance is meaningfully greater than zero. */
export function isPositive(amount: number): boolean {
  return amount > TOLERANCE;
}

/** Instalment ids that a receipt has settled. */
function settledInstalmentIds(donations: readonly Donation[]): Set<string> {
  const settled = new Set<string>();
  for (const donation of donations) {
    if (donation.instalmentId !== undefined) settled.add(donation.instalmentId);
  }
  return settled;
}

/** Money received against a pledge that settles no particular instalment. */
function partPaymentsForPledge(pledgeId: string, donations: readonly Donation[]): number {
  let total = 0;
  for (const donation of donations) {
    if (donation.pledgeId === pledgeId && donation.instalmentId === undefined)
      total += donation.amount;
  }
  return total;
}

/**
 * What is still owed on each instalment, after part payments are credited.
 *
 * An instalment named by a receipt is settled outright — the write path only
 * allows that when the receipt covers it exactly, so there is no remainder to
 * carry. Everything else received against the pledge is a part payment: money
 * that has genuinely arrived and that no instalment claims.
 *
 * Those are credited against the unsettled instalments in the order the
 * schedule gives them, oldest first, because that is how a finance office
 * applies an unallocated payment and because it makes the overdue figure fall
 * before the future one does.
 */
function outstandingInstalments(
  pledge: Pledge,
  donations: readonly Donation[],
): { amount: number; dueOn: string }[] {
  const settled = settledInstalmentIds(donations);
  let credit = partPaymentsForPledge(pledge.id, donations);

  const outstanding: { amount: number; dueOn: string }[] = [];

  for (const instalment of pledge.instalments) {
    if (settled.has(instalment.id)) continue;

    let remaining = instalment.amount;

    if (credit > 0) {
      const applied = Math.min(credit, remaining);
      credit -= applied;
      remaining -= applied;
    }

    if (isPositive(remaining)) outstanding.push({ amount: remaining, dueOn: instalment.dueOn });
  }

  return outstanding;
}

/** What has arrived against one pledge. */
function receivedForPledge(pledgeId: string, donations: readonly Donation[]): number {
  let total = 0;
  for (const donation of donations) {
    if (donation.pledgeId === pledgeId) total += donation.amount;
  }
  return total;
}

/**
 * A cancelled pledge is not money anyone is waiting for, and a completed one
 * has fully arrived.
 */
function isOutstanding(pledge: Pledge): boolean {
  return pledge.status === "Active";
}

/** What this receipt has been spent on, releases excluded. */
export function assignedOf(donation: Donation): number {
  let total = 0;
  for (const allocation of donation.allocations) {
    if (allocation.status === "Active") total += allocation.amount;
  }
  return total;
}

/**
 * What is left of this receipt.
 *
 * Floored at zero rather than allowed to go negative. Over-allocation is
 * refused when it is written, so a negative here would mean the guard had
 * already failed — and it would then subtract from the total across every other
 * donation, hiding the fault instead of showing it.
 */
export function unassignedOf(donation: Donation): number {
  return Math.max(0, donation.amount - assignedOf(donation));
}

/**
 * What a donor has promised and not yet sent.
 *
 * Read from the schedule where there is one, because that carries the dates the
 * receivables report needs. A pledge with no schedule falls back to its total
 * minus what arrived against it — a safety net, not a second supported shape.
 */
export function receivable(pledges: readonly Pledge[], donations: readonly Donation[]): number {
  let total = 0;

  for (const pledge of pledges) {
    if (!isOutstanding(pledge)) continue;

    if (pledge.instalments.length === 0) {
      total += Math.max(0, pledge.totalAmount - receivedForPledge(pledge.id, donations));
      continue;
    }

    for (const remaining of outstandingInstalments(pledge, donations)) total += remaining.amount;
  }

  return total;
}

/**
 * The part of the receivable that is already late.
 *
 * Separate from `receivable` because they prompt different actions: one is a
 * forecast, the other is a phone call.
 */
export function overdue(
  pledges: readonly Pledge[],
  donations: readonly Donation[],
  asOf: string,
): number {
  let total = 0;

  for (const pledge of pledges) {
    if (!isOutstanding(pledge)) continue;

    for (const remaining of outstandingInstalments(pledge, donations)) {
      if (remaining.dueOn <= asOf) total += remaining.amount;
    }
  }

  return total;
}

/**
 * Cash that arrived, whatever has since happened to it.
 *
 * This is "actual cash on hand", and it must never be added to `receivable` to
 * make one headline number. One is money the university has; the other is money
 * it hopes to have.
 */
export function received(donations: readonly Donation[]): number {
  let total = 0;
  for (const donation of donations) total += donation.amount;
  return total;
}

/** Received money that has been put against an award. */
export function assigned(donations: readonly Donation[]): number {
  let total = 0;
  for (const donation of donations) total += assignedOf(donation);
  return total;
}

/**
 * Received money not yet put against an award.
 *
 * Summed per donation rather than as `received - assigned`. The two differ if
 * any single donation is over-allocated: subtracting would let one
 * over-allocated receipt eat headroom on another and report a plausible total,
 * while this floors each receipt at zero and leaves the discrepancy visible.
 */
export function unassigned(donations: readonly Donation[]): number {
  let total = 0;
  for (const donation of donations) total += unassignedOf(donation);
  return total;
}

/** Everything about one donor's money, in one pass. */
export function rollup(
  donor: Donor,
  pledges: readonly Pledge[],
  donations: readonly Donation[],
  asOf: string,
): DonorFunding {
  return {
    donorId: donor.id,
    receivable: receivable(pledges, donations),
    received: received(donations),
    assigned: assigned(donations),
    unassigned: unassigned(donations),
    overdue: overdue(pledges, donations, asOf),
  };
}

/**
 * The first day a pledge appears on the renewal report.
 *
 * `endsOn` minus `renewalNoticeDays`. Computed on the epoch rather than with a
 * date library so the PHP copy can be a literal transliteration; both sides do
 * the same integer arithmetic on days.
 */
export function noticeOpensOn(pledge: Pledge): string {
  const ends = Date.parse(`${pledge.endsOn}T00:00:00Z`);
  if (Number.isNaN(ends)) return pledge.endsOn;
  return new Date(ends - pledge.renewalNoticeDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Pledges close enough to their end date to need a conversation.
 *
 * The window is each pledge's own `renewalNoticeDays`, never a constant here —
 * a policy number belongs in data.
 *
 * A pledge already past its end date is included rather than dropped. It has
 * not been renewed and has not been marked Completed, which is exactly when
 * somebody needs to be told.
 */
export function renewalsDue(pledges: readonly Pledge[], asOf: string): Pledge[] {
  return pledges
    .filter((pledge) => isOutstanding(pledge) && noticeOpensOn(pledge) <= asOf)
    .slice()
    .sort((a, b) => a.endsOn.localeCompare(b.endsOn));
}
