export type FeeHead = string;
export const CORE_FEE_HEADS: readonly string[] = ["Tuition", "Hostel", "Mess", "Other"];
export type StudyLevel = "Bachelors" | "Masters" | "Both";
export type BenefitKind = "Percentage" | "Full waiver" | "Fixed amount";
export type ReviewCycle = "Every semester" | "Annual";
export type RuleKind = "Automatic" | "Manual" | "Calculated score" | "Cohort rank";

export interface CoverageLine {
  id: string;
  feeHead: FeeHead;
  benefitKind: BenefitKind;
  value: number;
  conditionalOn?: string;
}

export interface Rule {
  id: string;
  kind: RuleKind;
  field?: string;
  operator?: string;
  threshold?: string | number;
  description?: string;
  weights?: Record<string, number>;
  percentile?: number;
}

/**
 * Which intake batches a scholarship applies to.
 *
 * This is the answer to "the terms changed this year". Instead of versioning a
 * scholarship (which meant two sets of rules hiding behind one name), you make
 * a second scholarship and point it at the newer batches. Each scholarship then
 * has exactly one set of terms, for life.
 *
 *   all      - any batch, now and in future
 *   list     - only the batches ticked
 *   onwards  - `batchFrom` and every batch after it
 */
export type BatchMode = "all" | "list" | "onwards";

export interface Scholarship {
  id: string;
  name: string;
  description: string;
  studyLevel: StudyLevel;
  schools: string[];
  programmes: string[];
  /**
   * The resolved list of batches this applies to. Always kept in step with
   * `batchMode`/`batchFrom` by `resolveBatches`, so every matching check can
   * just ask "is the student's batch in here?" and ignore the mode.
   */
  batches: string[];
  batchMode: BatchMode;
  /** Only meaningful when batchMode is "onwards". */
  batchFrom?: string;
  semesterFrom: string;
  semesterTill?: string;
  allSemesters?: boolean;
  reviewCycle: ReviewCycle;
  coverage: CoverageLine[];
  awardRules: Rule[];
  retentionRules: Rule[];
  maxDurationYears: number;
  workStudyHoursPerMonth: number;
  requiresReapplication: boolean;
  fundingSource: "Internal" | "Donor";
  donorName?: string;
  quotaPerCohort?: number;
  status: "Active" | "Archived";
  effectiveFrom: string;
  mayExceedCeiling?: boolean;
}

export type Gender = "Male" | "Female" | "Other";

export type EnrollmentStatus = "Enrolled" | "On leave" | "Graduated" | "Withdrawn";

export interface Student {
  regNo: string;
  name: string;
  school: string;
  programme: string;
  studyLevel: "Bachelors" | "Masters";
  batch: string;
  cgpa: number;
  creditHours: number;
  domicile: string;
  isOutOfStation: boolean;
  tuitionFee: number;
  hostelFee: number;
  messFee: number;
  otherFee: number;
  province: string;
  city: string;
  district: string;
  financialNeedVerified: boolean;
  personalStatementOk: boolean;
  hasSportsMedal: boolean;
  bfitMember: boolean;

  /* -- Student information (admissions "Fields" module) -------------------- */

  /** Admission category. A managed lookup, never a hardcoded union. */
  quota: string;
  gender: Gender;
  /**
   * Age is deliberately absent: it is derived from this with `ageOf()`.
   * Storing both lets them drift apart, and the older one always wins by
   * accident.
   */
  dateOfBirth: string;
  fatherName: string;
  email: string;
  phone: string;
  /** Read-only rollup owned by the attendance system, not editable here. */
  attendancePct: number;
  photoUrl?: string;
  admissionDate: string;
  enrollmentStatus: EnrollmentStatus;
  /** Which semester of the programme they are sitting in, 1-based. */
  currentSemester: number;
  creditsEarned: number;
}

export interface AwardComponent {
  feeHead: FeeHead;
  entitlement: number; // in percent for tuition/hostel/mess when applicable, or PKR for fixed
  entitlementKind: BenefitKind;
  entitlementValue: number; // raw
  applied: number; // in percent (0-100) after merge for percentage/full lines, in PKR for fixed
  isOverridden: boolean;
  overrideReason?: string;
  overrideAuthority?: string;
}

/** Why an award ended. Four causes, because there are four code paths. */
export type RevocationCause =
  "Revoked by hand" | "Scholarship archived" | "Application reopened" | "Batch undone";

/**
 * The record of an award ending.
 *
 * One nested object rather than six loose optional fields on `Award`, so it
 * cannot be half-filled: either an award ended and this says when, why and on
 * whose word, or it did not. Before this existed, `effective` and `timing` were
 * interpolated into an English audit sentence and nowhere else, which made
 * "how many students lost a scholarship last semester" unanswerable without
 * regexing prose.
 */
export interface Revocation {
  /** When the decision was recorded. */
  at: string;
  /** When the money actually stops. */
  effectiveFrom: string;
  /** `effectiveFrom` resolved to a SEMESTERS label, so it can be grouped. */
  semester: string;
  timing: "immediate" | "next";
  cause: RevocationCause;
  reason: string;
  by: string;
}

