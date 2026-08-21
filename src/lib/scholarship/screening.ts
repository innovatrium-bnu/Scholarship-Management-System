/**
 * The automatic first pass over need-based applications.
 *
 * The committee's problem is volume: a few hundred applications arrive, and a
 * large share of them fail a rule that needs no judgement at all — the CGPA is
 * below the floor for that intake, the declared income is over the ceiling,
 * half the documents are missing. Reading those by hand is wasted effort.
 *
 * `screen()` answers one question per criterion, in plain words, and says
 * whether the failure is the kind that can be decided without a person. What
 * it never does is change anything: it returns a verdict, and rejecting on
 * that verdict stays an explicit action someone takes in the UI. A student is
 * never turned down by a function running quietly in a `useMemo`.
 */
import { BATCHES } from "./batch-order";
import type {
  CgpaThreshold,
  CriterionId,
  EligibilityCriteria,
  NeedApplication,
  Student,
} from "./types";

export type CheckOutcome = "Pass" | "Fail" | "Not applicable";

export interface CriterionCheck {
  id: CriterionId;
  label: string;
  outcome: CheckOutcome;
  /** A whole sentence, written to be read by a student, not only by staff. */
  detail: string;
  /** Whether failing this one is enough to turn the application down on its own. */
  autoRejects: boolean;
}

export type ScreeningVerdict = "Meets criteria" | "Needs a closer look" | "Fails criteria";

export interface Screening {
  verdict: ScreeningVerdict;
  checks: CriterionCheck[];
  /** Failed criteria that reject on their own. */
  blockers: CriterionCheck[];
  /** Failed criteria that only warrant a human looking harder. */
  flags: CriterionCheck[];
  /** The sentence an automatic rejection would be recorded with. */
  rejectionReason: string;
}

export interface ScreeningContext {
  /** Tuition already covered by this student's active awards, as a percentage. */
  existingCoveragePct: number;
  /** Id of an earlier live application for the same scholarship and semester. */
  duplicateOf?: string;
}

/**
 * The minimum CGPA for a student of this intake.
 *
 * Each threshold covers its own batch and every batch after it, until a later
 * threshold takes over — so "2.50 from Fall 2023" and "2.65 from Fall 2024"
 * together mean Spring 2024 sits at 2.50 and everything from Fall 2024 on sits
 * at 2.65. Returns null when the intake predates every threshold, which means
 * no CGPA rule was ever written for them and none is invented here.
 */
export function minCgpaFor(
  batch: string,
  thresholds: CgpaThreshold[],
  batchOrder: readonly string[] = BATCHES,
): number | null {
  const studentAt = batchOrder.indexOf(batch);
  if (studentAt === -1) return null;

  let best: { at: number; minCgpa: number } | null = null;
  for (const t of thresholds) {
    const at = batchOrder.indexOf(t.fromBatch);
    if (at === -1 || at > studentAt) continue;
    if (!best || at > best.at) best = { at, minCgpa: t.minCgpa };
  }
  return best ? best.minCgpa : null;
}

/** Documents the criteria ask for that this application has not attached. */
export function missingDocuments(app: NeedApplication, required: string[]): string[] {
  const attached = new Set(app.documents.map((d) => d.kind));
  return required.filter((r) => !attached.has(r));
}

