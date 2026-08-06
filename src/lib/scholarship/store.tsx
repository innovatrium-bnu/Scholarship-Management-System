import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type {
  Award,
  AuditEntry,
  AssignmentBatch,
  EligibilityCriteria,
  NeedApplication,
  Revocation,
  Role,
  Scholarship,
  Student,
} from "./types";
import type { RevocationCause } from "./types";
import type { DomainEvent } from "./events";
import {
  dateOfSemester,
  seedApplications,
  seedAudit,
  seedAwards,
  seedBatches,
  seedCriteria,
  seedEvents,
  seedScholarships,
  seedStudents,
  semesterOf,
} from "./seed";

interface StoreState {
  scholarships: Scholarship[];
  students: Student[];
  awards: Award[];
  audit: AuditEntry[];
  feeHeads: string[];
  batches: AssignmentBatch[];
  applications: NeedApplication[];
  criteria: EligibilityCriteria[];
  /**
   * Machine-readable record of what happened, for counting. See
   * [events.ts](./events.ts) for why this sits beside the audit log rather
   * than replacing it.
   */
  events: DomainEvent[];
  /**
   * The earliest moment this data can speak to. Anything asked about a period
   * before it is unanswerable, and must be refused rather than answered "none".
   */
  historyStartedAt: string;
  /**
   * Who is using the system. Stands in for a session until authentication
   * exists; it decides what screens allow and whose name the audit log
   * records.
   */
  role: Role;
}

interface StoreCtx extends StoreState {
  setRole: (r: Role) => void;
  addScholarship: (s: Scholarship, reason: string) => void;
  updateScholarship: (id: string, patch: Partial<Scholarship>, reason: string) => void;
  archiveScholarship: (id: string, endExisting: boolean, semester: string) => void;
  restoreScholarship: (id: string, reason: string) => void;
  addAward: (a: Award) => void;
  /** Change one student's amounts by hand, without touching the scholarship. */
  editAwardByHand: (awardId: string, components: Award["components"], reason: string) => void;
  revokeAward: (
    id: string,
    reason: string,
    effective: string,
    timing: "immediate" | "next",
  ) => void;
  updateAwardComponent: (
    awardId: string,
    feeHead: string,
    patch: { isOverridden?: boolean; overrideReason?: string; overrideAuthority?: string },
  ) => void;
  pushAudit: (e: Omit<AuditEntry, "id" | "timestamp">) => void;
  reorderScholarships: (orderedIds: string[]) => void;
  addFeeHead: (name: string) => void;
  deleteFeeHead: (name: string) => boolean;
  assignBatch: (
    scholarshipId: string,
    picks: {
      student: Student;
      components: Award["components"];
      overrideAuthority?: string;
      overrideRef?: string;
      overrideReason?: string;
    }[],
    mode: "Evaluate" | "Direct",
    reason: string,
  ) => string;
  undoBatch: (batchId: string) => void;
  /** Edit a student's own record. Admissions data, so every change is logged. */
  updateStudent: (regNo: string, patch: Partial<Student>, reason: string) => void;
  /**
   * Take in one application.
   *
   * Nothing in the UI calls this: students do not apply here. This system is
   * the Registrar Office's, and applications reach it from the admission
   * portal. This is the door they come through when that import is built, and
   * it is kept so the intake has one audited entry point rather than being
   * invented twice.
   */
  submitApplication: (a: NeedApplication) => void;
  /**
   * Record a decision on one application. Approving also creates the award, so
   * the two can never disagree about whether a student was given the money.
   */
  decideApplication: (
    id: string,
    outcome: "Approved" | "Rejected" | "On hold",
    reason: string,
    opts?: { awardedPct?: number; automatic?: boolean },
  ) => void;
  /** Turn down every listed application at once, each with its own reason. */
  rejectApplications: (entries: { id: string; reason: string }[], summary: string) => void;
  /** Put a decided application back in the queue. */
  reopenApplication: (id: string, reason: string) => void;
  updateCriteria: (
    scholarshipId: string,
    patch: Partial<EligibilityCriteria>,
    reason: string,
  ) => void;
}

