import type {
  Award,
  FeeHead,
  MergedAward,
  MergedComponent,
  Scholarship,
  Student,
} from "./types";

const FEE_HEADS: FeeHead[] = ["Tuition", "Hostel", "Mess", "Other"];

export function feeOf(student: Student, head: FeeHead): number {
  switch (head) {
    case "Tuition":
      return student.tuitionFee;
    case "Hostel":
      return student.hostelFee;
    case "Mess":
      return student.messFee;
    case "Other":
      return student.otherFee;
  }
}

/**
 * Compute merge for a student's active awards.
 * Returns MergedAward[] enriched with applied values per fee head.
 */
export function computeMerge(
  student: Student,
  activeAwards: Award[],
  scholarships: Scholarship[],
): MergedAward[] {
  const scholarshipById = new Map(scholarships.map((s) => [s.id, s]));

  const merged: MergedAward[] = activeAwards
    .map((a) => {
      const s = scholarshipById.get(a.scholarshipId);
      if (!s) return null;
      return {
        award: a,
        scholarship: s,
        components: [] as MergedComponent[],
      };
    })
    .filter((x): x is MergedAward => x !== null);

  for (const head of FEE_HEADS) {
    // Gather entries touching this head.
    type Entry = {
      m: MergedAward;
      entPct: number;
      entPKR: number;
      kind: "Percentage" | "Full waiver" | "Fixed amount";
      isOverridden: boolean;
      overrideReason?: string;
      overrideAuthority?: string;
    };
    const entries: Entry[] = [];
    for (const m of merged) {
      const line = m.award.components.find((c) => c.feeHead === head);
      if (!line) continue;
      let entPct = 0;
      let entPKR = 0;
      if (line.entitlementKind === "Percentage") entPct = line.entitlementValue;
      else if (line.entitlementKind === "Full waiver") entPct = 100;
      else entPKR = line.entitlementValue;
      entries.push({
        m,
        entPct,
        entPKR,
        kind: line.entitlementKind,
        isOverridden: line.isOverridden,
        overrideReason: line.overrideReason,
        overrideAuthority: line.overrideAuthority,
      });
    }

    // Percentage headroom = 100% minus pinned percentages.
    const pinned = entries.filter((e) => e.isOverridden);
    const nonPinned = entries.filter((e) => !e.isOverridden);
    let pctHeadroom = 100;
    for (const p of pinned) pctHeadroom -= p.entPct;
    if (pctHeadroom < 0) pctHeadroom = 0;

    // Sort non-pinned by scholarship priority ascending (1 = highest).
    nonPinned.sort((a, b) => a.m.scholarship.priorityRank - b.m.scholarship.priorityRank);

    // Assign pinned first.
    for (const p of pinned) {
      p.m.components.push({
        feeHead: head,
        entitlementPct: p.entPct,
        entitlementPKR: p.entPKR,
        appliedPct: p.entPct,
        appliedPKR: p.entPKR,
        mergeStatus: "Full",
        isOverridden: true,
        overrideReason: p.overrideReason,
        overrideAuthority: p.overrideAuthority,
        kind: p.kind,
      });
    }

    for (const e of nonPinned) {
      if (e.kind === "Fixed amount") {
        // Fixed amounts don't contest the percentage ceiling; always granted.
        e.m.components.push({
          feeHead: head,
          entitlementPct: 0,
          entitlementPKR: e.entPKR,
          appliedPct: 0,
          appliedPKR: e.entPKR,
          mergeStatus: "Full",
          isOverridden: false,
          kind: e.kind,
        });
        continue;
      }
      const granted = Math.min(e.entPct, pctHeadroom);
      pctHeadroom -= granted;
      let status: MergedComponent["mergeStatus"] = "Full";
      if (granted === 0) status = "Suppressed";
      else if (granted < e.entPct) status = "Trimmed";
      e.m.components.push({
        feeHead: head,
        entitlementPct: e.entPct,
        entitlementPKR: 0,
        appliedPct: granted,
        appliedPKR: 0,
        mergeStatus: status,
        isOverridden: false,
        kind: e.kind,
      });
    }
  }

  return merged;
}

export function ceilingBreach(
  student: Student,
  existingAwards: Award[],
  candidate: { scholarship: Scholarship },
  scholarships: Scholarship[],
): { breachedHeads: { head: FeeHead; total: number }[] } {
  const breached: { head: FeeHead; total: number }[] = [];
  // Simulate raw entitlement totals per fee head across existing active awards + candidate.
  const totals = new Map<FeeHead, number>();
  const bump = (h: FeeHead, pct: number) => totals.set(h, (totals.get(h) ?? 0) + pct);
  for (const a of existingAwards) {
    for (const c of a.components) {
      if (c.entitlementKind === "Percentage") bump(c.feeHead, c.entitlementValue);
      else if (c.entitlementKind === "Full waiver") bump(c.feeHead, 100);
    }
  }
  for (const line of candidate.scholarship.coverage) {
    if (line.benefitKind === "Percentage") bump(line.feeHead, line.value);
    else if (line.benefitKind === "Full waiver") bump(line.feeHead, 100);
  }
  for (const [head, total] of totals) {
    if (total > 100) breached.push({ head, total });
  }
  return { breachedHeads: breached };
}

export function waiverValuePKR(student: Student, merged: MergedAward[]): number {
  let total = 0;
  for (const m of merged) {
    for (const c of m.components) {
      const base = feeOf(student, c.feeHead);
      total += (c.appliedPct / 100) * base + c.appliedPKR;
    }
  }
  return total;
}