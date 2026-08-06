/**
 * Screening for the whole application queue, in one place.
 *
 * The screening verdict is derived on every read rather than frozen onto the
 * application when it was submitted. That is deliberate: the criteria are
 * editable, and if a threshold moves the queue has to move with it. An officer
 * who lowers the CGPA floor should see the affected applications come straight
 * back into the queue, not have to resubmit them.
 *
 * Decisions, by contrast, *are* stored — once a person has ruled on an
 * application, changing a threshold must not silently rewrite what they
 * decided.
 */
import { useMemo } from "react";
import { useStore } from "./store";
import { computeMerge } from "./merge";
import { screen, type Screening } from "./screening";
import type { EligibilityCriteria, NeedApplication, Student } from "./types";

export interface ScreenedApplication {
  app: NeedApplication;
  student: Student;
  screening: Screening;
  /** Tuition already paid for by awards this application did not create. */
  existingCoveragePct: number;
}

/** An application still waiting on, or subject to, a decision. */
const LIVE: NeedApplication["status"][] = ["Submitted", "On hold", "Approved"];

export function useScreenedApplications(): ScreenedApplication[] {
  const { applications, students, awards, scholarships, criteria } = useStore();

  return useMemo(() => {
    const studentBy = new Map(students.map((s) => [s.regNo, s]));
    const criteriaBy = new Map(criteria.map((c) => [c.scholarshipId, c]));

    /* An earlier live application for the same scholarship and term makes any
       later one a duplicate. Sorting by submission time first means the one
       the student actually filed first is the one that survives. */
    const firstLive = new Map<string, string>();
    for (const a of [...applications].sort((x, y) => x.submittedAt.localeCompare(y.submittedAt))) {
      if (!LIVE.includes(a.status)) continue;
      const key = `${a.studentRegNo}|${a.scholarshipId}|${a.semester}`;
      if (!firstLive.has(key)) firstLive.set(key, a.id);
    }

    const out: ScreenedApplication[] = [];
    for (const app of applications) {
      const student = studentBy.get(app.studentRegNo);
      const rules = criteriaBy.get(app.scholarshipId);
      if (!student || !rules) continue;

      /* Coverage from other scholarships only. The award this application
         itself produced must not count against it, or every approved
         application would immediately look over-covered. */
      const otherAwards = awards.filter(
        (a) =>
          a.studentRegNo === app.studentRegNo &&
          a.status === "Active" &&
          a.id !== app.decision?.awardId,
      );
      const existingCoveragePct = computeMerge(student, otherAwards, scholarships).reduce(
        (total, m) => total + (m.components.find((c) => c.feeHead === "Tuition")?.appliedPct ?? 0),
        0,
      );

      const key = `${app.studentRegNo}|${app.scholarshipId}|${app.semester}`;
      const canonical = firstLive.get(key);

      out.push({
        app,
        student,
        existingCoveragePct,
        screening: screen(app, student, rules, {
          existingCoveragePct,
          duplicateOf: canonical && canonical !== app.id ? canonical : undefined,
        }),
      });
    }
    return out;
  }, [applications, students, awards, scholarships, criteria]);
}

export function useNeedCriteria(scholarshipId = "sch-need"): EligibilityCriteria | undefined {
  const { criteria } = useStore();
  return criteria.find((c) => c.scholarshipId === scholarshipId);
}
