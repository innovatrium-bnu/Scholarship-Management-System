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
  /**
   * The donor record, once one exists. `donorName` stays as the display
   * fallback: it is what the form has always written and what four screens
   * read, and a scholarship created before the donors module has no id.
   */
  donorId?: string;
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

/* ------------------------------------------------------- donors and funds -- */

/**
 * Where the money comes from.
 *
 * Until this module existed a "donor" was a free-text `donorName` on a
 * scholarship, so two scholarships funded by the same organisation were two
 * unrelated strings and nobody could ask what a donor still owed. A donor is
 * now a row, and `Scholarship.donorId` points at it.
 */
export type DonorKind = "Organisation" | "Individual" | "Trust" | "Government";

export type DonorStatus = "Active" | "Archived";

/** How a receipt arrived. Recorded because reconciliation asks. */
export type DonationMethod = "Bank transfer" | "Cheque" | "Cash" | "Online";

export type PledgeStatus = "Active" | "Completed" | "Cancelled";

export type AllocationStatus = "Active" | "Released";

export interface Donor {
  id: string;
  name: string;
  kind: DonorKind;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  status: DonorStatus;
}

/**
 * One dated expectation of money.
 *
 * A four-year commitment is four of these, not one row with a duration, because
 * "what is still owed, and was it due yet" is the question `Receivables`
 * answers and it cannot be answered without a date per instalment.
 */
export interface PledgeInstalment {
  id: string;
  sequence: number;
  amount: number;
  dueOn: string;
}

export interface Pledge {
  id: string;
  donorId: string;
  /** Set when the pledge is earmarked; absent when it is unrestricted. */
  scholarshipId?: string;
  /** The donor's own agreement reference, if they gave one. */
  reference?: string;
  totalAmount: number;
  termYears: number;
  startsOn: string;
  endsOn: string;
  /**
   * How long before `endsOn` this pledge should start appearing on the renewal
   * report. Per pledge rather than a global constant: a government grant and a
   * family trust do not want the same lead time, and a policy number belongs in
   * data.
   */
  renewalNoticeDays: number;
  status: PledgeStatus;
  instalments: PledgeInstalment[];
  notes?: string;
}

/** Money that actually arrived. */
export interface Donation {
  id: string;
  donorId: string;
  pledgeId?: string;
  /** The instalment this receipt settles, when it settles one exactly. */
  instalmentId?: string;
  amount: number;
  receivedOn: string;
  method: DonationMethod;
  reference?: string;
  recordedBy: string;
  notes?: string;
  allocations: FundAllocation[];
}

/**
 * Received money assigned to one award.
 *
 * The link is to an award rather than to a student directly: the award already
 * names the student, the scholarship and the amount, so "which donor sponsors
 * which student" and its audit trail come from it, and donor money reconciles
 * against fee relief that actually exists.
 */
export interface FundAllocation {
  id: string;
  donationId: string;
  awardId: string;
  amount: number;
  allocatedOn: string;
  allocatedBy: string;
  reason: string;
  status: AllocationStatus;
  /** Present if and only if `status` is "Released". */
  releasedAt?: string;
  releasedBy?: string;
  releaseReason?: string;

  /**
   * Who the award paid for, carried on the allocation rather than looked up.
   *
   * Every award list this system serves is active-only, so resolving the award
   * client-side lost the student the moment it was revoked — and the donor page
   * rendered "Unknown" against money that was still assigned. The server reads
   * these off the award row, whatever its status.
   */
  studentRegNo?: string;
  scholarshipId?: string;
  /** The award's status, not this allocation's. */
  awardStatus?: "Active" | "Revoked";
}

/**
 * What a donor has promised, sent, and had spent — the three buckets the
 * Donors screen filters by.
 *
 * Derived on every read rather than stored. A status column on a donation would
 * have to be maintained by every receipt and every allocation and would drift;
 * and these are not really row states, because one receipt can be part
 * allocated. They are amounts.
 */
export interface DonorFunding {
  donorId: string;
  /** Committed and not yet received. */
  receivable: number;
  /** Received, whatever has since happened to it. */
  received: number;
  /** Received and assigned to an award. */
  assigned: number;
  /** Received and not yet assigned. `received - assigned`. */
  unassigned: number;
  /** Receivable instalments whose due date has passed. */
  overdue: number;
}

export interface AuditEntry {
  id: string;
  entityType: "Scholarship" | "Student" | "Award" | "Batch" | "Application" | "Criteria" | "Donor";
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
 * Who is using the system. It comes from the signed-in account, and drives two
 * things and nothing else: what a screen lets you do, and the name written into
 * the audit log.
 *
 * Ordered most privileged first, which is the order the roles are graded in and
 * the order any list of them should read. See `roles.ts` for what each may do.
 */
export type Role = "Super Admin" | "Admin" | "Data Entry" | "Reporting";

export const ROLES: readonly Role[] = ["Super Admin", "Admin", "Data Entry", "Reporting"];

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