const Ctx = createContext<StoreCtx | null>(null);

function makeInitial(): StoreState {
  const scholarships = seedScholarships();
  const students = seedStudents();
  const awards = seedAwards(students);
  const events = seedEvents(awards);
  return {
    scholarships,
    students,
    awards,
    audit: seedAudit(),
    feeHeads: ["Tuition", "Hostel", "Mess", "Other"],
    batches: seedBatches(),
    applications: seedApplications(students, awards),
    criteria: seedCriteria(),
    events,
    historyStartedAt: events.reduce(
      (earliest, e) => (e.at < earliest ? e.at : earliest),
      new Date().toISOString(),
    ),
    role: "Registrar Office",
  };
}

/**
 * Build a revocation record from whatever the caller had to hand.
 *
 * The revoke dialog asks for a term ("Fall 2025"); archiving a scholarship also
 * works in terms; reopening an application has only today's date. Normalising
 * here means every revocation carries both a date and a term, so a report can
 * group by term without each caller having to derive one.
 */
function makeRevocation(opts: {
  at: string;
  /** Either an ISO date or a SEMESTERS label — both are accepted. */
  effective: string;
  timing: "immediate" | "next";
  cause: RevocationCause;
  reason: string;
  by: string;
}): Revocation {
  const isDate = /^\d{4}-\d{2}-\d{2}/.test(opts.effective);
  return {
    at: opts.at,
    effectiveFrom: isDate ? opts.effective.slice(0, 10) : dateOfSemester(opts.effective),
    semester: isDate ? semesterOf(opts.effective) : opts.effective,
    timing: opts.timing,
    cause: opts.cause,
    reason: opts.reason,
    by: opts.by,
  };
}

function revokedEvent(award: Award, r: Revocation, actor: string): DomainEvent {
  return {
    kind: "award.revoked",
    at: r.at,
    actor,
    awardId: award.id,
    studentRegNo: award.studentRegNo,
    scholarshipId: award.scholarshipId,
    effectiveFrom: r.effectiveFrom,
    semester: r.semester,
    timing: r.timing,
    cause: r.cause,
    reason: r.reason,
  };
}

function grantedEvent(award: Award, actor: string, at: string): DomainEvent {
  return {
    kind: "award.granted",
    at,
    actor,
    awardId: award.id,
    studentRegNo: award.studentRegNo,
    scholarshipId: award.scholarshipId,
    effectiveFrom: award.effectiveFrom,
    semester: semesterOf(award.effectiveFrom),
    batchId: award.batchId,
  };
}

/**
 * Append audit entries and events together.
 *
 * Every mutation has to write both, and the two had drifted: three of the four
 * paths that revoked an award wrote no award-level record at all. Funnelling
 * them through one function means a new mutation has one obvious place to say
 * what it did, rather than two spread blocks to copy and one to forget.
 */
function record(
  s: StoreState,
  opts: {
    audit?: Omit<AuditEntry, "id" | "timestamp">[];
    events?: DomainEvent[];
    /** Shared timestamp, so entries written together agree on when. */
    at?: string;
  },
): Pick<StoreState, "audit" | "events"> {
  const now = opts.at ?? new Date().toISOString();
  const entries: AuditEntry[] = (opts.audit ?? []).map((e, i) => ({
    ...e,
    id: `au-${s.audit.length + 1 + i}`,
    timestamp: now,
  }));
  return {
    // Newest first, matching how AuditPanel reads it.
    audit: [...entries.reverse(), ...s.audit],
    // Oldest first — an append-only log reads forwards.
    events: [...s.events, ...(opts.events ?? [])],
  };
}

