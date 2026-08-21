/**
 * What each role is allowed to do.
 *
 * The four roles are the ones BNU asked for, and they are graded by how much
 * damage a mistake does rather than by which office someone sits in. Reporting
 * can only look; Data Entry can correct a record but cannot decide who gets
 * money; Admin runs the scholarship cycle; Super Admin also administers the
 * system itself. More will be added as the university names them — nothing
 * here assumes there are exactly four.
 *
 * This is the display half of the model. `App\Auth\RoleMatrix` is the enforcing
 * half, and `RoleMatrixTest` parses this file and fails if the two disagree.
 * The duplication is deliberate: serving the matrix from the API would mean the
 * server asking the client what the client is allowed to do.
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
  | "scholarships.edit"
  /**
   * Create accounts and set what role they hold.
   *
   * The one capability no screen draws yet — there is no user administration
   * page and no endpoint behind it. It is declared because it is the whole
   * difference between Super Admin and Admin, and because a capability that
   * exists in the matrix is enforced the moment a route names it. Declaring it
   * now is what stops the first user-management endpoint from being written
   * with no gate at all.
   */
  | "users.manage";

const MATRIX: Record<Role, Capability[]> = {
  "Super Admin": [
    "applications.read",
    "applications.decide",
    "students.edit",
    "criteria.edit",
    "awards.manage",
    "scholarships.edit",
    "users.manage",
  ],
  Admin: [
    "applications.read",
    "applications.decide",
    "students.edit",
    "criteria.edit",
    "awards.manage",
    "scholarships.edit",
  ],
  /* Data Entry keeps records straight and prepares applications for review. It
     deliberately stops short of `applications.decide` and `awards.manage`:
     entering the numbers a decision rests on and making the decision are the
     two halves that have to stay in different hands. */
  "Data Entry": ["applications.read", "students.edit"],
  /* Reporting is read-only by construction. Every read route is gated on being
     signed in, so this list is what it may do beyond looking. */
  Reporting: ["applications.read"],
};

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].includes(capability);
}

/** One line describing the role, shown next to the switcher. */
export const ROLE_BLURB: Record<Role, string> = {
  "Super Admin": "Full access, including accounts, lookups, and settings",
  Admin: "Runs the scholarship cycle: scholarships, awards, criteria, decisions",
  "Data Entry": "Enters and corrects student and application records",
  Reporting: "Read-only. Reports, coverage, and the review queue",
};

/** Initials for the avatar in the top bar. */
export const ROLE_INITIALS: Record<Role, string> = {
  "Super Admin": "SA",
  Admin: "AD",
  "Data Entry": "DE",
  Reporting: "RP",
};
