import { describe, expect, it } from "vitest";
import { ceilingBreach, computeMerge, feeOf, waiverValuePKR } from "./merge";
import {
  makeAward,
  makeComponent,
  makeCoverage,
  makeScholarship,
  makeStudent,
} from "./test-factories";
import type { MergedAward } from "./types";

/** Pull one scholarship's merged line for a fee head, so assertions stay legible. */
function line(merged: MergedAward[], scholarshipId: string, feeHead = "Tuition") {
  const m = merged.find((x) => x.scholarship.id === scholarshipId);
  return m?.components.find((c) => c.feeHead === feeHead);
}

describe("feeOf", () => {
  const student = makeStudent({
    tuitionFee: 400000,
    hostelFee: 80000,
    messFee: 40000,
    otherFee: 20000,
  });

  it("maps each core fee head to its field", () => {
    expect(feeOf(student, "Tuition")).toBe(400000);
    expect(feeOf(student, "Hostel")).toBe(80000);
    expect(feeOf(student, "Mess")).toBe(40000);
    expect(feeOf(student, "Other")).toBe(20000);
  });

  it("falls back to otherFee for a custom fee head", () => {
    expect(feeOf(student, "Transport")).toBe(20000);
  });
});

describe("computeMerge", () => {
  const student = makeStudent();

  it("grants a single award its full entitlement", () => {
    const sch = makeScholarship({ id: "sch-a" });
    const award = makeAward({
      id: "aw-1",
      scholarshipId: "sch-a",
      components: [makeComponent("Tuition", "Percentage", 50)],
    });

    const merged = computeMerge(student, [award], [sch]);

    expect(line(merged, "sch-a")).toMatchObject({
      appliedPct: 50,
      entitlementPct: 50,
      mergeStatus: "Full",
    });
  });

  it("grants both awards in full when they fit under 100%", () => {
    const a = makeScholarship({ id: "sch-a" });
    const b = makeScholarship({ id: "sch-b" });
    const awards = [
      makeAward({
        id: "aw-1",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Percentage", 60)],
      }),
      makeAward({
        id: "aw-2",
        scholarshipId: "sch-b",
        components: [makeComponent("Tuition", "Percentage", 40)],
      }),
    ];

    const merged = computeMerge(student, awards, [a, b]);

    expect(line(merged, "sch-a")?.mergeStatus).toBe("Full");
    expect(line(merged, "sch-b")?.mergeStatus).toBe("Full");
    expect(line(merged, "sch-b")?.appliedPct).toBe(40);
  });

  it("trims the lower-precedence award when the total exceeds 100%", () => {
    const a = makeScholarship({ id: "sch-a" });
    const b = makeScholarship({ id: "sch-b" });
    const awards = [
      makeAward({
        id: "aw-1",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Percentage", 60)],
      }),
      makeAward({
        id: "aw-2",
        scholarshipId: "sch-b",
        components: [makeComponent("Tuition", "Percentage", 60)],
      }),
    ];

    const merged = computeMerge(student, awards, [a, b]);

    expect(line(merged, "sch-a")).toMatchObject({ appliedPct: 60, mergeStatus: "Full" });
    expect(line(merged, "sch-b")).toMatchObject({
      appliedPct: 40,
      entitlementPct: 60,
      mergeStatus: "Trimmed",
    });
  });

  it("uses array order in `scholarships` as precedence, not award order", () => {
    const a = makeScholarship({ id: "sch-a" });
    const b = makeScholarship({ id: "sch-b" });
    const awards = [
      makeAward({
        id: "aw-1",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Percentage", 60)],
      }),
      makeAward({
        id: "aw-2",
        scholarshipId: "sch-b",
        components: [makeComponent("Tuition", "Percentage", 60)],
      }),
    ];

    // Same awards, reversed precedence list — the trim must move to sch-a.
    const merged = computeMerge(student, awards, [b, a]);

    expect(line(merged, "sch-b")).toMatchObject({ appliedPct: 60, mergeStatus: "Full" });
    expect(line(merged, "sch-a")).toMatchObject({ appliedPct: 40, mergeStatus: "Trimmed" });
  });

  it("suppresses an award once headroom is exhausted", () => {
    const a = makeScholarship({ id: "sch-a" });
    const b = makeScholarship({ id: "sch-b" });
    const c = makeScholarship({ id: "sch-c" });
    const awards = [
      makeAward({
        id: "aw-1",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Percentage", 60)],
      }),
      makeAward({
        id: "aw-2",
        scholarshipId: "sch-b",
        components: [makeComponent("Tuition", "Percentage", 50)],
      }),
      makeAward({
        id: "aw-3",
        scholarshipId: "sch-c",
        components: [makeComponent("Tuition", "Percentage", 30)],
      }),
    ];

    const merged = computeMerge(student, awards, [a, b, c]);

    expect(line(merged, "sch-a")).toMatchObject({ appliedPct: 60, mergeStatus: "Full" });
    expect(line(merged, "sch-b")).toMatchObject({ appliedPct: 40, mergeStatus: "Trimmed" });
    expect(line(merged, "sch-c")).toMatchObject({ appliedPct: 0, mergeStatus: "Suppressed" });
  });

  it("treats a full waiver as 100% and suppresses everything behind it", () => {
    const a = makeScholarship({ id: "sch-a" });
    const b = makeScholarship({ id: "sch-b" });
    const awards = [
      makeAward({
        id: "aw-1",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Full waiver", 0)],
      }),
      makeAward({
        id: "aw-2",
        scholarshipId: "sch-b",
        components: [makeComponent("Tuition", "Percentage", 25)],
      }),
    ];

    const merged = computeMerge(student, awards, [a, b]);

    expect(line(merged, "sch-a")).toMatchObject({ appliedPct: 100, mergeStatus: "Full" });
    expect(line(merged, "sch-b")).toMatchObject({ appliedPct: 0, mergeStatus: "Suppressed" });
  });

  it("grants fixed amounts in full without consuming percentage headroom", () => {
    const a = makeScholarship({ id: "sch-a" });
    const b = makeScholarship({ id: "sch-b" });
    const awards = [
      makeAward({
        id: "aw-1",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Percentage", 100)],
      }),
      makeAward({
        id: "aw-2",
        scholarshipId: "sch-b",
        components: [makeComponent("Tuition", "Fixed amount", 50000)],
      }),
    ];

    const merged = computeMerge(student, awards, [a, b]);

    expect(line(merged, "sch-a")).toMatchObject({ appliedPct: 100, mergeStatus: "Full" });
    expect(line(merged, "sch-b")).toMatchObject({
      appliedPKR: 50000,
      appliedPct: 0,
      mergeStatus: "Full",
    });
  });

  it("honours a pinned override first and trims others against what is left", () => {
    const a = makeScholarship({ id: "sch-a" });
    const b = makeScholarship({ id: "sch-b" });
    const awards = [
      makeAward({
        id: "aw-1",
        scholarshipId: "sch-a",
        components: [
          makeComponent("Tuition", "Percentage", 70, {
            isOverridden: true,
            overrideReason: "Committee decision",
            overrideAuthority: "Registrar",
          }),
        ],
      }),
      makeAward({
        id: "aw-2",
        scholarshipId: "sch-b",
        components: [makeComponent("Tuition", "Percentage", 50)],
      }),
    ];

    const merged = computeMerge(student, awards, [a, b]);

    expect(line(merged, "sch-a")).toMatchObject({
      appliedPct: 70,
      mergeStatus: "Full",
      isOverridden: true,
      overrideReason: "Committee decision",
    });
    // 100 - 70 pinned = 30 left for the rest.
    expect(line(merged, "sch-b")).toMatchObject({ appliedPct: 30, mergeStatus: "Trimmed" });
  });

  it("floors headroom at zero when pinned overrides already exceed 100%", () => {
    const a = makeScholarship({ id: "sch-a" });
    const b = makeScholarship({ id: "sch-b" });
    const c = makeScholarship({ id: "sch-c" });
    const awards = [
      makeAward({
        id: "aw-1",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Percentage", 80, { isOverridden: true })],
      }),
      makeAward({
        id: "aw-2",
        scholarshipId: "sch-b",
        components: [makeComponent("Tuition", "Percentage", 40, { isOverridden: true })],
      }),
      makeAward({
        id: "aw-3",
        scholarshipId: "sch-c",
        components: [makeComponent("Tuition", "Percentage", 20)],
      }),
    ];

    const merged = computeMerge(student, awards, [a, b, c]);

    // Pinned lines are paid as written, even past the ceiling.
    expect(line(merged, "sch-a")?.appliedPct).toBe(80);
    expect(line(merged, "sch-b")?.appliedPct).toBe(40);
    // Headroom cannot go negative, so the unpinned line is suppressed, not inverted.
    expect(line(merged, "sch-c")).toMatchObject({ appliedPct: 0, mergeStatus: "Suppressed" });
  });

  it("merges each fee head independently", () => {
    const a = makeScholarship({ id: "sch-a" });
    const b = makeScholarship({ id: "sch-b" });
    const awards = [
      makeAward({
        id: "aw-1",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Percentage", 100)],
      }),
      makeAward({
        id: "aw-2",
        scholarshipId: "sch-b",
        components: [
          makeComponent("Tuition", "Percentage", 50),
          makeComponent("Hostel", "Percentage", 50),
        ],
      }),
    ];

    const merged = computeMerge(student, awards, [a, b]);

    // Tuition is exhausted by sch-a, but hostel is untouched.
    expect(line(merged, "sch-b", "Tuition")?.mergeStatus).toBe("Suppressed");
    expect(line(merged, "sch-b", "Hostel")).toMatchObject({
      appliedPct: 50,
      mergeStatus: "Full",
    });
  });

  it("drops awards whose scholarship is missing rather than throwing", () => {
    const a = makeScholarship({ id: "sch-a" });
    const awards = [
      makeAward({
        id: "aw-1",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Percentage", 50)],
      }),
      makeAward({
        id: "aw-2",
        scholarshipId: "sch-gone",
        components: [makeComponent("Tuition", "Percentage", 50)],
      }),
    ];

    const merged = computeMerge(student, awards, [a]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.scholarship.id).toBe("sch-a");
  });
});

