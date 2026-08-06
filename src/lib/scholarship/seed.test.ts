import { describe, expect, it } from "vitest";
import {
  BATCHES,
  SEMESTERS,
  dateOfSemester,
  seedAwards,
  seedEvents,
  seedStudents,
  semesterOf,
  semesterOfBatch,
} from "./seed";
import { eventsOfKind } from "./events";

describe("semesterOf — which term a date falls in", () => {
  it("puts January to June in Spring", () => {
    expect(semesterOf("2025-01-15")).toBe("Spring 2025");
    expect(semesterOf("2025-06-30")).toBe("Spring 2025");
  });

  it("puts July to December in Fall", () => {
    expect(semesterOf("2025-07-01")).toBe("Fall 2025");
    expect(semesterOf("2025-12-31")).toBe("Fall 2025");
  });

  it("puts the usual award start date in Fall", () => {
    expect(semesterOf("2025-09-01")).toBe("Fall 2025");
  });

  it("accepts a full ISO timestamp", () => {
    expect(semesterOf("2025-09-01T09:00:00.000Z")).toBe("Fall 2025");
  });

  it("reports a term outside SEMESTERS rather than clamping into one", () => {
    expect(semesterOf("2019-03-01")).toBe("Spring 2019");
  });

  it("returns empty for a date it cannot read", () => {
    expect(semesterOf("not a date")).toBe("");
  });
});

describe("dateOfSemester — the inverse", () => {
  it("maps a term to the date it begins", () => {
    expect(dateOfSemester("Fall 2025")).toBe("2025-09-01");
    expect(dateOfSemester("Spring 2026")).toBe("2026-02-01");
  });

  it("round-trips every term the university has on record", () => {
    for (const s of SEMESTERS) expect(semesterOf(dateOfSemester(s))).toBe(s);
  });

  it("passes through anything that is not a term label", () => {
    expect(dateOfSemester("2025-09-01")).toBe("2025-09-01");
  });
});

describe("semesterOfBatch", () => {
  it("puts the newest intake in its first semester", () => {
    expect(semesterOfBatch("Fall 2025")).toBe(1);
  });

  it("advances a semester for each earlier intake", () => {
    expect(semesterOfBatch("Spring 2025")).toBe(2);
    expect(semesterOfBatch("Fall 2024")).toBe(3);
  });

  it("caps at eight, because there is no ninth semester", () => {
    expect(semesterOfBatch(BATCHES[0]!)).toBe(8);
  });

  it("falls back to one for an unknown intake", () => {
    expect(semesterOfBatch("Fall 2099")).toBe(1);
  });
});

describe("seedEvents — the demo history is traceable to real awards", () => {
  const students = seedStudents();
  const awards = seedAwards(students);
  const events = seedEvents(awards);

  it("records a grant for every award that exists", () => {
    expect(eventsOfKind(events, "award.granted")).toHaveLength(awards.length);
  });

  it("ties every grant to an award actually on file", () => {
    const ids = new Set(awards.map((a) => a.id));
    for (const e of eventsOfKind(events, "award.granted")) {
      expect(ids.has(e.awardId)).toBe(true);
    }
  });

  it("seeds revocations across more than one term, so history has shape", () => {
    const revoked = eventsOfKind(events, "award.revoked");
    expect(revoked.length).toBeGreaterThan(0);
    expect(new Set(revoked.map((e) => e.semester)).size).toBeGreaterThan(1);
  });

  it("gives every revocation a term the university recognises", () => {
    for (const e of eventsOfKind(events, "award.revoked")) {
      expect(SEMESTERS).toContain(e.semester);
    }
  });

  it("gives every revocation a reason a person could read", () => {
    for (const e of eventsOfKind(events, "award.revoked")) {
      expect(e.reason.length).toBeGreaterThan(20);
    }
  });

  it("names a real student on every revocation", () => {
    const regNos = new Set(students.map((s) => s.regNo));
    for (const e of eventsOfKind(events, "award.revoked")) {
      expect(regNos.has(e.studentRegNo)).toBe(true);
    }
  });

  it("keeps the log in chronological order", () => {
    const times = events.map((e) => e.at);
    expect(times).toEqual([...times].sort());
  });

  it("agrees with its own semester resolution", () => {
    for (const e of events) {
      if (e.kind === "award.granted" || e.kind === "award.revoked") {
        expect(e.semester).toBe(semesterOf(e.effectiveFrom));
      }
    }
  });
});
