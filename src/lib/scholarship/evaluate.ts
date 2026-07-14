import type { Award, Scholarship, Student } from "./types";

export type EvalStatus = "Eligible" | "PendingVerification" | "NotEligible" | "AlreadyHolds";

export interface EvalResult {
  student: Student;
  status: EvalStatus;
  reasons: string[];
  rank?: number;
  percentile?: number;
}

function passesAutomatic(rule: { field?: string; operator?: string; threshold?: string | number; description?: string }, s: Student): { pass: boolean; label: string } {
  const label = rule.description || `${rule.field ?? ""} ${rule.operator ?? ""} ${rule.threshold ?? ""}`.trim();
  if (rule.field === "cgpa" && typeof rule.threshold === "number") {
    const t = rule.threshold;
    if (rule.operator === ">=") return { pass: s.cgpa >= t, label: `CGPA ${s.cgpa.toFixed(2)} is below the required ${t}` };
    if (rule.operator === ">") return { pass: s.cgpa > t, label: `CGPA ${s.cgpa.toFixed(2)} must exceed ${t}` };
  }
  // Fall back to description heuristics
  const d = (rule.description ?? "").toLowerCase();
  if (d.includes("cgpa")) {
    const m = d.match(/([0-9]+(?:\.[0-9]+)?)/);
    const t = m ? Number(m[1]) : 3.0;
    return { pass: s.cgpa >= t, label: `CGPA ${s.cgpa.toFixed(2)} is below the required ${t}` };
  }
  return { pass: true, label };
}

function manualLabel(desc: string): { field: keyof Student; label: string } | null {
  const d = desc.toLowerCase();
  if (d.includes("financial") || d.includes("need")) return { field: "financialNeedVerified", label: "Financial need verification" };
  if (d.includes("personal statement")) return { field: "personalStatementOk", label: "Personal statement review" };
  if (d.includes("sport")) return { field: "hasSportsMedal", label: "Sports medal verification" };
  if (d.includes("bfit") || d.includes("b.fit")) return { field: "bfitMember", label: "B.Fit membership" };
  return null;
}

export function evaluate(
  scholarship: Scholarship,
  students: Student[],
  existingAwards: Award[],
  rankingPopulation: Student[] = students,
): EvalResult[] {
  const held = new Set(
    existingAwards
      .filter((a) => a.scholarshipId === scholarship.id && a.status === "Active")
      .map((a) => a.studentRegNo),
  );

  // Scope filters
  const inScope = (s: Student) => {
    if (scholarship.studyLevel !== "Both" && scholarship.studyLevel !== s.studyLevel) return `Study level (requires ${scholarship.studyLevel})`;
    if (scholarship.schools.length > 0 && !scholarship.schools.includes(s.school)) return `School not eligible (requires one of ${scholarship.schools.join(", ")})`;
    if (scholarship.programmes.length > 0 && !scholarship.programmes.includes(s.programme)) return `Programme not eligible (requires one of ${scholarship.programmes.join(", ")})`;
    if (scholarship.batches.length > 0 && !scholarship.batches.includes(s.batch)) return `Batch not eligible`;
    return null;
  };

  // Cohort rank rule — ranked against the FULL cohort that passes scope, not just
  // whichever subset of students is being targeted for this assignment run. This
  // matters when targeting a single student: they must be ranked against their
  // whole cohort, not a population of one.
  const cohortRule = scholarship.awardRules.find((r) => r.kind === "Cohort rank");
  let rankMap = new Map<string, { rank: number; percentile: number }>();
  if (cohortRule) {
    const eligibleForRanking = rankingPopulation.filter((s) => !inScope(s));
    const sorted = [...eligibleForRanking].sort((a, b) => b.cgpa - a.cgpa);
    sorted.forEach((s, i) => {
      const percentile = sorted.length > 0 ? ((i + 1) / sorted.length) * 100 : 100;
      rankMap.set(s.regNo, { rank: i + 1, percentile: Math.round(percentile * 10) / 10 });
    });
  }

  return students.map<EvalResult>((s) => {
    if (held.has(s.regNo)) return { student: s, status: "AlreadyHolds", reasons: ["Already holds this scholarship"] };
    const scopeFail = inScope(s);
    const reasons: string[] = [];
    let notEligible = false;
    let pending = false;

    if (scopeFail) {
      notEligible = true;
      reasons.push(scopeFail);
    }

    for (const r of scholarship.awardRules) {
      if (r.kind === "Automatic") {
        const res = passesAutomatic(r, s);
        if (!res.pass) {
          notEligible = true;
          reasons.push(res.label);
        }
      } else if (r.kind === "Manual") {
        const ml = manualLabel(r.description ?? "");
        if (ml) {
          const val = s[ml.field] as unknown as boolean;
          if (!val) {
            pending = true;
            reasons.push(`${ml.label} required`);
          }
        } else {
          pending = true;
          reasons.push(r.description ?? "Manual verification required");
        }
      } else if (r.kind === "Cohort rank") {
        const info = rankMap.get(s.regNo);
        const pct = r.percentile ?? 100;
        if (!info) {
          notEligible = true;
          reasons.push("Outside targeted cohort");
        } else if (info.percentile > pct) {
          notEligible = true;
          reasons.push(`Rank ${info.rank} (${info.percentile.toFixed(1)}%) is outside top ${pct}%`);
        }
      }
    }

    const info = rankMap.get(s.regNo);
    if (notEligible) return { student: s, status: "NotEligible", reasons, rank: info?.rank, percentile: info?.percentile };
    if (pending) return { student: s, status: "PendingVerification", reasons, rank: info?.rank, percentile: info?.percentile };
    return { student: s, status: "Eligible", reasons: [], rank: info?.rank, percentile: info?.percentile };
  });
}