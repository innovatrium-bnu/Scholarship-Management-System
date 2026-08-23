import { describe, expect, it } from "vitest";
import {
  awardsGrantedBetween,
  awardsRevokedBetween,
  everHeldRegNos,
  grantedAndRevokedBySemester,
  scholarRegNos,
  scholarsByIntakeYear,
  totalWaiverPKR,
} from "./aggregate";
import { makeAward, makeComponent, makeScholarship, makeStudent } from "./test-factories";
import type { DomainEvent } from "./events";

function granted(patch: Partial<Extract<DomainEvent, { kind: "award.granted" }>>): DomainEvent {
  return {
    kind: "award.granted",
    at: "2025-09-01T09:00:00.000Z",
    actor: "Registrar Office",
    awardId: "aw-1",
    studentRegNo: "F23-0001",
    scholarshipId: "sch-a",
    effectiveFrom: "2025-09-01",
    semester: "Fall 2025",
    ...patch,
  };
}

function revoked(patch: Partial<Extract<DomainEvent, { kind: "award.revoked" }>>): DomainEvent {
  return {
    kind: "award.revoked",
    at: "2025-09-01T11:30:00.000Z",
    actor: "Registrar Office",
    awardId: "aw-1",
    studentRegNo: "F23-0001",
    scholarshipId: "sch-a",
    effectiveFrom: "2025-09-01",
    semester: "Fall 2025",
    timing: "immediate",
    cause: "Revoked by hand",
    reason: "CGPA fell below the required level.",
    ...patch,
  };
}

describe("awardsRevokedBetween — counts when the award ended, not when it began", () => {
  /**
   * The bug this replaces: the dashboard filtered
   * `status === "Revoked" && effectiveFrom.startsWith("2025")`, where
   * `effectiveFrom` is the date the award *started*.
   */
  it("counts an award granted in 2024 and revoked in 2025", () => {
    const events = [
      granted({ effectiveFrom: "2024-09-01", semester: "Fall 2024" }),
      revoked({ effectiveFrom: "2025-02-01", semester: "Spring 2025" }),
    ];

    expect(awardsRevokedBetween(events, "2025-01-01", "2025-12-31")).toHaveLength(1);
  });

  it("does not count an award granted in 2025 that is still running", () => {
    const events = [granted({ effectiveFrom: "2025-09-01" })];

    expect(awardsRevokedBetween(events, "2025-01-01", "2025-12-31")).toHaveLength(0);
  });

  it("does not count a revocation that falls outside the window", () => {
    const events = [revoked({ effectiveFrom: "2024-09-01", semester: "Fall 2024" })];

    expect(awardsRevokedBetween(events, "2025-01-01", "2025-12-31")).toHaveLength(0);
  });

  it("includes revocations sitting exactly on either boundary", () => {
    const events = [
      revoked({ awardId: "aw-1", effectiveFrom: "2025-01-01" }),
      revoked({ awardId: "aw-2", effectiveFrom: "2025-12-31" }),
    ];

    expect(awardsRevokedBetween(events, "2025-01-01", "2025-12-31")).toHaveLength(2);
  });

  it("excludes an award whose batch was undone, because it was never really held", () => {
    const events: DomainEvent[] = [
      granted({ awardId: "aw-9" }),
      revoked({ awardId: "aw-9" }),
      {
        kind: "award.undone",
        at: "2025-09-02T10:00:00.000Z",
        actor: "Registrar Office",
        awardId: "aw-9",
        studentRegNo: "F23-0001",
        scholarshipId: "sch-a",
        batchId: "bat-1",
      },
    ];

    expect(awardsRevokedBetween(events, "2025-01-01", "2025-12-31")).toHaveLength(0);
    expect(awardsGrantedBetween(events, "2025-01-01", "2025-12-31")).toHaveLength(0);
  });
});

describe("everHeldRegNos — who has ever held it, not who holds it now", () => {
  it("includes a student whose award has since been revoked", () => {
    // The defect this exists for: the scholarship page counted current holders
    // under a heading promising "including past awards", so an archived
    // scholarship whose awards had all ended reported nobody.
    const events = [
      granted({ awardId: "aw-1", studentRegNo: "F23-0001", scholarshipId: "sch-a" }),
      revoked({ awardId: "aw-1", studentRegNo: "F23-0001", scholarshipId: "sch-a" }),
    ];

    expect(everHeldRegNos(events, "sch-a")).toEqual(new Set(["F23-0001"]));
  });

  it("counts a student once however many awards of it they have held", () => {
    const events = [
      granted({ awardId: "aw-1", studentRegNo: "F23-0001", scholarshipId: "sch-a" }),
      revoked({ awardId: "aw-1", studentRegNo: "F23-0001", scholarshipId: "sch-a" }),
      granted({ awardId: "aw-2", studentRegNo: "F23-0001", scholarshipId: "sch-a" }),
    ];

    expect(everHeldRegNos(events, "sch-a").size).toBe(1);
  });

  it("ignores other scholarships", () => {
    const events = [
      granted({ awardId: "aw-1", studentRegNo: "F23-0001", scholarshipId: "sch-a" }),
      granted({ awardId: "aw-2", studentRegNo: "F23-0002", scholarshipId: "sch-b" }),
    ];

    expect(everHeldRegNos(events, "sch-a")).toEqual(new Set(["F23-0001"]));
  });

  it("excludes an award whose batch was undone, because it was never really held", () => {
    const events = [
      granted({ awardId: "aw-1", studentRegNo: "F23-0001", scholarshipId: "sch-a" }),
      {
        kind: "award.undone" as const,
        at: "2025-09-02T10:00:00.000Z",
        actor: "Registrar Office",
        awardId: "aw-1",
        studentRegNo: "F23-0001",
        scholarshipId: "sch-a",
        batchId: "bat-1",
      },
    ];

    expect(everHeldRegNos(events, "sch-a").size).toBe(0);
  });

  it("is empty for a scholarship nobody has ever been granted", () => {
    expect(everHeldRegNos([], "sch-a").size).toBe(0);
  });
});

