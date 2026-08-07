/**
 * Who in a batch is paid how much, before any of it is saved.
 *
 * A scholarship carries one set of terms — "50% of tuition" — and for most
 * awards that is exactly right. Need-based awards are the exception, and they
 * are the reason this module exists. The committee reads twenty applications
 * out of the same scholarship and grants 75% to one family, 25% to the next,
 * and hostel on top for the two students who moved cities for their programme.
 * Before this, a batch could only pay one rate, so that afternoon's decisions
 * had to be entered as one award per rate and then corrected student by student
 * afterwards — the same decision recorded twice, with a chance to forget the
 * second half.
 *
 * A `RatePlan` is the whole of that afternoon's decision held in one value:
 * what the batch pays by default, and every student who was decided differently.
 * Nothing here reads or writes the store — it turns a plan into the coverage one
 * student is awarded, and `assign` hands that to `computeMerge` like any other
 * coverage. The 100% ceiling still applies; a rate set here is a claim, not a
 * guarantee.
 */
import type { CoverageLine, FeeHead, Scholarship } from "./types";

/**
 * The rates the committee actually awards at.
 *
 * Five values rather than a free number box, because these are the ones that
 * appear in the minutes. Anything else is an exception and belongs on the
 * student's own record with a written reason, not buried in a batch of forty.
 */
export const AWARD_RATES = [25, 35, 50, 75, 100] as const;

/**
 * An explicit decision that a fee is not paid.
 *
 * Distinct from having no entry at all: no entry means "whatever the level
 * above decided", while this means a person looked and said no. That
 * distinction is what lets one student be dropped from hostel while the rest of
 * the batch keeps it.
 */
export const NOT_PAID = 0;

export interface RatePlan {
  /** One rate per fee head, for everyone in the batch. Absent means "standard". */
  batch: Record<FeeHead, number>;
  /** Exceptions, keyed by registration number then fee head. */
  perStudent: Record<string, Record<FeeHead, number>>;
}

export const EMPTY_RATE_PLAN: RatePlan = { batch: {}, perStudent: {} };

/**
 * What the scholarship itself pays on a fee head, as a percentage.
 *
 * `null` covers two different situations that behave the same way here: the
 * scholarship says nothing about this fee, or it pays a fixed sum in rupees.
 * Neither is a percentage, so neither has a standard rate to fall back to.
 */
export function standardPctOf(scholarship: Scholarship, head: FeeHead): number | null {
  const line = scholarship.coverage.find((c) => c.feeHead === head);
  if (!line || line.benefitKind === "Fixed amount") return null;
  return line.benefitKind === "Full waiver" ? 100 : line.value;
}

/** True when the scholarship pays this head as a fixed sum, which no rate can express. */
function fixedHeads(scholarship: Scholarship): Set<FeeHead> {
  return new Set(
    scholarship.coverage.filter((c) => c.benefitKind === "Fixed amount").map((c) => c.feeHead),
  );
}

/**
 * The fee heads a batch may set a rate on, in the order they should be shown.
 *
 * Everything the scholarship covers comes first, then every other fee the
 * institution charges. The second group is not padding: a scholarship that
 * covers only tuition is still the right vehicle for a committee that has
 * decided to pay one student's hostel as well, and an award may carry
 * components its scholarship never mentioned — that is exactly what the
 * by-hand editor on a student's record already does.
 *
 * Fixed-amount heads are left out entirely. They are a sum in rupees, not a
 * share of a fee, and are passed through untouched.
 */
