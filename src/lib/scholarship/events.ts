/**
 * The event log: what happened, when, in a shape code can count.
 *
 * This sits beside the audit log rather than replacing it, because the two
 * answer different questions. `AuditEntry` answers "who changed this record and
 * why", is scoped to one entity, and is written to be read by a person —
 * `AuditPanel` renders its `action` sentence directly. A `DomainEvent` answers
 * "how many, when, of what kind" across the whole system, and is only ever read
 * by code.
 *
 * Trying to serve both from one record is what produced the bug this module
 * exists to fix: `revokeAward` used to record the term an award ended by
 * interpolating it into the sentence `Revoked (immediate, from Fall 2025)`, so
 * the only way to count last semester's revocations was to regex English. One
 * copy-edit to that string and the count silently becomes zero forever.
 *
 * Every field here is machine-readable, and `semester` is resolved once at
 * write time rather than derived from a date at read time by whoever is asking.
 *
 * This is also the table the PostgreSQL backend will want, more or less as-is.
 */
import type { RevocationCause } from "./types";

interface EventBase {
  /** ISO timestamp of when this was recorded. */
  at: string;
  /** The role that caused it, or "Eligibility filter" for automatic actions. */
  actor: string;
}

export type DomainEvent =
  | (EventBase & {
      kind: "award.granted";
      awardId: string;
      studentRegNo: string;
      scholarshipId: string;
      /** When the award starts paying. */
      effectiveFrom: string;
      /** `effectiveFrom` as a SEMESTERS label. */
      semester: string;
      batchId?: string;
    })
  | (EventBase & {
      kind: "award.revoked";
      awardId: string;
      studentRegNo: string;
      scholarshipId: string;
      /** When the money stops. */
      effectiveFrom: string;
      /** `effectiveFrom` as a SEMESTERS label. */
      semester: string;
      timing: "immediate" | "next";
      cause: RevocationCause;
      reason: string;
    })
  | (EventBase & {
      /**
       * A batch assignment was undone. The awards are deleted outright rather
       * than revoked, because an undone mis-click is not part of a student's
       * financial record — but the grant and the undo both stay on this log, so
       * counts still reconcile and the history is not lost.
       */
      kind: "award.undone";
      awardId: string;
      studentRegNo: string;
      scholarshipId: string;
      batchId: string;
    })
  | (EventBase & {
      kind: "application.decided";
      applicationId: string;
      studentRegNo: string;
      outcome: "Approved" | "Rejected" | "On hold";
      /** True when the eligibility filter decided it, not a person. */
      automatic: boolean;
      semester: string;
    });

export type DomainEventKind = DomainEvent["kind"];

/** Narrow a mixed log to one kind, keeping the specific member type. */
export function eventsOfKind<K extends DomainEventKind>(
  events: readonly DomainEvent[],
  kind: K,
): Extract<DomainEvent, { kind: K }>[] {
  return events.filter((e): e is Extract<DomainEvent, { kind: K }> => e.kind === kind);
}