export function ScholarshipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(() => makeInitial());

  const pushAudit = useCallback((e: Omit<AuditEntry, "id" | "timestamp">) => {
    setState((s) => ({
      ...s,
      audit: [
        {
          ...e,
          id: `au-${s.audit.length + 1}`,
          timestamp: new Date().toISOString(),
        },
        ...s.audit,
      ],
    }));
  }, []);

  const addScholarship = useCallback((sch: Scholarship, reason: string) => {
    setState((s) => ({
      ...s,
      scholarships: [...s.scholarships, sch],
      audit: [
        {
          id: `au-${s.audit.length + 1}`,
          entityType: "Scholarship",
          entityId: sch.id,
          action: "Created",
          newValue: sch,
          reason,
          actor: s.role,
          timestamp: new Date().toISOString(),
        },
        ...s.audit,
      ],
    }));
  }, []);

  /**
   * A scholarship has one set of terms for life, so an edit simply replaces
   * them. There are no versions to reconcile: if the terms genuinely need to
   * differ for a newer intake, that is a separate scholarship scoped to those
   * batches.
   */
  const updateScholarship = useCallback(
    (id: string, patch: Partial<Scholarship>, reason: string) => {
      setState((s) => {
        const old = s.scholarships.find((x) => x.id === id);
        if (!old) return s;
        const updated: Scholarship = { ...old, ...patch };
        return {
          ...s,
          scholarships: s.scholarships.map((x) => (x.id === id ? updated : x)),
          audit: [
            {
              id: `au-${s.audit.length + 1}`,
              entityType: "Scholarship",
              entityId: id,
              action: "Changed the rules",
              oldValue: old,
              newValue: updated,
              reason,
              actor: s.role,
              timestamp: new Date().toISOString(),
            },
            ...s.audit,
          ],
        };
      });
    },
    [],
  );

  const archiveScholarship = useCallback((id: string, endExisting: boolean, semester: string) => {
    setState((s) => {
      const scholarships = s.scholarships.map((x) =>
        x.id === id ? { ...x, status: "Archived" as const } : x,
      );
      const name = s.scholarships.find((x) => x.id === id)?.name ?? id;
      const now = new Date().toISOString();

      /* Retiring a scholarship can end dozens of awards at once. Until this,
         it did so with a single scholarship-level audit line and nothing on
         any award, so a student could lose their funding leaving no record
         against their own name. Each ending now gets its own event. */
      const ending = endExisting
        ? s.awards.filter((a) => a.scholarshipId === id && a.status === "Active")
        : [];
      const revocationFor = (): Revocation =>
        makeRevocation({
          at: now,
          effective: semester,
          timing: "next",
          cause: "Scholarship archived",
          reason: `${name} was retired, and existing awards were ended from ${semester}.`,
          by: s.role,
        });

      const endingIds = new Set(ending.map((a) => a.id));
      const awards = s.awards.map((a) =>
        endingIds.has(a.id) ? { ...a, status: "Revoked" as const, revocation: revocationFor() } : a,
      );

      return {
        ...s,
        scholarships,
        awards,
        ...record(s, {
          at: now,
          audit: [
            {
              entityType: "Scholarship",
              entityId: id,
              action: endExisting
                ? `Archived and ended ${ending.length} award${ending.length === 1 ? "" : "s"} from ${semester}`
                : "Archived (no new awards)",
              actor: s.role,
            },
          ],
          events: ending.map((a) => revokedEvent(a, revocationFor(), s.role)),
        }),
      };
    });
  }, []);

  /* Nothing is ever deleted. Archiving is reversible, so a scholarship retired
     by mistake can be put straight back without losing its history. */
  const restoreScholarship = useCallback((id: string, reason: string) => {
    setState((s) => ({
      ...s,
      scholarships: s.scholarships.map((x) =>
        x.id === id ? { ...x, status: "Active" as const } : x,
      ),
      audit: [
        {
          id: `au-${s.audit.length + 1}`,
          entityType: "Scholarship",
          entityId: id,
          action: "Brought back into use",
          reason,
          actor: s.role,
          timestamp: new Date().toISOString(),
        },
        ...s.audit,
      ],
    }));
  }, []);

  /**
   * Change the amounts on one student's award by hand.
   *
   * This is the escape hatch for the cases the rules cannot express: a
   * committee decision, a correction, a one-off arrangement. It touches only
   * this student, never the scholarship, and it always records a reason.
   */
  const editAwardByHand = useCallback(
    (awardId: string, components: Award["components"], reason: string) => {
      setState((s) => {
        const old = s.awards.find((a) => a.id === awardId);
        if (!old) return s;
        const updated: Award = { ...old, components, editedByHand: true, editReason: reason };
        return {
          ...s,
          awards: s.awards.map((a) => (a.id === awardId ? updated : a)),
          audit: [
            {
              id: `au-${s.audit.length + 1}`,
              entityType: "Award",
              entityId: awardId,
              action: "Amounts changed by hand",
              oldValue: old.components,
              newValue: components,
              reason,
              actor: s.role,
              timestamp: new Date().toISOString(),
            },
            ...s.audit,
          ],
        };
      });
    },
    [],
  );

  const addAward = useCallback((a: Award) => {
    setState((s) => {
      const now = new Date().toISOString();
      return {
        ...s,
        awards: [...s.awards, a],
        ...record(s, {
          at: now,
          audit: [
            {
              entityType: "Award",
              entityId: a.id,
              action: "Awarded",
              newValue: a,
              actor: s.role,
            },
          ],
          events: [grantedEvent(a, s.role, now)],
        }),
      };
    });
  }, []);

  const revokeAward = useCallback(
    (id: string, reason: string, effective: string, timing: "immediate" | "next") => {
      setState((s) => {
        const award = s.awards.find((a) => a.id === id);
        if (!award) return s;
        const now = new Date().toISOString();
        const revocation = makeRevocation({
          at: now,
          effective,
          timing,
          cause: "Revoked by hand",
          reason,
          by: s.role,
        });
        return {
          ...s,
          awards: s.awards.map((a) =>
            a.id === id ? { ...a, status: "Revoked" as const, revocation } : a,
          ),
          ...record(s, {
            at: now,
            audit: [
              {
                entityType: "Award",
                entityId: id,
                action: `Revoked (${timing === "immediate" ? "immediate" : "next session"}, from ${effective})`,
                reason,
                actor: s.role,
              },
            ],
            events: [revokedEvent(award, revocation, s.role)],
          }),
        };
      });
    },
    [],
  );

  const updateAwardComponent = useCallback(
    (
      awardId: string,
      feeHead: string,
      patch: { isOverridden?: boolean; overrideReason?: string; overrideAuthority?: string },
    ) => {
      setState((s) => ({
        ...s,
        awards: s.awards.map((a) =>
          a.id === awardId
            ? {
                ...a,
                components: a.components.map((c) =>
                  c.feeHead === feeHead ? { ...c, ...patch } : c,
                ),
              }
            : a,
        ),
      }));
    },
    [],
  );

  const reorderScholarships = useCallback((orderedIds: string[]) => {
    setState((s) => {
      const byId = new Map(s.scholarships.map((x) => [x.id, x]));
      const next = orderedIds.map((id) => byId.get(id)).filter((x): x is Scholarship => !!x);
      // append any missing (shouldn't happen)
      for (const x of s.scholarships) if (!orderedIds.includes(x.id)) next.push(x);
      return {
        ...s,
        scholarships: next,
        audit: [
          {
            id: `au-${s.audit.length + 1}`,
            entityType: "Scholarship",
            entityId: "precedence",
            action: "Reordered scholarship precedence",
            actor: s.role,
            timestamp: new Date().toISOString(),
          },
          ...s.audit,
        ],
      };
    });
  }, []);

  const addFeeHead = useCallback((name: string) => {
    setState((s) => (s.feeHeads.includes(name) ? s : { ...s, feeHeads: [...s.feeHeads, name] }));
  }, []);

  const deleteFeeHead = useCallback((name: string) => {
    let ok = true;
    setState((s) => {
      const inUse = s.scholarships.some(
        (sch) => sch.status === "Active" && sch.coverage.some((c) => c.feeHead === name),
      );
      if (inUse) {
        ok = false;
        return s;
      }
      return { ...s, feeHeads: s.feeHeads.filter((f) => f !== name) };
    });
    return ok;
  }, []);

  const assignBatch = useCallback(
    (
      scholarshipId: string,
      picks: {
        student: Student;
        components: Award["components"];
        overrideAuthority?: string;
        overrideRef?: string;
        overrideReason?: string;
      }[],
      mode: "Evaluate" | "Direct",
      reason: string,
    ): string => {
      const batchId = `bat-${Date.now()}`;
      setState((s) => {
        const sch = s.scholarships.find((x) => x.id === scholarshipId);
        const now = new Date().toISOString();
        const newAwards: Award[] = picks.map((p, i) => ({
          id: `aw-${Date.now()}-${i}`,
          studentRegNo: p.student.regNo,
          scholarshipId,
          status: "Active" as const,
          components: p.components,
          effectiveFrom: now.slice(0, 10),
          authorisedBy: p.overrideAuthority ?? "Registrar Office",
          reasonCode: p.overrideRef ? `Override: ${p.overrideRef}` : reason,
          batchId,
        }));
        const batch: AssignmentBatch = {
          id: batchId,
          scholarshipId,
          actor: s.role,
          timestamp: now,
          reason,
          mode,
          awardIds: newAwards.map((a) => a.id),
          undone: false,
        };
        return {
          ...s,
          awards: [...s.awards, ...newAwards],
          batches: [batch, ...s.batches],
          ...record(s, {
            at: now,
            audit: [
              {
                entityType: "Batch",
                entityId: batchId,
                action: `Assigned ${sch?.name ?? scholarshipId} to ${newAwards.length} student${newAwards.length === 1 ? "" : "s"} (${mode})`,
                reason,
                actor: s.role,
                newValue: { awardIds: newAwards.map((a) => a.id) },
              },
            ],
            events: newAwards.map((a) => grantedEvent(a, s.role, now)),
          }),
        };
      });
      return batchId;
    },
    [],
  );

  /**
   * Undo a batch assignment.
   *
   * The awards are deleted rather than revoked, deliberately: an undone
   * mis-click is not something a student ever held, and it should not appear on
   * their financial record as a scholarship that was taken away from them. The
   * history is not lost — the grant and this undo are both on the event log, so
   * counts still reconcile, and revocation reports exclude undone awards
   * because they were never revoked.
   */
  const undoBatch = useCallback((batchId: string) => {
    setState((s) => {
      const batch = s.batches.find((b) => b.id === batchId);
      if (!batch || batch.undone) return s;
      const now = new Date().toISOString();
      const removed = s.awards.filter((a) => batch.awardIds.includes(a.id));
      return {
        ...s,
        awards: s.awards.filter((a) => !batch.awardIds.includes(a.id)),
        batches: s.batches.map((b) => (b.id === batchId ? { ...b, undone: true } : b)),
        ...record(s, {
          at: now,
          audit: [
            {
              entityType: "Batch",
              entityId: batchId,
              action: `Undid batch, removed ${batch.awardIds.length} awards`,
              actor: s.role,
            },
          ],
          events: removed.map((a) => ({
            kind: "award.undone" as const,
            at: now,
            actor: s.role,
            awardId: a.id,
            studentRegNo: a.studentRegNo,
            scholarshipId: a.scholarshipId,
            batchId,
          })),
        }),
      };
    });
  }, []);

  const setRole = useCallback((role: Role) => {
    setState((s) => (s.role === role ? s : { ...s, role }));
  }, []);

  /**
   * Admissions data is argued over. Appeals, corrections and disputes all end
   * up asking "what did this field say before, and who changed it", so every
   * changed field is logged one by one rather than as one opaque object diff.
   */
  const updateStudent = useCallback((regNo: string, patch: Partial<Student>, reason: string) => {
    setState((s) => {
      const old = s.students.find((x) => x.regNo === regNo);
      if (!old) return s;
      const changed = (Object.keys(patch) as (keyof Student)[]).filter(
        (k) => patch[k] !== undefined && patch[k] !== old[k],
      );
      if (changed.length === 0) return s;
      const updated: Student = { ...old, ...patch };
      const now = new Date().toISOString();
      const entries: AuditEntry[] = changed.map((k, i) => ({
        id: `au-${s.audit.length + 1 + i}`,
        entityType: "Student",
        entityId: regNo,
        action: `Changed ${String(k)}`,
        oldValue: old[k],
        newValue: updated[k],
        reason,
        actor: s.role,
        timestamp: now,
      }));
      return {
        ...s,
        students: s.students.map((x) => (x.regNo === regNo ? updated : x)),
        audit: [...entries.reverse(), ...s.audit],
      };
    });
  }, []);

  const submitApplication = useCallback((a: NeedApplication) => {
    setState((s) => ({
      ...s,
      applications: [a, ...s.applications],
      audit: [
        {
          id: `au-${s.audit.length + 1}`,
          entityType: "Application",
          entityId: a.id,
          action: `Applied for a need-based scholarship (${a.semester})`,
          newValue: { requestedPct: a.requestedPct, monthlyIncome: a.household.monthlyIncome },
          actor: a.studentRegNo,
          timestamp: new Date().toISOString(),
        },
        ...s.audit,
      ],
    }));
  }, []);

  /**
   * Approving is the only place an application turns into money. It creates
   * the award in the same update, so there is never a moment where a student
   * is "approved" but holds nothing, and the award carries the application id
   * so either one can be traced back to the other.
   */
  const decideApplication = useCallback(
    (
      id: string,
      outcome: "Approved" | "Rejected" | "On hold",
      reason: string,
      opts?: { awardedPct?: number; automatic?: boolean },
    ) => {
      setState((s) => {
        const app = s.applications.find((a) => a.id === id);
        if (!app) return s;
        const now = new Date().toISOString();
        const actor = opts?.automatic ? "Eligibility filter" : s.role;

        let awards = s.awards;
        let awardId: string | undefined;
        const granted: DomainEvent[] = [];
        if (outcome === "Approved") {
          const pct = opts?.awardedPct ?? app.requestedPct;
          awardId = `aw-${Date.now()}`;
          const award: Award = {
            id: awardId,
            studentRegNo: app.studentRegNo,
            scholarshipId: app.scholarshipId,
            status: "Active",
            components: [
              {
                feeHead: "Tuition",
                entitlement: pct,
                entitlementKind: "Percentage",
                entitlementValue: pct,
                applied: 0,
                isOverridden: false,
              },
            ],
            effectiveFrom: now.slice(0, 10),
            authorisedBy: s.role,
            reasonCode: `Application ${app.id}`,
          };
          awards = [...s.awards, award];
          granted.push(grantedEvent(award, actor, now));
        }

        return {
          ...s,
          awards,
          applications: s.applications.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status: outcome,
                  decision: {
                    outcome,
                    by: actor,
                    role: s.role,
                    at: now,
                    reason,
                    automatic: opts?.automatic,
                    awardedPct:
                      outcome === "Approved" ? (opts?.awardedPct ?? a.requestedPct) : undefined,
                    awardId,
                  },
                }
              : a,
          ),
          ...record(s, {
            at: now,
            audit: [
              {
                entityType: "Application",
                entityId: id,
                action: opts?.automatic
                  ? "Turned down automatically for failing the eligibility criteria"
                  : outcome === "Approved"
                    ? `Approved at ${opts?.awardedPct ?? app.requestedPct}% of tuition`
                    : outcome === "Rejected"
                      ? "Turned down"
                      : "Put on hold",
                oldValue: app.status,
                newValue: outcome,
                reason,
                actor,
              },
            ],
            events: [
              {
                kind: "application.decided",
                at: now,
                actor,
                applicationId: id,
                studentRegNo: app.studentRegNo,
                outcome,
                automatic: opts?.automatic ?? false,
                semester: app.semester,
              },
              ...granted,
            ],
          }),
        };
      });
    },
    [],
  );

  const rejectApplications = useCallback(
    (entries: { id: string; reason: string }[], summary: string) => {
      if (entries.length === 0) return;
      setState((s) => {
        const byId = new Map(entries.map((e) => [e.id, e.reason]));
        const now = new Date().toISOString();
        const hit = s.applications.filter((a) => byId.has(a.id));
        if (hit.length === 0) return s;
        return {
          ...s,
          applications: s.applications.map((a) =>
            byId.has(a.id)
              ? {
                  ...a,
                  status: "Rejected" as const,
                  decision: {
                    outcome: "Rejected" as const,
                    by: "Eligibility filter",
                    role: s.role,
                    at: now,
                    reason: byId.get(a.id)!,
                    automatic: true,
                  },
                }
              : a,
          ),
          audit: [
            {
              id: `au-${s.audit.length + 1}`,
              entityType: "Application",
              entityId: "bulk",
              action: `Turned down ${hit.length} application${hit.length === 1 ? "" : "s"} that failed the eligibility criteria`,
              newValue: { ids: hit.map((a) => a.id) },
              reason: summary,
              actor: s.role,
              timestamp: now,
            },
            ...s.audit,
          ],
        };
      });
    },
    [],
  );

  /**
   * Undo a decision. Any award the approval created is revoked in the same
   * step, otherwise reopening would quietly leave the student holding money
   * the committee no longer stands behind.
   */
  const reopenApplication = useCallback((id: string, reason: string) => {
    setState((s) => {
      const app = s.applications.find((a) => a.id === id);
      if (!app || !app.decision) return s;
      const now = new Date().toISOString();
      const madeAward = app.decision.awardId;
      const award = madeAward ? s.awards.find((a) => a.id === madeAward) : undefined;

      /* Reopening takes back the award the approval created. That is a student
         losing funding, so it belongs on the event log under its own cause —
         it used to happen with no award-level record at all. */
      const revocation = award
        ? makeRevocation({
            at: now,
            effective: now,
            timing: "immediate",
            cause: "Application reopened",
            reason: `Application ${id} was reopened for review: ${reason}`,
            by: s.role,
          })
        : undefined;

      return {
        ...s,
        awards:
          award && revocation
            ? s.awards.map((a) =>
                a.id === award.id ? { ...a, status: "Revoked" as const, revocation } : a,
              )
            : s.awards,
        applications: s.applications.map((a) =>
          a.id === id ? { ...a, status: "Submitted" as const, decision: undefined } : a,
        ),
        ...record(s, {
          at: now,
          audit: [
            {
              entityType: "Application",
              entityId: id,
              action: madeAward
                ? "Reopened for review, and the award it created was taken back"
                : "Reopened for review",
              oldValue: app.status,
              newValue: "Submitted",
              reason,
              actor: s.role,
            },
          ],
          events: award && revocation ? [revokedEvent(award, revocation, s.role)] : [],
        }),
      };
    });
  }, []);

  const updateCriteria = useCallback(
    (scholarshipId: string, patch: Partial<EligibilityCriteria>, reason: string) => {
      setState((s) => {
        const old = s.criteria.find((c) => c.scholarshipId === scholarshipId);
        if (!old) return s;
        const updated = { ...old, ...patch };
        return {
          ...s,
          criteria: s.criteria.map((c) => (c.scholarshipId === scholarshipId ? updated : c)),
          audit: [
            {
              id: `au-${s.audit.length + 1}`,
              entityType: "Criteria",
              entityId: scholarshipId,
              action: "Changed the eligibility criteria",
              oldValue: old,
              newValue: updated,
              reason,
              actor: s.role,
              timestamp: new Date().toISOString(),
            },
            ...s.audit,
          ],
        };
      });
    },
    [],
  );

  const value = useMemo<StoreCtx>(
    () => ({
      ...state,
      setRole,
      updateStudent,
      submitApplication,
      decideApplication,
      rejectApplications,
      reopenApplication,
      updateCriteria,
      addScholarship,
      updateScholarship,
      archiveScholarship,
      restoreScholarship,
      addAward,
      editAwardByHand,
      revokeAward,
      updateAwardComponent,
      pushAudit,
      reorderScholarships,
      addFeeHead,
      deleteFeeHead,
      assignBatch,
      undoBatch,
    }),
    [
      state,
      setRole,
      updateStudent,
      submitApplication,
      decideApplication,
      rejectApplications,
      reopenApplication,
      updateCriteria,
      addScholarship,
      updateScholarship,
      archiveScholarship,
      restoreScholarship,
      addAward,
      editAwardByHand,
      revokeAward,
      updateAwardComponent,
      pushAudit,
      reorderScholarships,
      addFeeHead,
      deleteFeeHead,
      assignBatch,
      undoBatch,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used within ScholarshipProvider");
  return c;
}
