/**
 * Minimal builders for domain objects used by the unit tests.
 *
 * Every factory returns a valid, boring default and takes a patch, so each test
 * states only the fields it actually cares about. That keeps the assertions
 * readable and stops an unrelated schema addition from breaking every test.
 */
import type {
  Award,
  AwardComponent,
  BenefitKind,
  CoverageLine,
  EligibilityCriteria,
  NeedApplication,
  Rule,
  Scholarship,
  Student,
} from "./types";

export function makeStudent(patch: Partial<Student> = {}): Student {
  return {
    regNo: "F23-0001",
    name: "Test Student",
    school: "School of Computer & IT",
    programme: "BS Computer Science",
    studyLevel: "Bachelors",
    batch: "Fall 2023",
    cgpa: 3.5,
    creditHours: 16,
    domicile: "Lahore",
    isOutOfStation: false,
    tuitionFee: 400000,
    hostelFee: 80000,
    messFee: 40000,
    otherFee: 20000,
    province: "Punjab",
    city: "Lahore",
    district: "Model Town",
    financialNeedVerified: true,
    personalStatementOk: true,
    hasSportsMedal: true,
    bfitMember: true,
    quota: "Merit",
    gender: "Female",
    dateOfBirth: "2004-04-12",
    fatherName: "Test Guardian",
    email: "test.student@bnu.edu.pk",
    phone: "+92 300 0000000",
    attendancePct: 88,
    admissionDate: "2023-09-01",
    enrollmentStatus: "Enrolled",
    currentSemester: 5,
    creditsEarned: 68,
    ...patch,
  };
}

export function makeApplication(patch: Partial<NeedApplication> = {}): NeedApplication {
  return {
    id: "app-test",
    studentRegNo: "F23-0001",
    scholarshipId: "sch-need",
    semester: "Fall 2025",
    submittedAt: "2025-08-01T09:00:00.000Z",
    household: {
      monthlyIncome: 60_000,
      earningMembers: 1,
      dependants: 4,
      siblingsAtBNU: 0,
      guardianOccupation: "Clerk",
      guardianStatus: "Employed",
      residence: "Rented",
      monthlyRent: 25_000,
      ownsVehicle: false,
    },
    statement: "Supporting statement.",
    documents: [
      { id: "d1", kind: "CNIC", fileName: "cnic.pdf", uploadedAt: "2025-08-01", verified: true },
      {
        id: "d2",
        kind: "Income certificate",
        fileName: "income.pdf",
        uploadedAt: "2025-08-01",
        verified: true,
      },
    ],
    requestedPct: 50,
    status: "Submitted",
    ...patch,
  };
}

export function makeCriteria(patch: Partial<EligibilityCriteria> = {}): EligibilityCriteria {
  return {
    scholarshipId: "sch-need",
    cgpaThresholds: [
      { id: "c1", fromBatch: "Fall 2023", minCgpa: 2.5 },
      { id: "c2", fromBatch: "Fall 2024", minCgpa: 2.65 },
    ],
    maxMonthlyIncome: 150_000,
    minCreditHours: 12,
    minAttendancePct: 75,
    requiredDocuments: ["CNIC", "Income certificate"],
    maxExistingCoveragePct: 50,
    autoRejectOn: ["cgpa", "income", "creditHours", "documents", "duplicate"],
    ...patch,
  };
}

export function makeScholarship(patch: Partial<Scholarship> = {}): Scholarship {
  return {
    id: "sch-test",
    name: "Test Scholarship",
    description: "",
    studyLevel: "Both",
    schools: [],
    programmes: [],
    batches: [],
    batchMode: "all",
    semesterFrom: "Fall 2023",
    reviewCycle: "Annual",
    coverage: [],
    awardRules: [],
    retentionRules: [],
    maxDurationYears: 4,
    workStudyHoursPerMonth: 0,
    requiresReapplication: false,
    fundingSource: "Internal",
    status: "Active",
    effectiveFrom: "2023-09-01",
    ...patch,
  };
}

export function makeCoverage(patch: Partial<CoverageLine> = {}): CoverageLine {
  return {
    id: "cov-1",
    feeHead: "Tuition",
    benefitKind: "Percentage",
    value: 50,
    ...patch,
  };
}

export function makeRule(patch: Partial<Rule> = {}): Rule {
  return {
    id: "rule-1",
    kind: "Automatic",
    ...patch,
  };
}

/** A single fee-head line on an award. `applied` is what the merge recomputes. */
export function makeComponent(
  feeHead: string,
  entitlementKind: BenefitKind,
  entitlementValue: number,
  patch: Partial<AwardComponent> = {},
): AwardComponent {
  return {
    feeHead,
    entitlement: entitlementValue,
    entitlementKind,
    entitlementValue,
    applied: entitlementValue,
    isOverridden: false,
    ...patch,
  };
}

export function makeAward(patch: Partial<Award> = {}): Award {
  return {
    id: "aw-test",
    studentRegNo: "F23-0001",
    scholarshipId: "sch-test",
    status: "Active",
    components: [],
    effectiveFrom: "2023-09-01",
    authorisedBy: "Registrar Office",
    reasonCode: "Initial award",
    ...patch,
  };
}
