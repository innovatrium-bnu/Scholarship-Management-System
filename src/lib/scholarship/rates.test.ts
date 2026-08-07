import { describe, expect, it } from "vitest";
import {
  AWARD_RATES,
  EMPTY_RATE_PLAN,
  NOT_PAID,
  batchPct,
  clearAllStudentRates,
  clearStudentRates,
  describeRatePlan,
  hasCustomBatchRates,
  hasOwnRates,
  pctOfHead,
  rateHeads,
  resolveCoverage,
  setBatchRate,
  setStudentRate,
  standardPctOf,
  studentPct,
  studentRate,
  studentsWithOwnRates,
  type RatePlan,
} from "./rates";
import { makeCoverage, makeScholarship } from "./test-factories";
import type { CoverageLine } from "./types";

const HEADS = ["Tuition", "Hostel", "Mess", "Other"] as const;

/** Need-Based as seeded: half of tuition, and nothing else. */
const need = makeScholarship({
  id: "sch-need",
  name: "Need-Based Scholarship",
  coverage: [
    makeCoverage({ id: "cov-n-1", feeHead: "Tuition", benefitKind: "Percentage", value: 50 }),
  ],
});

/** VC's List as seeded: all of tuition, and hostel as a full waiver. */
const vc = makeScholarship({
  id: "sch-vc",
  coverage: [
    makeCoverage({ id: "cov-vc-1", feeHead: "Tuition", benefitKind: "Percentage", value: 100 }),
    makeCoverage({ id: "cov-vc-2", feeHead: "Hostel", benefitKind: "Full waiver", value: 100 }),
  ],
});

/** A scholarship paying a flat sum, which no percentage can express. */
const flat = makeScholarship({
  id: "sch-flat",
  coverage: [
    makeCoverage({ id: "cov-f-1", feeHead: "Tuition", benefitKind: "Percentage", value: 40 }),
    makeCoverage({ id: "cov-f-2", feeHead: "Other", benefitKind: "Fixed amount", value: 25_000 }),
  ],
});

function line(coverage: CoverageLine[], head: string) {
  return coverage.find((c) => c.feeHead === head);
}

describe("AWARD_RATES", () => {
  it("offers the five rates the committee minutes actually use", () => {
    expect([...AWARD_RATES]).toEqual([25, 35, 50, 75, 100]);
  });
});

describe("standardPctOf", () => {
  it("reads a percentage line", () => {
    expect(standardPctOf(need, "Tuition")).toBe(50);
  });

  it("treats a full waiver as 100%", () => {
    expect(standardPctOf(vc, "Hostel")).toBe(100);
  });

  it("has no standard rate for a head the scholarship does not cover", () => {
    expect(standardPctOf(need, "Hostel")).toBeNull();
  });

  it("has no standard rate for a fixed sum, which is not a percentage", () => {
    expect(standardPctOf(flat, "Other")).toBeNull();
  });
});

describe("rateHeads", () => {
  it("lists covered heads first, then every other fee that can be added", () => {
    expect(rateHeads(need, HEADS)).toEqual(["Tuition", "Hostel", "Mess", "Other"]);
  });

  it("keeps the scholarship's own order for the heads it covers", () => {
    expect(rateHeads(vc, HEADS)).toEqual(["Tuition", "Hostel", "Mess", "Other"]);
  });

  it("leaves out a head paid as a fixed sum", () => {
    expect(rateHeads(flat, HEADS)).toEqual(["Tuition", "Hostel", "Mess"]);
  });
});

describe("batchPct and studentPct", () => {
  it("falls back to the scholarship's own rate when nothing is set", () => {
    expect(batchPct(need, EMPTY_RATE_PLAN, "Tuition")).toBe(50);
    expect(studentPct(need, EMPTY_RATE_PLAN, "Tuition", "F23-0001")).toBe(50);
  });

  it("pays nothing on a head the scholarship does not cover", () => {
    expect(batchPct(need, EMPTY_RATE_PLAN, "Hostel")).toBe(NOT_PAID);
  });

  it("prefers a student's own rate over the batch rate", () => {
    let plan = setBatchRate(EMPTY_RATE_PLAN, "Tuition", 25);
    plan = setStudentRate(plan, "F23-0001", "Tuition", 75);

    expect(batchPct(need, plan, "Tuition")).toBe(25);
    expect(studentPct(need, plan, "Tuition", "F23-0001")).toBe(75);
    expect(studentPct(need, plan, "Tuition", "F23-0002")).toBe(25);
  });

  it("keeps an explicit zero rather than reading it as no decision", () => {
    const plan = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Tuition", NOT_PAID);

    expect(studentPct(need, plan, "Tuition", "F23-0001")).toBe(0);
    expect(studentPct(need, plan, "Tuition", "F23-0002")).toBe(50);
  });
});