export interface Award {
  id: string;
  studentRegNo: string;
  scholarshipId: string;
  status: "Active" | "Revoked";
  components: AwardComponent[];
  effectiveFrom: string;
  authorisedBy: string;
  reasonCode: string;
  batchId?: string;
  /** Set when a person changed the amounts by hand, rather than the rules. */
  editedByHand?: boolean;
  editReason?: string;
  /** Present if and only if `status` is "Revoked". */
  revocation?: Revocation;
}

export interface AuditEntry {
  id: string;
  entityType: "Scholarship" | "Student" | "Award" | "Batch" | "Application" | "Criteria";
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  actor: string;
  timestamp: string;
}

export interface AssignmentBatch {
  id: string;
  scholarshipId: string;
  actor: string;
  timestamp: string;
  reason: string;
  mode: "Evaluate" | "Direct";
  awardIds: string[];
  undone: boolean;
}

/* ------------------------------------------------------------------ roles -- */

/**
 * Who is using the system. There is no authentication yet, so this is chosen
 * from the top bar; when auth lands it comes from the session instead. It
 * drives two things and nothing else: what a screen lets you do, and the name
 * written into the audit log.
 */
export type Role = "Registrar Office" | "Scholarship Committee" | "Finance" | "Admin";

export const ROLES: readonly Role[] = [
  "Registrar Office",
  "Scholarship Committee",
  "Finance",
  "Admin",
];

/* ----------------------------------------------------- need applications -- */

export type ApplicationStatus = "Submitted" | "On hold" | "Approved" | "Rejected" | "Withdrawn";

export interface ApplicationDocument {
  id: string;
  /** Matches an entry in `EligibilityCriteria.requiredDocuments`. */
  kind: string;
  fileName: string;
  uploadedAt: string;
  verified: boolean;
}

/** What the student declares about the household paying their fee. */
export interface HouseholdInfo {
  monthlyIncome: number;
  earningMembers: number;
  dependants: number;
  siblingsAtBNU: number;
  guardianOccupation: string;
  guardianStatus: "Employed" | "Self-employed" | "Retired" | "Unemployed" | "Deceased";
  residence: "Owned" | "Rented" | "Family owned";
  monthlyRent: number;
  ownsVehicle: boolean;
}

export interface ApplicationDecision {
  outcome: "Approved" | "Rejected" | "On hold";
  by: string;
  role: Role;
  at: string;
  reason: string;
  /** Set when the criteria filter rejected it rather than a person. */
  automatic?: boolean;
  /** Tuition percentage granted. Only meaningful when approved. */
  awardedPct?: number;
  /** The award this application produced, so the two can be traced to each other. */
  awardId?: string;
}

export interface NeedApplication {
  id: string;
  studentRegNo: string;
  scholarshipId: string;
  /** The term the money is being asked for. */
  semester: string;
  submittedAt: string;
  household: HouseholdInfo;
  statement: string;
  documents: ApplicationDocument[];
  /** What the student asked for, as a percentage of tuition. */
  requestedPct: number;
  status: ApplicationStatus;
  decision?: ApplicationDecision;
}

/* -------------------------------------------------- eligibility criteria -- */

export type CriterionId =
  "cgpa" | "income" | "creditHours" | "attendance" | "documents" | "existingCoverage" | "duplicate";

/**
 * A minimum CGPA that applies to one intake and every intake after it, until
 * a later threshold takes over. Written this way because that is how the
 * policy is written: "2.65 for Fall 2024 and onwards, 2.50 for Fall 2023".
 */
export interface CgpaThreshold {
  id: string;
  fromBatch: string;
  minCgpa: number;
}

export interface EligibilityCriteria {
  scholarshipId: string;
  cgpaThresholds: CgpaThreshold[];
  maxMonthlyIncome: number;
  minCreditHours: number;
  minAttendancePct: number;
  requiredDocuments: string[];
  /** Applying while already covered above this much tuition is questionable. */
  maxExistingCoveragePct: number;
  /**
   * Which failures reject an application without a person looking at it.
   * Anything left out of this list still shows on the application, but only as
   * a flag for the committee to weigh. This is the switch that decides how
   * aggressive the filter is, and it is editable rather than compiled in.
   */
  autoRejectOn: CriterionId[];
}

export interface MergedComponent {
  feeHead: FeeHead;
  entitlementPct: number; // percent (0-100), for fixed we store 0 and use PKR
  entitlementPKR: number; // for fixed amount lines
  appliedPct: number;
  appliedPKR: number;
  mergeStatus: "Full" | "Trimmed" | "Suppressed";
  isOverridden: boolean;
  overrideReason?: string;
  overrideAuthority?: string;
  kind: BenefitKind;
}

export interface MergedAward {
  award: Award;
  scholarship: Scholarship;
  components: MergedComponent[];
}