describe("ceilingBreach", () => {
  const student = makeStudent();
  const candidate = makeScholarship({
    id: "sch-new",
    coverage: [makeCoverage({ feeHead: "Tuition", benefitKind: "Percentage", value: 50 })],
  });

  it("reports no breach when the total stays at or under 100%", () => {
    const existing = [makeAward({ components: [makeComponent("Tuition", "Percentage", 50)] })];

    const { breachedHeads } = ceilingBreach(student, existing, { scholarship: candidate }, []);

    expect(breachedHeads).toEqual([]);
  });

  it("reports the head and total when the candidate pushes past 100%", () => {
    const existing = [makeAward({ components: [makeComponent("Tuition", "Percentage", 70)] })];

    const { breachedHeads } = ceilingBreach(student, existing, { scholarship: candidate }, []);

    expect(breachedHeads).toEqual([{ head: "Tuition", total: 120 }]);
  });

  it("counts an existing full waiver as 100%", () => {
    const existing = [makeAward({ components: [makeComponent("Tuition", "Full waiver", 0)] })];

    const { breachedHeads } = ceilingBreach(student, existing, { scholarship: candidate }, []);

    expect(breachedHeads).toEqual([{ head: "Tuition", total: 150 }]);
  });

  it("ignores fixed amounts, which do not contest the percentage ceiling", () => {
    const existing = [
      makeAward({ components: [makeComponent("Tuition", "Fixed amount", 900000)] }),
    ];

    const { breachedHeads } = ceilingBreach(student, existing, { scholarship: candidate }, []);

    expect(breachedHeads).toEqual([]);
  });
});

