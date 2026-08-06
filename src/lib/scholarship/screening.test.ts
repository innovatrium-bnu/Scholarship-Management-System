import { describe, expect, it } from "vitest";
import { minCgpaFor, missingDocuments, screen, type ScreeningContext } from "./screening";
import { makeApplication, makeCriteria, makeStudent } from "./test-factories";

const NONE: ScreeningContext = { existingCoveragePct: 0 };

function checkFor(
  result: ReturnType<typeof screen>,
  id: Parameters<typeof screen>[2]["autoRejectOn"][number],
) {
  return result.checks.find((c) => c.id === id)!;
}

describe("minCgpaFor — thresholds run onwards from their batch", () => {
  const thresholds = [
    { id: "a", fromBatch: "Fall 2023", minCgpa: 2.5 },
    { id: "b", fromBatch: "Fall 2024", minCgpa: 2.65 },
  ];

  it("uses the threshold for the exact batch it names", () => {
    expect(minCgpaFor("Fall 2023", thresholds)).toBe(2.5);
    expect(minCgpaFor("Fall 2024", thresholds)).toBe(2.65);
  });

  it("carries a threshold forward to later batches with no rule of their own", () => {
    expect(minCgpaFor("Spring 2024", thresholds)).toBe(2.5);
    expect(minCgpaFor("Spring 2025", thresholds)).toBe(2.65);
    expect(minCgpaFor("Fall 2025", thresholds)).toBe(2.65);
  });

  it("returns null for intakes older than every threshold", () => {
    expect(minCgpaFor("Fall 2022", thresholds)).toBeNull();
    expect(minCgpaFor("Fall 2021", thresholds)).toBeNull();
  });

  it("returns null for a batch it does not recognise", () => {
    expect(minCgpaFor("Fall 2099", thresholds)).toBeNull();
  });

  it("takes the latest applicable threshold when they are listed out of order", () => {
    const jumbled = [
      { id: "b", fromBatch: "Fall 2024", minCgpa: 2.65 },
      { id: "a", fromBatch: "Fall 2023", minCgpa: 2.5 },
    ];
    expect(minCgpaFor("Fall 2025", jumbled)).toBe(2.65);
  });

  it("has no requirement when no thresholds are configured", () => {
    expect(minCgpaFor("Fall 2025", [])).toBeNull();
  });
});

describe("screen — CGPA against the student's own intake", () => {
  it("passes a Fall 2024 student at exactly 2.65", () => {
    const result = screen(
      makeApplication(),
      makeStudent({ batch: "Fall 2024", cgpa: 2.65 }),
      makeCriteria(),
      NONE,
    );

    expect(checkFor(result, "cgpa").outcome).toBe("Pass");
    expect(result.verdict).toBe("Meets criteria");
  });

  it("fails a Fall 2024 student at 2.60, which the Fall 2023 intake would have passed", () => {
    const criteria = makeCriteria();
    const student = makeStudent({ batch: "Fall 2024", cgpa: 2.6 });

    const result = screen(makeApplication(), student, criteria, NONE);
    expect(result.verdict).toBe("Fails criteria");
    expect(checkFor(result, "cgpa").detail).toContain("2.65");

    const older = screen(
      makeApplication(),
      makeStudent({ batch: "Fall 2023", cgpa: 2.6 }),
      criteria,
      NONE,
    );
    expect(older.verdict).toBe("Meets criteria");
  });

  it("does not check CGPA at all for an intake with no threshold", () => {
    const result = screen(
      makeApplication(),
      makeStudent({ batch: "Fall 2022", cgpa: 2.0 }),
      makeCriteria(),
      NONE,
    );

    expect(checkFor(result, "cgpa").outcome).toBe("Not applicable");
    expect(result.verdict).toBe("Meets criteria");
  });
});

describe("screen — the other hard criteria", () => {
  it("fails an income above the ceiling", () => {
    const app = makeApplication({
      household: { ...makeApplication().household, monthlyIncome: 400_000 },
    });

    const result = screen(app, makeStudent(), makeCriteria(), NONE);

    expect(checkFor(result, "income").outcome).toBe("Fail");
    expect(result.verdict).toBe("Fails criteria");
  });

  it("passes an income sitting exactly on the ceiling", () => {
    const app = makeApplication({
      household: { ...makeApplication().household, monthlyIncome: 150_000 },
    });

    expect(screen(app, makeStudent(), makeCriteria(), NONE).verdict).toBe("Meets criteria");
  });

  it("fails a part-time credit load", () => {
    const result = screen(makeApplication(), makeStudent({ creditHours: 9 }), makeCriteria(), NONE);

    expect(checkFor(result, "creditHours").outcome).toBe("Fail");
    expect(result.verdict).toBe("Fails criteria");
  });

  it("fails and names every missing document", () => {
    const app = makeApplication({ documents: [] });

    const result = screen(app, makeStudent(), makeCriteria(), NONE);

    expect(checkFor(result, "documents").outcome).toBe("Fail");
    expect(checkFor(result, "documents").detail).toContain("cnic");
    expect(checkFor(result, "documents").detail).toContain("income certificate");
  });

  it("fails a second live application for the same scholarship and term", () => {
    const result = screen(makeApplication(), makeStudent(), makeCriteria(), {
      existingCoveragePct: 0,
      duplicateOf: "app-earlier",
    });

    expect(checkFor(result, "duplicate").outcome).toBe("Fail");
    expect(result.verdict).toBe("Fails criteria");
  });
});

