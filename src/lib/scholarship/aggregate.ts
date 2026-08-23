/**
 * Institution-wide counts, as pure functions.
 *
 * These were `useMemo` blocks inside the dashboard route, which meant nothing
 * could test them and two of them were quietly wrong:
 *
 *  - "Taken back this year" counted awards by `effectiveFrom`, the date the
 *    award *started*, so it reported awards that began this year and happened
 *    to be revoked — at any time, including years later.
 *  - "Scholars over time" resolved a year to a batch with
 *    `BATCHES.find(b => b.endsWith(year))`, which returns only the first match.
 *    With both "Spring 2025" and "Fall 2025" on the list it silently dropped
 *    the entire Fall cohort — the largest in the data.
 *
 * Both are the sort of error nobody notices, because a plausible number is
 * indistinguishable from a correct one at a glance. Moving them here makes
 * them testable, and makes them reusable by the reporting layer so a report
 * and the dashboard cannot disagree.
 */
import { eventsOfKind, type DomainEvent } from "./events";
import { computeMerge, waiverValuePKR } from "./merge";
import type { Award, Scholarship, Student } from "./types";

/** Registration numbers holding at least one active award. */
export function scholarRegNos(awards: readonly Award[]): Set<string> {
  return new Set(awards.filter((a) => a.status === "Active").map((a) => a.studentRegNo));
}

/**
 * Total fee relief in PKR across a set of students, after the merge engine has
 * applied precedence and the 100% ceiling.
 */
export function totalWaiverPKR(
  regNos: Iterable<string>,
  students: readonly Student[],
  awards: readonly Award[],
  scholarships: readonly Scholarship[],
): number {
  const byReg = new Map(students.map((s) => [s.regNo, s]));
  let total = 0;
  for (const reg of regNos) {
    const student = byReg.get(reg);
    if (!student) continue;
    const active = awards.filter((a) => a.studentRegNo === reg && a.status === "Active");
    total += waiverValuePKR(student, computeMerge(student, active, [...scholarships]));
  }
  return total;
}

/**
 * Awards revoked within a date range, counted from the revocation record
 * rather than from when the award began.
 *
 * Reads the event log rather than `Award.revocation`, because an award can end
 * without surviving as a row: `undoBatch` deletes its awards outright. Undone
 * batches are excluded — those students never really held the scholarship, so
 * counting them as losses would overstate every figure.
 */
export function awardsRevokedBetween(
  events: readonly DomainEvent[],
  from: string,
  to: string,
): Extract<DomainEvent, { kind: "award.revoked" }>[] {
  const undone = new Set(eventsOfKind(events, "award.undone").map((e) => e.awardId));
  return eventsOfKind(events, "award.revoked").filter(
    (e) => !undone.has(e.awardId) && e.effectiveFrom >= from && e.effectiveFrom <= to,
  );
}

/** Awards granted within a date range, on the same terms. */
export function awardsGrantedBetween(
  events: readonly DomainEvent[],
  from: string,
  to: string,
): Extract<DomainEvent, { kind: "award.granted" }>[] {
  const undone = new Set(eventsOfKind(events, "award.undone").map((e) => e.awardId));
  return eventsOfKind(events, "award.granted").filter(
    (e) => !undone.has(e.awardId) && e.effectiveFrom >= from && e.effectiveFrom <= to,
  );
}

/**
 * Everyone ever granted this scholarship, whether or not they still hold it.
 *
 * From the event log rather than from the awards list, because the awards a
 * screen has in memory are the *active* ones — a revoked award is not in that
 * list at all. The scholarship page claimed "N in total, including past
 * awards" while counting only current holders, so an archived scholarship
 * whose awards had all ended reported zero recipients when it had twenty-four.
 *
 * Undone batches are excluded on the same terms as everywhere else here: those
 * students never really held it, so counting them would overstate the history
 * of a mis-click.
 */
export function everHeldRegNos(events: readonly DomainEvent[], scholarshipId: string): Set<string> {
  const undone = new Set(eventsOfKind(events, "award.undone").map((e) => e.awardId));

  return new Set(
    eventsOfKind(events, "award.granted")
      .filter((e) => e.scholarshipId === scholarshipId && !undone.has(e.awardId))
      .map((e) => e.studentRegNo),
  );
}

/** Grants and revocations per term, for the dashboard's movement chart. */
export function grantedAndRevokedBySemester(
  events: readonly DomainEvent[],
  semesters: readonly string[],
): { semester: string; gained: number; lost: number }[] {
  const undone = new Set(eventsOfKind(events, "award.undone").map((e) => e.awardId));
  const granted = eventsOfKind(events, "award.granted").filter((e) => !undone.has(e.awardId));
  const revoked = eventsOfKind(events, "award.revoked").filter((e) => !undone.has(e.awardId));

  return semesters.map((semester) => ({
    semester,
    gained: granted.filter((e) => e.semester === semester).length,
    lost: revoked.filter((e) => e.semester === semester).length,
  }));
}

/**
 * Scholarship holders by intake year.
 *
 * A year covers *every* batch ending in it. The Spring and Fall intakes of the
 * same year are two separate cohorts, and counting only the first one found is
 * how the old version lost half its students.
 */
export function scholarsByIntakeYear(
  awards: readonly Award[],
  students: readonly Student[],
  batches: readonly string[],
  years: readonly string[],
): { year: string; scholars: number }[] {
  const holders = scholarRegNos(awards);
  const byReg = new Map(students.map((s) => [s.regNo, s]));

  return years.map((year) => {
    const inYear = new Set(batches.filter((b) => b.endsWith(year)));
    let count = 0;
    for (const reg of holders) {
      const student = byReg.get(reg);
      if (student && inYear.has(student.batch)) count += 1;
    }
    return { year, scholars: count };
  });
}