export function rateHeads(scholarship: Scholarship, feeHeads: readonly FeeHead[]): FeeHead[] {
  const fixed = fixedHeads(scholarship);
  const out: FeeHead[] = [];
  const seen = new Set<FeeHead>();
  for (const c of scholarship.coverage) {
    if (fixed.has(c.feeHead) || seen.has(c.feeHead)) continue;
    seen.add(c.feeHead);
    out.push(c.feeHead);
  }
  for (const h of feeHeads) {
    if (fixed.has(h) || seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
}

/** The rate everyone in the batch is paid on a head, unless they were decided individually. */
export function batchPct(scholarship: Scholarship, plan: RatePlan, head: FeeHead): number {
  const set = plan.batch[head];
  if (set != null) return set;
  return standardPctOf(scholarship, head) ?? NOT_PAID;
}

/** The rate one student is paid on one head, after both levels of the plan. */
export function studentPct(
  scholarship: Scholarship,
  plan: RatePlan,
  head: FeeHead,
  regNo: string,
): number {
  const own = plan.perStudent[regNo]?.[head];
  if (own != null) return own;
  return batchPct(scholarship, plan, head);
}

/** The rate set on this head for the whole batch, or null if it follows the scholarship. */
export function batchRate(plan: RatePlan, head: FeeHead): number | null {
  return plan.batch[head] ?? null;
}

/** The rate set on this head for this student alone, or null if they follow the batch. */
export function studentRate(plan: RatePlan, regNo: string, head: FeeHead): number | null {
  return plan.perStudent[regNo]?.[head] ?? null;
}

export function hasOwnRates(plan: RatePlan, regNo: string): boolean {
  const own = plan.perStudent[regNo];
  return !!own && Object.keys(own).length > 0;
}

/** Which of these students were decided individually. Others are not counted. */
export function studentsWithOwnRates(plan: RatePlan, regNos: Iterable<string>): string[] {
  return [...regNos].filter((r) => hasOwnRates(plan, r));
}

/** True when any head has been moved off the scholarship's own rate for the batch. */
export function hasCustomBatchRates(
  scholarship: Scholarship,
  feeHeads: readonly FeeHead[],
  plan: RatePlan,
): boolean {
  return rateHeads(scholarship, feeHeads).some((h) => {
    const set = batchRate(plan, h);
    return set != null && set !== (standardPctOf(scholarship, h) ?? NOT_PAID);
  });
}

/* ------------------------------------------------------------- editing -- */

/** Pass `null` to drop back to the scholarship's own rate. */
export function setBatchRate(plan: RatePlan, head: FeeHead, pct: number | null): RatePlan {
  const batch = { ...plan.batch };
  if (pct == null) delete batch[head];
  else batch[head] = pct;
  return { ...plan, batch };
}

/** Pass `null` to drop this student back to the batch rate. */
export function setStudentRate(
  plan: RatePlan,
  regNo: string,
  head: FeeHead,
  pct: number | null,
): RatePlan {
  const own = { ...(plan.perStudent[regNo] ?? {}) };
  if (pct == null) delete own[head];
  else own[head] = pct;
  const perStudent = { ...plan.perStudent };
  /* An empty record and no record must not both exist, or "has this student
     been decided individually" gets two different answers. */
  if (Object.keys(own).length === 0) delete perStudent[regNo];
  else perStudent[regNo] = own;
  return { ...plan, perStudent };
}

export function clearStudentRates(plan: RatePlan, regNo: string): RatePlan {
  if (!plan.perStudent[regNo]) return plan;
  const perStudent = { ...plan.perStudent };
  delete perStudent[regNo];
  return { ...plan, perStudent };
}

export function clearAllStudentRates(plan: RatePlan): RatePlan {
  return { ...plan, perStudent: {} };
}

/* ------------------------------------------------------------ resolving -- */

/**
 * The coverage one student is actually awarded.
 *
 * The output is an ordinary `CoverageLine[]`, deliberately: everything
 * downstream — the award components, `computeMerge`, the ceiling arithmetic —
 * already speaks that language, so a hand-set rate travels the same path as a
 * standard one and cannot be handled differently by accident.
 *
 * A head resolving to zero is dropped rather than emitted as a 0% line, so an
 * award never carries a component that pays nothing.
 */
export function resolveCoverage(
  scholarship: Scholarship,
  feeHeads: readonly FeeHead[],
  plan: RatePlan,
  regNo: string,
): CoverageLine[] {
  const fixed = fixedHeads(scholarship);
  const out: CoverageLine[] = [];
  const done = new Set<FeeHead>();

  for (const line of scholarship.coverage) {
    if (line.benefitKind === "Fixed amount") {
      out.push(line);
      done.add(line.feeHead);
      continue;
    }
    if (fixed.has(line.feeHead) || done.has(line.feeHead)) continue;
    done.add(line.feeHead);
    const pct = studentPct(scholarship, plan, line.feeHead, regNo);
    if (pct <= 0) continue;
    /* Left untouched when it lands on the scholarship's own rate, so a
       "Full waiver" line stays a full waiver rather than being rewritten as
       100% and reading like someone typed it. */
    out.push(
      pct === standardPctOf(scholarship, line.feeHead)
        ? line
        : { ...line, benefitKind: "Percentage", value: pct },
    );
  }

  for (const head of feeHeads) {
    if (fixed.has(head) || done.has(head)) continue;
    const pct = studentPct(scholarship, plan, head, regNo);
    if (pct <= 0) continue;
    out.push({ id: `rate-${head}`, feeHead: head, benefitKind: "Percentage", value: pct });
  }

  return out;
}

/** What a resolved coverage list pays on one fee head, as a percentage. */
export function pctOfHead(coverage: readonly CoverageLine[], head: FeeHead): number {
  let total = 0;
  for (const c of coverage) {
    if (c.feeHead !== head) continue;
    if (c.benefitKind === "Full waiver") total += 100;
    else if (c.benefitKind === "Percentage") total += c.value;
  }
  return total;
}

/**
 * The plan as one English clause, for the reason on the batch.
 *
 * This is a summary and nothing counts it. Every rate it mentions is already a
 * number on an award component, which is where a report reads it from — the
 * sentence exists so the person who opens the audit log in two years can see at
 * a glance that this batch was not paid at the standard rate.
 */
export function describeRatePlan(
  scholarship: Scholarship,
  feeHeads: readonly FeeHead[],
  plan: RatePlan,
  regNos: Iterable<string>,
): string {
  const parts: string[] = [];
  for (const head of rateHeads(scholarship, feeHeads)) {
    const set = batchRate(plan, head);
    const standard = standardPctOf(scholarship, head) ?? NOT_PAID;
    if (set == null || set === standard) continue;
    parts.push(set === NOT_PAID ? `no ${head.toLowerCase()}` : `${set}% of ${head.toLowerCase()}`);
  }

  const clauses: string[] = [];
  if (parts.length > 0) clauses.push(`awarded at ${joinWords(parts)} by decision`);

  const individual = studentsWithOwnRates(plan, regNos).length;
  if (individual > 0) {
    clauses.push(`${individual} student${individual === 1 ? "" : "s"} set individually`);
  }

  return clauses.join(" · ");
}

function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