describe("screen — flags are not rejections", () => {
  it("only flags attendance, which is not in the auto-reject list", () => {
    const result = screen(
      makeApplication(),
      makeStudent({ attendancePct: 40 }),
      makeCriteria(),
      NONE,
    );

    expect(checkFor(result, "attendance").outcome).toBe("Fail");
    expect(result.verdict).toBe("Needs a closer look");
    expect(result.blockers).toHaveLength(0);
    expect(result.flags.map((f) => f.id)).toEqual(["attendance"]);
  });

  it("only flags heavy existing coverage", () => {
    const result = screen(makeApplication(), makeStudent(), makeCriteria(), {
      existingCoveragePct: 75,
    });

    expect(result.verdict).toBe("Needs a closer look");
    expect(result.flags.map((f) => f.id)).toEqual(["existingCoverage"]);
  });

  it("lets a blocker outrank a flag", () => {
    const result = screen(
      makeApplication(),
      makeStudent({ cgpa: 1.9, attendancePct: 40 }),
      makeCriteria(),
      NONE,
    );

    expect(result.verdict).toBe("Fails criteria");
    expect(result.blockers.map((b) => b.id)).toEqual(["cgpa"]);
    expect(result.flags.map((f) => f.id)).toEqual(["attendance"]);
  });
});

describe("screen — autoRejectOn decides how aggressive the filter is", () => {
  it("downgrades a CGPA failure to a flag when CGPA is taken off the list", () => {
    const criteria = makeCriteria({ autoRejectOn: ["income", "documents"] });

    const result = screen(makeApplication(), makeStudent({ cgpa: 1.5 }), criteria, NONE);

    expect(checkFor(result, "cgpa").outcome).toBe("Fail");
    expect(result.verdict).toBe("Needs a closer look");
  });

  it("promotes attendance to a blocker when it is added to the list", () => {
    const criteria = makeCriteria({ autoRejectOn: ["attendance"] });

    const result = screen(makeApplication(), makeStudent({ attendancePct: 40 }), criteria, NONE);

    expect(result.verdict).toBe("Fails criteria");
    expect(result.blockers.map((b) => b.id)).toEqual(["attendance"]);
  });

  it("never rejects anything when the list is empty", () => {
    const criteria = makeCriteria({ autoRejectOn: [] });
    const app = makeApplication({
      documents: [],
      household: { ...makeApplication().household, monthlyIncome: 900_000 },
    });

    const result = screen(app, makeStudent({ cgpa: 1.2, creditHours: 3 }), criteria, NONE);

    expect(result.verdict).toBe("Needs a closer look");
    expect(result.blockers).toHaveLength(0);
  });
});

describe("screen — the recorded rejection reason", () => {
  it("is empty when nothing blocks", () => {
    expect(screen(makeApplication(), makeStudent(), makeCriteria(), NONE).rejectionReason).toBe("");
  });

  it("names every blocking criterion, and no flags", () => {
    const app = makeApplication({ documents: [] });

    const { rejectionReason } = screen(
      app,
      makeStudent({ cgpa: 1.5, attendancePct: 10 }),
      makeCriteria(),
      NONE,
    );

    expect(rejectionReason).toContain("CGPA 1.50");
    expect(rejectionReason).toContain("Missing");
    expect(rejectionReason).not.toContain("Attendance");
    expect(rejectionReason.endsWith(".")).toBe(true);
  });
});

describe("missingDocuments", () => {
  it("lists only what is absent, keeping the criteria order", () => {
    const app = makeApplication({
      documents: [
        {
          id: "d",
          kind: "Fee voucher",
          fileName: "f.pdf",
          uploadedAt: "2025-08-01",
          verified: false,
        },
      ],
    });

    expect(missingDocuments(app, ["CNIC", "Fee voucher", "Income certificate"])).toEqual([
      "CNIC",
      "Income certificate",
    ]);
  });

  it("is empty when nothing is required", () => {
    expect(missingDocuments(makeApplication(), [])).toEqual([]);
  });
});