function sentenceList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function screen(
  app: NeedApplication,
  student: Student,
  criteria: EligibilityCriteria,
  ctx: ScreeningContext,
  batchOrder: readonly string[] = BATCHES,
): Screening {
  const auto = new Set(criteria.autoRejectOn);
  const checks: CriterionCheck[] = [];

  const add = (id: CriterionId, label: string, outcome: CheckOutcome, detail: string): void =>
    void checks.push({ id, label, outcome, detail, autoRejects: auto.has(id) });

  /* -- CGPA, by intake ---------------------------------------------------- */
  const minCgpa = minCgpaFor(student.batch, criteria.cgpaThresholds, batchOrder);
  if (minCgpa === null) {
    add(
      "cgpa",
      "Minimum CGPA",
      "Not applicable",
      `No CGPA rule has been set for the ${student.batch} intake, so this is not checked.`,
    );
  } else {
    const pass = student.cgpa >= minCgpa;
    add(
      "cgpa",
      "Minimum CGPA",
      pass ? "Pass" : "Fail",
      pass
        ? `CGPA ${student.cgpa.toFixed(2)} meets the ${minCgpa.toFixed(2)} required of the ${student.batch} intake.`
        : `CGPA ${student.cgpa.toFixed(2)} is below the ${minCgpa.toFixed(2)} required of the ${student.batch} intake.`,
    );
  }

  /* -- Household income --------------------------------------------------- */
  {
    const income = app.household.monthlyIncome;
    const pass = income <= criteria.maxMonthlyIncome;
    const fmt = (n: number) => `PKR ${n.toLocaleString("en-PK")}`;
    add(
      "income",
      "Household income",
      pass ? "Pass" : "Fail",
      pass
        ? `Declared household income of ${fmt(income)} a month is within the ${fmt(criteria.maxMonthlyIncome)} ceiling.`
        : `Declared household income of ${fmt(income)} a month is above the ${fmt(criteria.maxMonthlyIncome)} ceiling for need-based support.`,
    );
  }

  /* -- Enrolled credit hours ---------------------------------------------- */
  {
    const pass = student.creditHours >= criteria.minCreditHours;
    add(
      "creditHours",
      "Credit hours enrolled",
      pass ? "Pass" : "Fail",
      pass
        ? `Enrolled in ${student.creditHours} credit hours, at or above the ${criteria.minCreditHours} required.`
        : `Enrolled in only ${student.creditHours} credit hours; ${criteria.minCreditHours} are required to count as full-time.`,
    );
  }

  /* -- Attendance --------------------------------------------------------- */
  {
    const pass = student.attendancePct >= criteria.minAttendancePct;
    add(
      "attendance",
      "Attendance",
      pass ? "Pass" : "Fail",
      pass
        ? `Attendance of ${student.attendancePct}% meets the ${criteria.minAttendancePct}% required.`
        : `Attendance of ${student.attendancePct}% is below the ${criteria.minAttendancePct}% required.`,
    );
  }

  /* -- Supporting documents ----------------------------------------------- */
  {
    const missing = missingDocuments(app, criteria.requiredDocuments);
    add(
      "documents",
      "Supporting documents",
      missing.length === 0 ? "Pass" : "Fail",
      missing.length === 0
        ? `All ${criteria.requiredDocuments.length} required documents are attached.`
        : `Missing ${sentenceList(missing.map((m) => m.toLowerCase()))}.`,
    );
  }

  /* -- Fee already covered ------------------------------------------------ */
  {
    const covered = ctx.existingCoveragePct;
    const pass = covered <= criteria.maxExistingCoveragePct;
    add(
      "existingCoverage",
      "Fee already covered",
      pass ? "Pass" : "Fail",
      covered === 0
        ? "No other scholarship pays towards this student's tuition."
        : pass
          ? `Other scholarships already pay ${covered}% of tuition, within the ${criteria.maxExistingCoveragePct}% allowed.`
          : `Other scholarships already pay ${covered}% of tuition, above the ${criteria.maxExistingCoveragePct}% at which a further need award is questioned.`,
    );
  }

  /* -- Duplicate submission ----------------------------------------------- */
  {
    const dup = !!ctx.duplicateOf;
    add(
      "duplicate",
      "Duplicate application",
      dup ? "Fail" : "Pass",
      dup
        ? `This student already has a live application for the same scholarship in ${app.semester}.`
        : "This is the student's only live application for this scholarship.",
    );
  }

  const failed = checks.filter((c) => c.outcome === "Fail");
  const blockers = failed.filter((c) => c.autoRejects);
  const flags = failed.filter((c) => !c.autoRejects);

  const verdict: ScreeningVerdict =
    blockers.length > 0
      ? "Fails criteria"
      : flags.length > 0
        ? "Needs a closer look"
        : "Meets criteria";

  return {
    verdict,
    checks,
    blockers,
    flags,
    rejectionReason:
      blockers.length === 0
        ? ""
        : `Did not meet the eligibility criteria: ${sentenceList(
            blockers.map((b) => b.detail.replace(/\.$/, "")),
          )}.`,
  };
}