describe("setBatchRate", () => {
  it("does not mutate the plan it was given", () => {
    const before = EMPTY_RATE_PLAN;
    const after = setBatchRate(before, "Tuition", 75);

    expect(before.batch).toEqual({});
    expect(after.batch).toEqual({ Tuition: 75 });
  });

  it("drops back to the scholarship's rate when cleared", () => {
    const plan = setBatchRate(setBatchRate(EMPTY_RATE_PLAN, "Tuition", 75), "Tuition", null);

    expect(plan.batch).toEqual({});
    expect(batchPct(need, plan, "Tuition")).toBe(50);
  });

  it("leaves individual decisions alone, because they were made separately", () => {
    let plan = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Tuition", 100);
    plan = setBatchRate(plan, "Tuition", 25);

    expect(studentPct(need, plan, "Tuition", "F23-0001")).toBe(100);
  });
});

describe("setStudentRate", () => {
  it("holds several heads for one student", () => {
    let plan = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Tuition", 75);
    plan = setStudentRate(plan, "F23-0001", "Hostel", 100);

    expect(studentRate(plan, "F23-0001", "Tuition")).toBe(75);
    expect(studentRate(plan, "F23-0001", "Hostel")).toBe(100);
  });

  it("forgets the student entirely once their last head is cleared", () => {
    let plan = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Tuition", 75);
    plan = setStudentRate(plan, "F23-0001", "Tuition", null);

    expect(plan.perStudent).toEqual({});
    expect(hasOwnRates(plan, "F23-0001")).toBe(false);
  });

  it("does not mutate the plan it was given", () => {
    const before = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Tuition", 75);
    setStudentRate(before, "F23-0001", "Hostel", 50);

    expect(before.perStudent["F23-0001"]).toEqual({ Tuition: 75 });
  });
});

describe("clearStudentRates", () => {
  it("returns one student to the batch rate and leaves the rest alone", () => {
    let plan = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Tuition", 75);
    plan = setStudentRate(plan, "F23-0002", "Tuition", 25);
    plan = clearStudentRates(plan, "F23-0001");

    expect(hasOwnRates(plan, "F23-0001")).toBe(false);
    expect(hasOwnRates(plan, "F23-0002")).toBe(true);
  });

  it("clears everyone at once", () => {
    let plan = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Tuition", 75);
    plan = setStudentRate(plan, "F23-0002", "Tuition", 25);

    expect(clearAllStudentRates(plan).perStudent).toEqual({});
  });
});

describe("studentsWithOwnRates", () => {
  it("counts only the students asked about, not everyone ever touched", () => {
    let plan = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Tuition", 75);
    plan = setStudentRate(plan, "F23-0009", "Tuition", 25);

    expect(studentsWithOwnRates(plan, ["F23-0001", "F23-0002"])).toEqual(["F23-0001"]);
  });
});

describe("hasCustomBatchRates", () => {
  it("is false when a head is set to the rate it already had", () => {
    const plan = setBatchRate(EMPTY_RATE_PLAN, "Tuition", 50);

    expect(hasCustomBatchRates(need, HEADS, plan)).toBe(false);
  });

  it("is true once a head is moved off its standard rate", () => {
    const plan = setBatchRate(EMPTY_RATE_PLAN, "Tuition", 75);

    expect(hasCustomBatchRates(need, HEADS, plan)).toBe(true);
  });

  it("is true when a fee the scholarship never covered is switched on", () => {
    const plan = setBatchRate(EMPTY_RATE_PLAN, "Hostel", 100);

    expect(hasCustomBatchRates(need, HEADS, plan)).toBe(true);
  });
});