describe("scholarsByIntakeYear — a year holds both its intakes", () => {
  /**
   * The bug this replaces: `BATCHES.find(b => b.endsWith(year))` returned only
   * the first match, so a year with a Spring and a Fall cohort silently
   * reported the Spring one alone.
   */
  it("counts the Spring and Fall cohorts of the same year together", () => {
    const students = [
      makeStudent({ regNo: "S25-0001", batch: "Spring 2025" }),
      makeStudent({ regNo: "F25-0001", batch: "Fall 2025" }),
      makeStudent({ regNo: "F25-0002", batch: "Fall 2025" }),
    ];
    const awards = [
      makeAward({ id: "a1", studentRegNo: "S25-0001" }),
      makeAward({ id: "a2", studentRegNo: "F25-0001" }),
      makeAward({ id: "a3", studentRegNo: "F25-0002" }),
    ];

    const [row] = scholarsByIntakeYear(awards, students, ["Spring 2025", "Fall 2025"], ["2025"]);

    expect(row!.scholars).toBe(3);
  });

  it("counts a student once however many awards they hold", () => {
    const students = [makeStudent({ regNo: "F25-0001", batch: "Fall 2025" })];
    const awards = [
      makeAward({ id: "a1", studentRegNo: "F25-0001", scholarshipId: "sch-a" }),
      makeAward({ id: "a2", studentRegNo: "F25-0001", scholarshipId: "sch-b" }),
    ];

    const [row] = scholarsByIntakeYear(awards, students, ["Fall 2025"], ["2025"]);

    expect(row!.scholars).toBe(1);
  });

  it("ignores revoked awards", () => {
    const students = [makeStudent({ regNo: "F25-0001", batch: "Fall 2025" })];
    const awards = [makeAward({ studentRegNo: "F25-0001", status: "Revoked" })];

    const [row] = scholarsByIntakeYear(awards, students, ["Fall 2025"], ["2025"]);

    expect(row!.scholars).toBe(0);
  });

  it("reports zero for a year with no batches rather than dropping the row", () => {
    const rows = scholarsByIntakeYear([], [], ["Fall 2025"], ["2026"]);

    expect(rows).toEqual([{ year: "2026", scholars: 0 }]);
  });
});

describe("grantedAndRevokedBySemester", () => {
  it("splits movement across terms", () => {
    const events = [
      granted({ awardId: "a1", semester: "Fall 2024" }),
      granted({ awardId: "a2", semester: "Fall 2025" }),
      granted({ awardId: "a3", semester: "Fall 2025" }),
      revoked({ awardId: "a4", semester: "Fall 2025" }),
    ];

    expect(grantedAndRevokedBySemester(events, ["Fall 2024", "Fall 2025"])).toEqual([
      { semester: "Fall 2024", gained: 1, lost: 0 },
      { semester: "Fall 2025", gained: 2, lost: 1 },
    ]);
  });

  it("returns a zero row for a term with no movement, not a missing one", () => {
    expect(grantedAndRevokedBySemester([], ["Spring 2026"])).toEqual([
      { semester: "Spring 2026", gained: 0, lost: 0 },
    ]);
  });
});

describe("scholarRegNos and totalWaiverPKR", () => {
  it("counts only active awards, once per student", () => {
    const awards = [
      makeAward({ id: "a1", studentRegNo: "F23-0001" }),
      makeAward({ id: "a2", studentRegNo: "F23-0001", scholarshipId: "sch-b" }),
      makeAward({ id: "a3", studentRegNo: "F23-0002", status: "Revoked" }),
    ];

    expect(scholarRegNos(awards)).toEqual(new Set(["F23-0001"]));
  });

  it("values a waiver through the merge engine, so the ceiling is respected", () => {
    const student = makeStudent({ regNo: "F23-0001", tuitionFee: 400_000 });
    const scholarships = [makeScholarship({ id: "sch-a" }), makeScholarship({ id: "sch-b" })];
    // 75% + 50% of the same fee head must land at 100%, not 125%.
    const awards = [
      makeAward({
        id: "a1",
        studentRegNo: "F23-0001",
        scholarshipId: "sch-a",
        components: [makeComponent("Tuition", "Percentage", 75)],
      }),
      makeAward({
        id: "a2",
        studentRegNo: "F23-0001",
        scholarshipId: "sch-b",
        components: [makeComponent("Tuition", "Percentage", 50)],
      }),
    ];

    expect(totalWaiverPKR(["F23-0001"], [student], awards, scholarships)).toBe(400_000);
  });

  it("is zero when a student holds nothing", () => {
    expect(totalWaiverPKR(["F23-0001"], [makeStudent()], [], [])).toBe(0);
  });
});
