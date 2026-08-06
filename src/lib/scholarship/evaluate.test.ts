import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import { makeAward, makeComponent, makeRule, makeScholarship, makeStudent } from "./test-factories";

describe("evaluate — already held", () => {
  it("marks a student who already holds the scholarship", () => {
    const sch = makeScholarship({ id: "sch-a" });
    const student = makeStudent({ regNo: "F23-0001" });
    const existing = [
      makeAward({ studentRegNo: "F23-0001", scholarshipId: "sch-a", status: "Active" }),
    ];

    const [result] = evaluate(sch, [student], existing);

    expect(result!.status).toBe("AlreadyHolds");
  });

  it("does not count a revoked award as held", () => {
    const sch = makeScholarship({ id: "sch-a" });
    const student = makeStudent({ regNo: "F23-0001" });
    const existing = [
      makeAward({ studentRegNo: "F23-0001", scholarshipId: "sch-a", status: "Revoked" }),
    ];

    const [result] = evaluate(sch, [student], existing);

    expect(result!.status).toBe("Eligible");
  });

  it("does not count an award for a different scholarship as held", () => {
    const sch = makeScholarship({ id: "sch-a" });
    const student = makeStudent({ regNo: "F23-0001" });
    const existing = [
      makeAward({ studentRegNo: "F23-0001", scholarshipId: "sch-other", status: "Active" }),
    ];

    const [result] = evaluate(sch, [student], existing);

    expect(result!.status).toBe("Eligible");
  });
});

describe("evaluate — scope", () => {
  it("passes a student when no scope restrictions are set", () => {
    const [result] = evaluate(makeScholarship(), [makeStudent()], []);

    expect(result!.status).toBe("Eligible");
    expect(result!.reasons).toEqual([]);
  });

  it("rejects a mismatched study level", () => {
    const sch = makeScholarship({ studyLevel: "Masters" });
    const [result] = evaluate(sch, [makeStudent({ studyLevel: "Bachelors" })], []);

    expect(result!.status).toBe("NotEligible");
    expect(result!.reasons[0]).toContain("Masters");
  });

  it('accepts either study level when the scholarship is "Both"', () => {
    const sch = makeScholarship({ studyLevel: "Both" });

    const bachelors = evaluate(sch, [makeStudent({ studyLevel: "Bachelors" })], []);
    const masters = evaluate(sch, [makeStudent({ studyLevel: "Masters" })], []);

    expect(bachelors[0]!.status).toBe("Eligible");
    expect(masters[0]!.status).toBe("Eligible");
  });

  it("rejects a school outside the eligible list", () => {
    const sch = makeScholarship({ schools: ["School of Education"] });
    const [result] = evaluate(sch, [makeStudent({ school: "School of Computer & IT" })], []);

    expect(result!.status).toBe("NotEligible");
    expect(result!.reasons[0]).toContain("School not eligible");
  });

  it("rejects a programme outside the eligible list", () => {
    const sch = makeScholarship({ programmes: ["BS Software Engineering"] });
    const [result] = evaluate(sch, [makeStudent({ programme: "BS Computer Science" })], []);

    expect(result!.status).toBe("NotEligible");
    expect(result!.reasons[0]).toContain("Programme not eligible");
  });

  it("rejects a batch outside the eligible list", () => {
    const sch = makeScholarship({ batches: ["Fall 2025"] });
    const [result] = evaluate(sch, [makeStudent({ batch: "Fall 2023" })], []);

    expect(result!.status).toBe("NotEligible");
    expect(result!.reasons[0]).toContain("Batch not eligible");
  });

  it("treats an empty scope list as no restriction", () => {
    const sch = makeScholarship({ schools: [], programmes: [], batches: [] });

    const [result] = evaluate(sch, [makeStudent()], []);

    expect(result!.status).toBe("Eligible");
  });
});