describe("resolveCoverage", () => {
  it("returns the scholarship's own coverage when no rate is set", () => {
    expect(resolveCoverage(need, HEADS, EMPTY_RATE_PLAN, "F23-0001")).toEqual(need.coverage);
  });

  it("applies a batch rate to everyone", () => {
    const plan = setBatchRate(EMPTY_RATE_PLAN, "Tuition", 25);

    expect(line(resolveCoverage(need, HEADS, plan, "F23-0001"), "Tuition")).toMatchObject({
      benefitKind: "Percentage",
      value: 25,
    });
    expect(line(resolveCoverage(need, HEADS, plan, "F23-0002"), "Tuition")).toMatchObject({
      value: 25,
    });
  });

  it("gives two students in the same batch different amounts", () => {
    let plan = setBatchRate(EMPTY_RATE_PLAN, "Tuition", 50);
    plan = setStudentRate(plan, "F23-0001", "Tuition", 75);
    plan = setStudentRate(plan, "F23-0002", "Tuition", 25);

    expect(pctOfHead(resolveCoverage(need, HEADS, plan, "F23-0001"), "Tuition")).toBe(75);
    expect(pctOfHead(resolveCoverage(need, HEADS, plan, "F23-0002"), "Tuition")).toBe(25);
    expect(pctOfHead(resolveCoverage(need, HEADS, plan, "F23-0003"), "Tuition")).toBe(50);
  });

  it("adds a fee the scholarship does not cover", () => {
    const plan = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Hostel", 100);
    const coverage = resolveCoverage(need, HEADS, plan, "F23-0001");

    expect(coverage).toHaveLength(2);
    expect(line(coverage, "Hostel")).toMatchObject({ benefitKind: "Percentage", value: 100 });
    /* Nobody else in the batch picked up the hostel line. */
    expect(resolveCoverage(need, HEADS, plan, "F23-0002")).toHaveLength(1);
  });

  it("drops a head set to nothing rather than awarding an empty component", () => {
    const plan = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Tuition", NOT_PAID);

    expect(resolveCoverage(need, HEADS, plan, "F23-0001")).toEqual([]);
  });

  it("leaves a full waiver as a full waiver when it is not overridden", () => {
    expect(line(resolveCoverage(vc, HEADS, EMPTY_RATE_PLAN, "F23-0001"), "Hostel")).toMatchObject({
      benefitKind: "Full waiver",
    });
  });

  it("rewrites a full waiver only when a different rate is chosen", () => {
    const plan = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Hostel", 50);

    expect(line(resolveCoverage(vc, HEADS, plan, "F23-0001"), "Hostel")).toMatchObject({
      benefitKind: "Percentage",
      value: 50,
    });
  });

  it("passes a fixed sum through untouched, since a rate cannot express it", () => {
    const plan = setBatchRate(EMPTY_RATE_PLAN, "Other", 100);
    const coverage = resolveCoverage(flat, HEADS, plan, "F23-0001");

    expect(line(coverage, "Other")).toMatchObject({
      benefitKind: "Fixed amount",
      value: 25_000,
    });
  });

  it("keeps covered heads ahead of added ones", () => {
    const plan = setBatchRate(EMPTY_RATE_PLAN, "Mess", 100);

    expect(resolveCoverage(need, HEADS, plan, "F23-0001").map((c) => c.feeHead)).toEqual([
      "Tuition",
      "Mess",
    ]);
  });
});

describe("pctOfHead", () => {
  it("counts a full waiver as the whole fee", () => {
    expect(pctOfHead(vc.coverage, "Hostel")).toBe(100);
  });

  it("is zero for a head nothing pays", () => {
    expect(pctOfHead(need.coverage, "Mess")).toBe(0);
  });
});

describe("describeRatePlan", () => {
  const plan = (p: RatePlan) => describeRatePlan(need, HEADS, p, ["F23-0001", "F23-0002"]);

  it("says nothing when the batch pays exactly what the scholarship says", () => {
    expect(plan(EMPTY_RATE_PLAN)).toBe("");
  });

  it("names a changed rate", () => {
    expect(plan(setBatchRate(EMPTY_RATE_PLAN, "Tuition", 25))).toBe(
      "awarded at 25% of tuition by decision",
    );
  });

  it("joins several changed heads", () => {
    let p = setBatchRate(EMPTY_RATE_PLAN, "Tuition", 25);
    p = setBatchRate(p, "Hostel", 100);

    expect(plan(p)).toBe("awarded at 25% of tuition and 100% of hostel by decision");
  });

  it("says when a fee was deliberately dropped", () => {
    expect(plan(setBatchRate(EMPTY_RATE_PLAN, "Tuition", NOT_PAID))).toBe(
      "awarded at no tuition by decision",
    );
  });

  it("counts only the students in this batch who were set individually", () => {
    let p = setStudentRate(EMPTY_RATE_PLAN, "F23-0001", "Tuition", 75);
    p = setStudentRate(p, "F23-0009", "Tuition", 25);

    expect(plan(p)).toBe("1 student set individually");
  });

  it("reports both a changed batch rate and the exceptions to it", () => {
    let p = setBatchRate(EMPTY_RATE_PLAN, "Tuition", 25);
    p = setStudentRate(p, "F23-0001", "Tuition", 75);
    p = setStudentRate(p, "F23-0002", "Tuition", 100);

    expect(plan(p)).toBe("awarded at 25% of tuition by decision · 2 students set individually");
  });
});