describe("waiverValuePKR", () => {
  const student = makeStudent({ tuitionFee: 400000, hostelFee: 80000 });

  it("values a percentage against the matching fee head", () => {
    const merged = computeMerge(
      student,
      [
        makeAward({
          scholarshipId: "sch-a",
          components: [makeComponent("Tuition", "Percentage", 50)],
        }),
      ],
      [makeScholarship({ id: "sch-a" })],
    );

    expect(waiverValuePKR(student, merged)).toBe(200000);
  });

  it("adds fixed amounts on top of percentage value across heads", () => {
    const merged = computeMerge(
      student,
      [
        makeAward({
          id: "aw-1",
          scholarshipId: "sch-a",
          components: [
            makeComponent("Tuition", "Percentage", 25),
            makeComponent("Hostel", "Percentage", 50),
          ],
        }),
        makeAward({
          id: "aw-2",
          scholarshipId: "sch-b",
          components: [makeComponent("Other", "Fixed amount", 15000)],
        }),
      ],
      [makeScholarship({ id: "sch-a" }), makeScholarship({ id: "sch-b" })],
    );

    // 25% of 400000 = 100000, 50% of 80000 = 40000, plus 15000 fixed.
    expect(waiverValuePKR(student, merged)).toBe(155000);
  });

  it("counts only what was actually applied after trimming", () => {
    const merged = computeMerge(
      student,
      [
        makeAward({
          id: "aw-1",
          scholarshipId: "sch-a",
          components: [makeComponent("Tuition", "Percentage", 80)],
        }),
        makeAward({
          id: "aw-2",
          scholarshipId: "sch-b",
          components: [makeComponent("Tuition", "Percentage", 80)],
        }),
      ],
      [makeScholarship({ id: "sch-a" }), makeScholarship({ id: "sch-b" })],
    );

    // 80% granted + 20% trimmed remainder = 100% of tuition, never more.
    expect(waiverValuePKR(student, merged)).toBe(400000);
  });
});