describe("evaluate — automatic rules", () => {
  it("passes a CGPA at the >= threshold", () => {
    const sch = makeScholarship({
      awardRules: [makeRule({ kind: "Automatic", field: "cgpa", operator: ">=", threshold: 3.5 })],
    });

    const [result] = evaluate(sch, [makeStudent({ cgpa: 3.5 })], []);

    expect(result!.status).toBe("Eligible");
  });

  it("fails a CGPA below the >= threshold and explains why", () => {
    const sch = makeScholarship({
      awardRules: [makeRule({ kind: "Automatic", field: "cgpa", operator: ">=", threshold: 3.5 })],
    });

    const [result] = evaluate(sch, [makeStudent({ cgpa: 3.49 })], []);

    expect(result!.status).toBe("NotEligible");
    expect(result!.reasons[0]).toBe("CGPA 3.49 is below the required 3.5");
  });

  it("requires a strictly greater CGPA for the > operator", () => {
    const sch = makeScholarship({
      awardRules: [makeRule({ kind: "Automatic", field: "cgpa", operator: ">", threshold: 3.5 })],
    });

    const atThreshold = evaluate(sch, [makeStudent({ cgpa: 3.5 })], []);
    const above = evaluate(sch, [makeStudent({ cgpa: 3.51 })], []);

    expect(atThreshold[0]!.status).toBe("NotEligible");
    expect(above[0]!.status).toBe("Eligible");
  });

  it("falls back to reading a threshold out of the description", () => {
    const sch = makeScholarship({
      awardRules: [makeRule({ kind: "Automatic", description: "Minimum CGPA of 3.7" })],
    });

    const below = evaluate(sch, [makeStudent({ cgpa: 3.6 })], []);
    const above = evaluate(sch, [makeStudent({ cgpa: 3.8 })], []);

    expect(below[0]!.status).toBe("NotEligible");
    expect(above[0]!.status).toBe("Eligible");
  });

  it("passes an automatic rule it cannot interpret rather than blocking the award", () => {
    const sch = makeScholarship({
      awardRules: [makeRule({ kind: "Automatic", description: "Approved by the dean" })],
    });

    const [result] = evaluate(sch, [makeStudent()], []);

    expect(result!.status).toBe("Eligible");
  });
});

describe("evaluate — manual rules", () => {
  const cases = [
    {
      description: "Financial need assessment",
      field: "financialNeedVerified",
      label: "Financial need verification",
    },
    {
      description: "Personal statement review",
      field: "personalStatementOk",
      label: "Personal statement review",
    },
    {
      description: "Sports medal check",
      field: "hasSportsMedal",
      label: "Sports medal verification",
    },
    { description: "B.Fit membership", field: "bfitMember", label: "B.Fit membership" },
  ] as const;

  for (const c of cases) {
    it(`flags "${c.description}" as pending when unverified`, () => {
      const sch = makeScholarship({
        awardRules: [makeRule({ kind: "Manual", description: c.description })],
      });

      const [result] = evaluate(sch, [makeStudent({ [c.field]: false })], []);

      expect(result!.status).toBe("PendingVerification");
      expect(result!.reasons[0]).toBe(`${c.label} required`);
    });

    it(`passes "${c.description}" once verified`, () => {
      const sch = makeScholarship({
        awardRules: [makeRule({ kind: "Manual", description: c.description })],
      });

      const [result] = evaluate(sch, [makeStudent({ [c.field]: true })], []);

      expect(result!.status).toBe("Eligible");
    });
  }

  it("falls back to pending with the raw description for an unrecognised manual rule", () => {
    const sch = makeScholarship({
      awardRules: [makeRule({ kind: "Manual", description: "Interview with the panel" })],
    });

    const [result] = evaluate(sch, [makeStudent()], []);

    expect(result!.status).toBe("PendingVerification");
    expect(result!.reasons).toEqual(["Interview with the panel"]);
  });

  it("lets NotEligible win over PendingVerification", () => {
    const sch = makeScholarship({
      studyLevel: "Masters",
      awardRules: [makeRule({ kind: "Manual", description: "Financial need assessment" })],
    });

    const [result] = evaluate(
      sch,
      [makeStudent({ studyLevel: "Bachelors", financialNeedVerified: false })],
      [],
    );

    expect(result!.status).toBe("NotEligible");
  });
});

