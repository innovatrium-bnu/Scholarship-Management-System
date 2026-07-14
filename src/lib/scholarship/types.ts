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

export interface Scholarship {
  id: string;
  name: string;
  description: string;
  studyLevel: StudyLevel;
  schools: string[];
  programmes: string[];
  batches: string[];
  semesterFrom: number;
  semesterTill?: number;
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
  priorityRank: number;
  status: "Active" | "Archived";
  version: number;
  effectiveFrom: string;
  mayExceedCeiling?: boolean;
}

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

export interface Award {
  id: string;
  studentRegNo: string;
  scholarshipId: string;
  scholarshipVersion: number;
  status: "Active" | "Revoked";
  components: AwardComponent[];
  effectiveFrom: string;
  authorisedBy: string;
  reasonCode: string;
  batchId?: string;
}

export interface AuditEntry {
  id: string;
  entityType: "Scholarship" | "Student" | "Award" | "Batch";
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