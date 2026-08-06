import { BATCHES } from "@/lib/scholarship/seed";
import type { BatchMode } from "@/lib/scholarship/types";

/**
 * Turn "which batches" intent into the flat list every matching check reads.
 *
 * BATCHES is in chronological order, so "onwards" is just a slice from that
 * batch to the end. Recomputing on every save means the stored list can never
 * disagree with the mode the user picked.
 */
export function resolveBatches(
  mode: BatchMode,
  from: string | undefined,
  list: string[],
): string[] {
  const all: string[] = [...BATCHES];
  if (mode === "all") return all;
  if (mode === "onwards") {
    const i = all.indexOf(from ?? "");
    return i === -1 ? all : all.slice(i);
  }
  return list;
}

/** The same rule as a sentence, for anyone reading rather than editing. */
export function batchRuleSentence(
  mode: BatchMode,
  from: string | undefined,
  list: string[],
): string {
  if (mode === "all") return "Any batch, including batches that start in future.";
  if (mode === "onwards")
    return `The ${from} batch and every batch that starts after it. Earlier batches are not eligible.`;
  if (list.length === 0) return "No batch chosen yet, so nobody is eligible.";
  if (list.length === 1) return `Only the ${list[0]} batch.`;
  return `Only these batches: ${list.join(", ")}.`;
}

/** Short version for table cells and chips. */
export function batchRuleLabel(mode: BatchMode, from: string | undefined, list: string[]): string {
  if (mode === "all") return "Any batch";
  if (mode === "onwards") return `${from} onwards`;
  if (list.length === 0) return "No batch";
  if (list.length === 1) return list[0]!;
  return `${list.length} batches`;
}

/**
 * Age from date of birth.
 *
 * Derived on every read rather than stored, because a stored age is wrong
 * within a year of being written and nobody notices until it matters.
 */
export function ageOf(dateOfBirth: string, today: Date = new Date()): number {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 0;
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
}

/** Two semesters make a year of study, so semester 5 is year 3. */
export function yearOfStudy(currentSemester: number): number {
  return Math.max(1, Math.ceil(currentSemester / 2));
}

const ORDINAL = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];

export function semesterLabel(currentSemester: number): string {
  return `${ORDINAL[currentSemester] ?? currentSemester} semester`;
}

export function yearLabel(currentSemester: number): string {
  const y = yearOfStudy(currentSemester);
  return `${ORDINAL[y] ?? y} year`;
}

/** Relative time for audit trails and submission dates. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days < 0) return "just now";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function pkr(n: number): string {
  if (n >= 10_000_000) return `PKR ${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `PKR ${(n / 100_000).toFixed(2)} L`;
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

/**
 * BNU's school names run to six or seven words, which turns every chart axis
 * and table column into a wall of text. These are the names people actually
 * say out loud.
 */
const SHORT_SCHOOL: Record<string, string> = {
  "Mariam Dawood School of Visual Arts & Design": "Visual Arts & Design",
  "Razia Hassan School of Architecture": "Architecture",
  "Seeta Majeed School of Liberal Arts & Social Sciences": "Liberal Arts",
  "School of Media and Mass Communication": "Media & Mass Comm.",
  "School of Computer & IT": "Computer & IT",
  "School of Education": "Education",
  "School of Management Sciences": "Management Sciences",
  "Institute of Psychology": "Psychology",
};

export function shortSchool(name: string): string {
  return SHORT_SCHOOL[name] ?? name;
}

export function coverageBand(pct: number): string {
  if (pct >= 100) return "100%";
  if (pct >= 75) return "75%";
  if (pct >= 50) return "50%";
  if (pct >= 35) return "35%";
  return "25%";
}

export function precedenceOf(scholarships: { id: string }[], scholarshipId: string): number {
  const i = scholarships.findIndex((s) => s.id === scholarshipId);
  return i === -1 ? scholarships.length + 1 : i + 1;
}

export function coverageSummary(
  coverage: { feeHead: string; benefitKind: string; value: number }[],
): string {
  if (coverage.length === 0) return "Nothing yet";
  return coverage
    .map((c) => {
      if (c.benefitKind === "Full waiver") return `Full waiver ${c.feeHead}`;
      if (c.benefitKind === "Fixed amount")
        return `PKR ${c.value.toLocaleString("en-PK")} ${c.feeHead}`;
      return `${c.value}% ${c.feeHead}`;
    })
    .join(" + ");
}
