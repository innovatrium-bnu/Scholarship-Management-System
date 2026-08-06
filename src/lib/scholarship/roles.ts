/**
 * What each role is allowed to do.
 *
 * There is no authentication yet, so this cannot keep anyone out — a
 * determined user can switch role in the top bar. It exists so the screens
 * are built against a real permission model from the start: when auth lands,
 * `can()` starts reading a session instead of a picked role, and no screen
 * has to change.
 *
 * The split follows the office rather than the software. The Registrar Office
 * owns student data and awards; the Scholarship Committee judges applications
 * but must not be able to edit the CGPA it is judging against; Finance reads
 * everything and changes nothing.
 */
import type { Role } from "./types";

export type Capability =
  /** Open the review queue and read applications. */
  | "applications.read"
  /** Approve, reject, or hold an application. */
  | "applications.decide"
  /** Edit a student's own record. */
  | "students.edit"
  /** Change the eligibility criteria the filter applies. */
  | "criteria.edit"
  /** Award or take back a scholarship by hand. */
  | "awards.manage"
  /** Create, change, or retire a scholarship. */
  | "scholarships.edit";

const MATRIX: Record<Role, Capability[]> = {
  "Registrar Office": [
    "applications.read",
    "applications.decide",
    "students.edit",
    "criteria.edit",
    "awards.manage",
    "scholarships.edit",
  ],
  "Scholarship Committee": ["applications.read", "applications.decide"],
  Finance: ["applications.read"],
  Admin: [
    "applications.read",
    "applications.decide",
    "students.edit",
    "criteria.edit",
    "awards.manage",
    "scholarships.edit",
  ],
};

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].includes(capability);
}

/** One line describing the role, shown next to the switcher. */
export const ROLE_BLURB: Record<Role, string> = {
  "Registrar Office": "Owns student records, awards, and criteria",
  "Scholarship Committee": "Judges applications, cannot edit student data",
  Finance: "Read-only view of awards and coverage",
  Admin: "Full access, including lookups and settings",
};

/** Initials for the avatar in the top bar. */
export const ROLE_INITIALS: Record<Role, string> = {
  "Registrar Office": "RO",
  "Scholarship Committee": "SC",
  Finance: "FI",
  Admin: "AD",
};