describe("evaluate — cohort rank", () => {
  /** Ten students, CGPA 4.0 down to 3.1, so percentiles land on clean tens. */
  function cohort() {
    return Array.from({ length: 10 }, (_, i) =>
      makeStudent({
        regNo: `F23-00${(i + 1).toString().padStart(2, "0")}`,
        cgpa: Math.round((4.0 - i * 0.1) * 100) / 100,
      }),
    );
  }

  const topQuarter = makeScholarship({
    id: "sch-rank",
    awardRules: [makeRule({ kind: "Cohort rank", percentile: 25 })],
  });

  it("ranks by CGPA descending and assigns percentiles", () => {
    const results = evaluate(topQuarter, cohort(), []);

    expect(results[0]).toMatchObject({ rank: 1, percentile: 10 });
    expect(results[4]).toMatchObject({ rank: 5, percentile: 50 });
    expect(results[9]).toMatchObject({ rank: 10, percentile: 100 });
  });

  it("admits students inside the cutoff and rejects those outside", () => {
    const results = evaluate(topQuarter, cohort(), []);

    expect(results[0]!.status).toBe("Eligible");
    expect(results[1]!.status).toBe("Eligible");
    expect(results[2]!.status).toBe("NotEligible");
    expect(results[2]!.reasons[0]).toContain("outside top 25%");
  });

  it("ranks a single targeted student against the whole cohort, not against themselves", () => {
    const all = cohort();
    const fifthBest = all[4]!;

    // Evaluating one student must not make them automatically top of a cohort of one.
    const [result] = evaluate(topQuarter, [fifthBest], [], all);

    expect(result!.rank).toBe(5);
    expect(result!.percentile).toBe(50);
    expect(result!.status).toBe("NotEligible");
  });

  it("excludes out-of-scope students from the ranking population", () => {
    const sch = makeScholarship({
      id: "sch-rank",
      schools: ["School of Computer & IT"],
      awardRules: [makeRule({ kind: "Cohort rank", percentile: 50 })],
    });
    const all = [
      makeStudent({ regNo: "F23-0001", cgpa: 4.0, school: "School of Education" }),
      makeStudent({ regNo: "F23-0002", cgpa: 3.5, school: "School of Computer & IT" }),
      makeStudent({ regNo: "F23-0003", cgpa: 3.2, school: "School of Computer & IT" }),
    ];

    const results = evaluate(sch, all, [], all);

    // The 4.0 student is out of scope, so the 3.5 student tops a cohort of two.
    expect(results[0]!.status).toBe("NotEligible");
    expect(results[1]).toMatchObject({ rank: 1, percentile: 50, status: "Eligible" });
    expect(results[2]).toMatchObject({ rank: 2, percentile: 100, status: "NotEligible" });
  });

  it("marks a student absent from the ranking population as outside the cohort", () => {
    const all = cohort();
    const outsider = makeStudent({ regNo: "F23-9999", cgpa: 4.0 });

    const [result] = evaluate(topQuarter, [outsider], [], all);

    expect(result!.status).toBe("NotEligible");
    expect(result!.reasons).toContain("Outside targeted cohort");
  });
});

describe("evaluate — combined", () => {
  /**
   * Scope checks short-circuit: `inScope` returns on the first failure, so a
   * student who fails on both study level and school is told about the study
   * level only. Rule failures then accumulate on top. This documents the
   * current behaviour — if the reason list should ever become exhaustive,
   * this is the test that should change first.
   */
  it("reports one scope reason plus every failing rule", () => {
    const sch = makeScholarship({
      studyLevel: "Masters",
      schools: ["School of Education"],
      awardRules: [makeRule({ kind: "Automatic", field: "cgpa", operator: ">=", threshold: 3.5 })],
    });

    const [result] = evaluate(
      sch,
      [makeStudent({ studyLevel: "Bachelors", school: "School of Computer & IT", cgpa: 2.0 })],
      [],
    );

    expect(result!.status).toBe("NotEligible");
    expect(result!.reasons).toEqual([
      "Study level (requires Masters)",
      "CGPA 2.00 is below the required 3.5",
    ]);
  });

  it("returns one result per student, in input order", () => {
    const students = [
      makeStudent({ regNo: "F23-0001" }),
      makeStudent({ regNo: "F23-0002" }),
      makeStudent({ regNo: "F23-0003" }),
    ];

    const results = evaluate(makeScholarship(), students, []);

    expect(results.map((r) => r.student.regNo)).toEqual(["F23-0001", "F23-0002", "F23-0003"]);
  });

  it("ignores components on unrelated awards when checking what is held", () => {
    const sch = makeScholarship({ id: "sch-a" });
    const students = [makeStudent({ regNo: "F23-0001" }), makeStudent({ regNo: "F23-0002" })];
    const existing = [
      makeAward({
        studentRegNo: "F23-0002",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Percentage", 50)],
      }),
    ];

    const results = evaluate(sch, students, existing);

    expect(results[0]!.status).toBe("Eligible");
    expect(results[1]!.status).toBe("AlreadyHolds");
  });
});
