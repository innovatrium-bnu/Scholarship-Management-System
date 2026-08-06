import type {
  Award,
  AuditEntry,
  AssignmentBatch,
  EligibilityCriteria,
  NeedApplication,
  RevocationCause,
  Scholarship,
  Student,
} from "./types";
import type { DomainEvent } from "./events";

/**
 * Admission categories. A lookup, not a union type, because the registry adds
 * and retires quotas without anyone shipping code. The admin screen edits this
 * list; nothing in the app should test a quota by string equality.
 */
export const QUOTAS = [
  "Merit",
  "Self-Finance",
  "Overseas",
  "Sports",
  "Staff Ward",
  "Special Needs",
  "Kashmir / FATA",
] as const;

/** The term the demo data sits in. */
export const CURRENT_SEMESTER = "Fall 2025";

export const SCHOOLS = [
  "Mariam Dawood School of Visual Arts & Design",
  "Razia Hassan School of Architecture",
  "Seeta Majeed School of Liberal Arts & Social Sciences",
  "School of Media and Mass Communication",
  "School of Computer & IT",
  "School of Education",
  "School of Management Sciences",
  "Institute of Psychology",
] as const;

export const BATCHES = [
  "Fall 2021",
  "Spring 2022",
  "Fall 2022",
  "Spring 2023",
  "Fall 2023",
  "Spring 2024",
  "Fall 2024",
  "Spring 2025",
  "Fall 2025",
] as const;

export const SEMESTERS = [
  "Fall 2023",
  "Spring 2024",
  "Fall 2024",
  "Spring 2025",
  "Fall 2025",
  "Spring 2026",
] as const;

export const GEOGRAPHY: Record<string, Record<string, string[]>> = {
  Punjab: {
    Lahore: ["Lahore Cantt", "Model Town", "Gulberg", "DHA"],
    Faisalabad: ["Faisalabad City", "Jaranwala"],
    Multan: ["Multan City", "Shujabad"],
    Rawalpindi: ["Rawalpindi Cantt", "Taxila"],
  },
  Sindh: {
    Karachi: ["Karachi Central", "Karachi South", "Karachi East"],
    Hyderabad: ["Hyderabad City", "Latifabad"],
  },
  KPK: {
    Peshawar: ["Peshawar City", "Hayatabad"],
  },
  Balochistan: {
    Quetta: ["Quetta City", "Sariab"],
  },
};

const GEO_TRIPLES: { province: string; city: string; district: string }[] = [];
for (const [province, cities] of Object.entries(GEOGRAPHY)) {
  for (const [city, districts] of Object.entries(cities)) {
    for (const d of districts) GEO_TRIPLES.push({ province, city, district: d });
  }
}

export const PROGRAMMES: Record<string, string[]> = {
  "Mariam Dawood School of Visual Arts & Design": [
    "BFA",
    "MFA",
    "BDes Communication Design",
    "BDes Textile",
  ],
  "Razia Hassan School of Architecture": ["BS Architecture", "M.Arch"],
  "Seeta Majeed School of Liberal Arts & Social Sciences": [
    "BA Liberal Arts",
    "BS Social Sciences",
    "BA English Literature",
  ],
  "School of Media and Mass Communication": ["BS Mass Communication", "BS Media Studies"],
  "School of Computer & IT": [
    "BS Computer Science",
    "BS Software Engineering",
    "BS Information Technology",
  ],
  "School of Education": ["BEd", "MEd"],
  "School of Management Sciences": ["BBA", "MBA"],
  "Institute of Psychology": ["BS Psychology", "MS Psychology"],
};

const FIRST = [
  "Ali",
  "Ayesha",
  "Bilal",
  "Zainab",
  "Hassan",
  "Fatima",
  "Usman",
  "Hira",
  "Omar",
  "Sana",
  "Ahmed",
  "Maryam",
  "Hamza",
  "Iqra",
  "Yousuf",
  "Nida",
  "Saad",
  "Amna",
  "Faisal",
  "Rabia",
  "Danyal",
  "Sadia",
  "Kamran",
  "Mahnoor",
  "Zeeshan",
  "Anum",
  "Talha",
  "Kinza",
  "Ibrahim",
  "Mehreen",
];
const LAST = [
  "Khan",
  "Ahmed",
  "Malik",
  "Chaudhry",
  "Sheikh",
  "Raza",
  "Iqbal",
  "Butt",
  "Qureshi",
  "Bhatti",
  "Siddiqui",
  "Farooq",
  "Nawaz",
  "Aslam",
  "Javed",
];

function rand<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length]!;
}

function regNoFor(batch: string, seq: number): string {
  const [term, year] = batch.split(" ");
  const prefix = term === "Spring" ? "S" : "F";
  return `${prefix}${year}-${seq.toString().padStart(3, "0")}`;
}

export function seedScholarships(): Scholarship[] {
  const base = {
    effectiveFrom: "2024-09-01",
    schools: [] as string[],
    programmes: [] as string[],
    /* Most of the seeded scholarships are open to any intake. The two below
       that are batch-limited show what the new criteria look like in use. */
    batches: [...BATCHES],
    batchMode: "all" as const,
    semesterFrom: SEMESTERS[0],
    allSemesters: true,
    awardRules: [],
    retentionRules: [],
    workStudyHoursPerMonth: 0,
    requiresReapplication: false,
    fundingSource: "Internal" as const,
  };
  return [
    {
      ...base,
      id: "sch-vc",
      name: "VC Scholarship",
      description: "Vice Chancellor's flagship award for top incoming Bachelors students.",
      studyLevel: "Bachelors",
      reviewCycle: "Every semester",
      coverage: [
        { id: "cov-vc-1", feeHead: "Tuition", benefitKind: "Percentage", value: 100 },
        { id: "cov-vc-2", feeHead: "Hostel", benefitKind: "Full waiver", value: 100 },
      ],
      maxDurationYears: 4,
      workStudyHoursPerMonth: 8,
      quotaPerCohort: 1,
      status: "Active",
      awardRules: [
        { id: "r1", kind: "Cohort rank", percentile: 1, description: "Top 1 per cohort" },
      ],
      retentionRules: [
        { id: "r2", kind: "Automatic", field: "cgpa", operator: ">=", threshold: 3.7 },
      ],
    },
    {
      ...base,
      id: "sch-dean",
      name: "Dean's Scholarship",
      description: "Awarded to high-achieving Bachelors students, reviewed annually.",
      studyLevel: "Bachelors",
      reviewCycle: "Annual",
      coverage: [{ id: "cov-d-1", feeHead: "Tuition", benefitKind: "Percentage", value: 100 }],
      maxDurationYears: 4,
      workStudyHoursPerMonth: 8,
      status: "Active",
      retentionRules: [
        { id: "r3", kind: "Automatic", field: "cgpa", operator: ">=", threshold: 3.5 },
      ],
    },
    {
      ...base,
      id: "sch-need",
      name: "Need-Based Scholarship",
      description: "Financial need scholarship, renewed annually with fresh application.",
      studyLevel: "Both",
      reviewCycle: "Annual",
      coverage: [{ id: "cov-n-1", feeHead: "Tuition", benefitKind: "Percentage", value: 50 }],
      maxDurationYears: 4,
      requiresReapplication: true,
      status: "Active",
    },
    {
      ...base,
      id: "sch-merit",
      name: "Merit-Based Scholarship",
      description: "Semester merit award. Excludes School of Education.",
      studyLevel: "Bachelors",
      reviewCycle: "Every semester",
      coverage: [{ id: "cov-m-1", feeHead: "Tuition", benefitKind: "Percentage", value: 75 }],
      maxDurationYears: 4,
      semesterFrom: "Fall 2024",
      allSemesters: false,
      status: "Active",
      awardRules: [
        {
          id: "r4",
          kind: "Cohort rank",
          percentile: 18,
          description: "Top 18% per cohort, Fall 2024+",
        },
      ],
    },
    /* These two exist as a worked example of how a change of terms is handled
       without versioning: the older intake keeps its own scholarship at the old
       rate, and a second scholarship covers every intake from Fall 2024 on. */
    {
      ...base,
      id: "sch-talent-f23",
      name: "Talent Award (Fall 2023 intake)",
      description: "Tuition support at the original 40% rate, for the Fall 2023 intake only.",
      studyLevel: "Bachelors",
      reviewCycle: "Annual",
      coverage: [{ id: "cov-t23-1", feeHead: "Tuition", benefitKind: "Percentage", value: 40 }],
      maxDurationYears: 4,
      batches: ["Fall 2023"],
      batchMode: "list" as const,
      status: "Active",
    },
    {
      ...base,
      id: "sch-talent-f24",
      name: "Talent Award (Fall 2024 onwards)",
      description: "Replaces the Fall 2023 award for every later intake, at the revised 30% rate.",
      studyLevel: "Bachelors",
      reviewCycle: "Annual",
      coverage: [{ id: "cov-t24-1", feeHead: "Tuition", benefitKind: "Percentage", value: 30 }],
      maxDurationYears: 4,
      batches: ["Fall 2024", "Spring 2025", "Fall 2025"],
      batchMode: "onwards" as const,
      batchFrom: "Fall 2024",
      status: "Active",
    },
    /* One retired scholarship, so the Retired page has something in it. */
    {
      ...base,
      id: "sch-legacy-arts",
      name: "Legacy Arts Bursary",
      description: "Discontinued after the 2023 funding round. Kept on record only.",
      studyLevel: "Bachelors",
      reviewCycle: "Annual",
      coverage: [{ id: "cov-la-1", feeHead: "Tuition", benefitKind: "Percentage", value: 25 }],
      maxDurationYears: 4,
      batches: ["Fall 2021", "Spring 2022", "Fall 2022"],
      batchMode: "list" as const,
      status: "Archived",
    },
    {
      ...base,
      id: "sch-trans",
      name: "Transgender Inclusion Scholarship",
      description: "Inclusion award with tuition and conditional hostel support.",
      studyLevel: "Both",
      reviewCycle: "Annual",
      coverage: [
        { id: "cov-t-1", feeHead: "Tuition", benefitKind: "Percentage", value: 50 },
        {
          id: "cov-t-2",
          feeHead: "Hostel",
          benefitKind: "Fixed amount",
          value: 20000,
          conditionalOn: "Student is not domiciled in Lahore",
        },
      ],
      maxDurationYears: 4,
      status: "Active",
    },
    {
      ...base,
      id: "sch-sports",
      name: "Sports Scholarship",
      description: "For students representing BNU in competitive sports.",
      studyLevel: "Bachelors",
      reviewCycle: "Every semester",
      coverage: [{ id: "cov-s-1", feeHead: "Tuition", benefitKind: "Percentage", value: 30 }],
      maxDurationYears: 4,
      status: "Active",
    },
    {
      ...base,
      id: "sch-inst",
      name: "BNU Institutional Support",
      description: "For students from MOU partner schools.",
      studyLevel: "Both",
      reviewCycle: "Annual",
      coverage: [{ id: "cov-i-1", feeHead: "Tuition", benefitKind: "Percentage", value: 25 }],
      maxDurationYears: 4,
      status: "Active",
    },
    {
      ...base,
      id: "sch-ext",
      name: "Externally Funded Need-Based",
      description: "Donor-funded need scholarship. May exceed 100% ceiling by donor agreement.",
      studyLevel: "Both",
      reviewCycle: "Annual",
      coverage: [{ id: "cov-e-1", feeHead: "Tuition", benefitKind: "Percentage", value: 40 }],
      maxDurationYears: 4,
      fundingSource: "Donor",
      donorName: "Aslam Foundation",
      status: "Active",
      mayExceedCeiling: true,
    },
  ];
}

/**
 * Which semester of their programme a batch is sitting in this term.
 *
 * BATCHES is chronological, so the newest intake is in semester 1 and each
 * earlier one is a semester further along. Capped at 8, because a Bachelors
 * degree does not have a ninth semester and the stragglers are shown as
 * finishing their last one.
 */
/**
 * The academic term a date falls in.
 *
 * Spring runs January to June, Fall runs July to December — BNU's own split,
 * and the reason an award dated 2025-09-01 belongs to Fall 2025.
 *
 * Resolved once, when an event is written, rather than recomputed by whoever
 * happens to be counting. Two callers deriving a term from a date independently
 * is two chances to disagree about what "last semester" means.
 *
 * Returns the label even when it falls outside `SEMESTERS`; a real date in
 * Fall 2022 should say so rather than being clamped into a term the university
 * has a record of.
 */
export function semesterOf(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const month = d.getMonth() + 1;
  return `${month <= 6 ? "Spring" : "Fall"} ${d.getFullYear()}`;
}

/**
 * The inverse of {@link semesterOf}: the date a term begins.
 *
 * Terms start in September and February, matching the admission dates in the
 * student data. Used when a screen gives us a term but a record needs a date.
 */
export function dateOfSemester(label: string): string {
  const [term, year] = label.split(" ");
  if (!year || !/^\d{4}$/.test(year)) return label;
  return `${year}-${term === "Spring" ? "02" : "09"}-01`;
}

export function semesterOfBatch(batch: string, batchOrder: readonly string[] = BATCHES): number {
  const i = batchOrder.indexOf(batch);
  if (i === -1) return 1;
  return Math.min(8, batchOrder.length - i);
}

const OCCUPATIONS = [
  "Shopkeeper",
  "Government clerk",
  "Schoolteacher",
  "Driver",
  "Farmer",
  "Tailor",
  "Bank officer",
  "Electrician",
  "Nurse",
  "Small trader",
];

export function seedStudents(): Student[] {
  const students: Student[] = [];
  const batchSeq: Record<string, number> = {};
  let n = 1;
  for (const school of SCHOOLS) {
    const progs = PROGRAMMES[school]!;
    for (let i = 0; i < 14; i++) {
      const first = rand(FIRST, n * 3 + i);
      const last = rand(LAST, n * 5 + i);
      // Bias more students to Fall 2025 for demo (~40%)
      const batch = i < 6 ? "Fall 2025" : rand(BATCHES, n + i);
      const programme = rand(progs, i);
      const cgpa = Math.round((2.1 + ((n * 37 + i * 17) % 190) / 100) * 100) / 100;
      const studyLevel: "Bachelors" | "Masters" = programme.startsWith("M")
        ? "Masters"
        : "Bachelors";
      const geo = GEO_TRIPLES[(n + i * 7) % GEO_TRIPLES.length]!;
      const domicile = geo.city;
      batchSeq[batch] = (batchSeq[batch] ?? 0) + 1;

      const regNo = regNoFor(batch, batchSeq[batch]);
      const [batchTerm, batchYear] = batch.split(" ") as [string, string];
      const entryYear = Number(batchYear);
      const semester = semesterOfBatch(batch);
      // Roughly 18 at entry, give or take a couple of years.
      const birthYear = entryYear - 18 - ((n + i) % 3);
      const birthMonth = ((n * 7 + i) % 12) + 1;
      const birthDay = ((n * 13 + i * 5) % 27) + 1;
      const name = `${first} ${last}`;

      students.push({
        regNo,
        name,
        school,
        programme,
        studyLevel,
        batch,
        cgpa,
        creditHours: 15 + (i % 4),
        domicile,
        isOutOfStation: domicile !== "Lahore",
        tuitionFee: studyLevel === "Bachelors" ? 350000 : 400000,
        hostelFee: 80000,
        messFee: 40000,
        otherFee: 15000,
        province: geo.province,
        city: geo.city,
        district: geo.district,
        financialNeedVerified: (n + i) % 5 === 0,
        personalStatementOk: (n + i) % 3 !== 0,
        hasSportsMedal: (n + i) % 11 === 0,
        bfitMember: (n + i) % 7 === 0,

        quota: rand(QUOTAS, n * 3 + i),
        gender: (n + i) % 2 === 0 ? "Female" : "Male",
        dateOfBirth: `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`,
        fatherName: `${rand(FIRST, n * 11 + i)} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}.${regNo.toLowerCase().replace("-", "")}@bnu.edu.pk`,
        phone: `+92 3${(n % 9) + 1}${String(10_000_00 + ((n * 7919 + i * 331) % 900_000)).slice(0, 7)}`,
        // A rollup the attendance system owns; nothing here may write to it.
        attendancePct: 62 + ((n * 17 + i * 29) % 37),
        admissionDate: `${entryYear}-${batchTerm === "Spring" ? "02" : "09"}-01`,
        enrollmentStatus: "Enrolled",
        currentSemester: semester,
        creditsEarned: Math.max(0, (semester - 1) * 15 + ((n + i) % 6)),
      });
      n++;
    }
  }
  return students;
}

/**
 * The eligibility criteria the automatic filter applies to need-based
 * applications, seeded from the policy the Registrar Office supplied:
 * CGPA 2.65 for the Fall 2024 intake onwards, 2.50 for Fall 2023.
 *
 * Every number here is editable at /settings/criteria. Nothing in the
 * screening engine hardcodes any of it.
 */
export function seedCriteria(): EligibilityCriteria[] {
  return [
    {
      scholarshipId: "sch-need",
      cgpaThresholds: [
        { id: "cg-1", fromBatch: "Fall 2023", minCgpa: 2.5 },
        { id: "cg-2", fromBatch: "Fall 2024", minCgpa: 2.65 },
      ],
      maxMonthlyIncome: 150_000,
      minCreditHours: 12,
      minAttendancePct: 75,
      requiredDocuments: [
        "CNIC",
        "Income certificate",
        "Utility bill",
        "Father's salary slip / affidavit",
      ],
      maxExistingCoveragePct: 50,
      /* Attendance and existing coverage are deliberately absent: both need a
         person to weigh the circumstances, so they only raise a flag. */
      autoRejectOn: ["cgpa", "income", "creditHours", "documents", "duplicate"],
    },
  ];
}

const STATEMENTS = [
  "My father was the only earning member of our household until his retirement last year. My elder sister has stopped her own studies so that I can continue mine, and the tuition instalment is now beyond what the family can raise each semester.",
  "We moved to Lahore for my admission and are renting a single room near the campus. After rent and my younger brothers' school fees there is very little left, and I have been paying the fee in late instalments with a surcharge each time.",
  "My mother supports four of us on her teaching salary since my father passed away in 2023. I have kept my grades up while tutoring in the evenings, but the tuition is the one thing I cannot cover on my own.",
  "My father's shop was damaged in the floods and the family has been repaying a loan since. I am the first in my family to attend university and I would like to finish the degree without them selling the land.",
  "I am supporting my own fee through part-time work, but the hours I can manage alongside a full credit load are not enough. A partial waiver would let me reduce the working hours and give the studio work the time it needs.",
];

/**
 * A realistic backlog of need-based applications, deliberately mixed so the
 * review queue shows every case the committee actually meets: clean ones,
 * ones that fail a hard rule, ones that only warrant a second look, and a
 * handful already decided.
 */
export function seedApplications(students: Student[], awards: Award[]): NeedApplication[] {
  const apps: NeedApplication[] = [];
  const heldNeed = new Set(
    awards
      .filter((a) => a.scholarshipId === "sch-need" && a.status === "Active")
      .map((a) => a.studentRegNo),
  );
  // Applicants are students not already on the need scholarship, newest first.
  const pool = students.filter((s) => !heldNeed.has(s.regNo)).slice(0, 64);

  const ALL_DOCS = [
    "CNIC",
    "Income certificate",
    "Utility bill",
    "Father's salary slip / affidavit",
  ];

  pool.forEach((s, i) => {
    const day = 1 + (i % 28);
    const submittedAt = `2025-07-${String(day).padStart(2, "0")}T${String(9 + (i % 8)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00.000Z`;

    // Every fifth applicant declares an income over the ceiling, and every
    // seventh submits an incomplete file. Together with the CGPA spread in the
    // student data this gives the filter a realistic amount to catch.
    const overIncome = i % 5 === 0;
    const monthlyIncome = overIncome
      ? 160_000 + ((i * 9_000) % 300_000)
      : 22_000 + ((i * 6_100) % 120_000);
    const docCount = i % 7 === 0 ? 1 + (i % 3) : ALL_DOCS.length;

    let status: NeedApplication["status"] = "Submitted";
    let decision: NeedApplication["decision"];
    // A few already-settled cases, so the decided tabs are not empty.
    if (i % 13 === 3) {
      status = "Approved";
      decision = {
        outcome: "Approved",
        by: "Dr. Sana Yousaf",
        role: "Scholarship Committee",
        at: "2025-07-30T11:20:00.000Z",
        reason: "Verified need, strong academic standing. Granted at the standard 50%.",
        awardedPct: 50,
      };
    } else if (i % 13 === 8) {
      status = "Rejected";
      decision = {
        outcome: "Rejected",
        by: "Dr. Sana Yousaf",
        role: "Scholarship Committee",
        at: "2025-07-30T11:35:00.000Z",
        reason: "Declared income could not be reconciled with the supporting documents.",
      };
    } else if (i % 17 === 5) {
      status = "On hold";
      decision = {
        outcome: "On hold",
        by: "Registrar Office",
        role: "Registrar Office",
        at: "2025-07-29T15:05:00.000Z",
        reason: "Waiting on an attested income certificate from the student.",
      };
    }

    apps.push({
      id: `app-${String(i + 1).padStart(3, "0")}`,
      studentRegNo: s.regNo,
      scholarshipId: "sch-need",
      semester: CURRENT_SEMESTER,
      submittedAt,
      household: {
        monthlyIncome,
        earningMembers: 1 + (i % 3),
        dependants: 2 + (i % 6),
        siblingsAtBNU: i % 9 === 0 ? 1 : 0,
        guardianOccupation: rand(OCCUPATIONS, i),
        guardianStatus:
          i % 11 === 0
            ? "Deceased"
            : i % 7 === 0
              ? "Retired"
              : i % 3 === 0
                ? "Self-employed"
                : "Employed",
        residence: i % 4 === 0 ? "Owned" : i % 4 === 1 ? "Family owned" : "Rented",
        monthlyRent: i % 4 === 0 ? 0 : 18_000 + ((i * 1_700) % 40_000),
        ownsVehicle: i % 6 === 0,
      },
      statement: rand(STATEMENTS, i),
      documents: ALL_DOCS.slice(0, docCount).map((kind, d) => ({
        id: `doc-${i + 1}-${d + 1}`,
        kind,
        fileName: `${s.regNo}-${kind.toLowerCase().replace(/[^a-z]+/g, "-")}.pdf`,
        uploadedAt: submittedAt.slice(0, 10),
        verified: (i + d) % 4 !== 0,
      })),
      requestedPct: [25, 50, 50, 75, 100][i % 5]!,
      status,
      decision,
    });
  });

  return apps;
}

export function seedAwards(students: Student[]): Award[] {
  const awards: Award[] = [];
  const now = "2025-09-01";
  const push = (studentRegNo: string, schId: string, components: Award["components"]) => {
    awards.push({
      id: `aw-${awards.length + 1}`,
      studentRegNo,
      scholarshipId: schId,
      status: "Active",
      components,
      effectiveFrom: now,
      authorisedBy: "Registrar Office",
      reasonCode: "Initial award",
    });
  };

  // Overlapping: Merit 75 + Need 50 on student 1, 5, 12.
  for (const idx of [0, 4, 11]) {
    const s = students[idx];
    if (!s) continue;
    push(s.regNo, "sch-merit", [
      {
        feeHead: "Tuition",
        entitlement: 75,
        entitlementKind: "Percentage",
        entitlementValue: 75,
        applied: 0,
        isOverridden: false,
      },
    ]);
    push(s.regNo, "sch-need", [
      {
        feeHead: "Tuition",
        entitlement: 50,
        entitlementKind: "Percentage",
        entitlementValue: 50,
        applied: 0,
        isOverridden: false,
      },
    ]);
  }

  // Pinned VC override at 100% on student 20.
  const pinned = students[19];
  if (pinned) {
    push(pinned.regNo, "sch-vc", [
      {
        feeHead: "Tuition",
        entitlement: 100,
        entitlementKind: "Percentage",
        entitlementValue: 100,
        applied: 0,
        isOverridden: true,
        overrideReason: "VC Order 2024/17",
        overrideAuthority: "Vice Chancellor",
      },
      {
        feeHead: "Hostel",
        entitlement: 100,
        entitlementKind: "Full waiver",
        entitlementValue: 100,
        applied: 0,
        isOverridden: false,
      },
    ]);
    push(pinned.regNo, "sch-need", [
      {
        feeHead: "Tuition",
        entitlement: 50,
        entitlementKind: "Percentage",
        entitlementValue: 50,
        applied: 0,
        isOverridden: false,
      },
    ]);
  }

  // Sprinkle single awards across other students.
  const singles: [number, string, number, "Percentage" | "Full waiver" | "Fixed amount", number][] =
    [
      [2, "sch-dean", 100, "Percentage", 100],
      [3, "sch-sports", 30, "Percentage", 30],
      [6, "sch-inst", 25, "Percentage", 25],
      [7, "sch-ext", 40, "Percentage", 40],
      [8, "sch-trans", 50, "Percentage", 50],
      [9, "sch-need", 50, "Percentage", 50],
      [13, "sch-merit", 50, "Percentage", 50],
      [14, "sch-dean", 100, "Percentage", 100],
      [15, "sch-need", 25, "Percentage", 25],
      [16, "sch-sports", 30, "Percentage", 30],
      [17, "sch-inst", 25, "Percentage", 25],
      [22, "sch-merit", 75, "Percentage", 75],
      [24, "sch-ext", 40, "Percentage", 40],
      [27, "sch-need", 50, "Percentage", 50],
      [30, "sch-dean", 100, "Percentage", 100],
      [35, "sch-sports", 30, "Percentage", 30],
      [40, "sch-trans", 50, "Percentage", 50],
      [45, "sch-merit", 50, "Percentage", 50],
      [50, "sch-need", 50, "Percentage", 50],
    ];
  for (const [i, schId, ent, kind, val] of singles) {
    const s = students[i];
    if (!s) continue;
    push(s.regNo, schId, [
      {
        feeHead: "Tuition",
        entitlement: ent,
        entitlementKind: kind,
        entitlementValue: val,
        applied: 0,
        isOverridden: false,
      },
    ]);
  }

  // Seed ≥8 Fall 2025 students already on Need-Based (to trigger ceiling conflicts when Merit is assigned).
  const fall2025 = students.filter((s) => s.batch === "Fall 2025").slice(0, 12);
  for (const s of fall2025) {
    if (awards.some((a) => a.studentRegNo === s.regNo && a.scholarshipId === "sch-need")) continue;
    push(s.regNo, "sch-need", [
      {
        feeHead: "Tuition",
        entitlement: 50,
        entitlementKind: "Percentage",
        entitlementValue: 50,
        applied: 0,
        isOverridden: false,
      },
    ]);
  }

  return awards;
}

export function seedAudit(): AuditEntry[] {
  return [];
}

export function seedBatches(): AssignmentBatch[] {
  return [];
}

/**
 * The history the demo data pretends to have.
 *
 * This replaces `seedGainedLostBySemester()`, which returned two hardcoded
 * arrays — `gained = [14,19,23,27,31,12]`, `lost = [3,5,6,8,9,2]` — that
 * reconciled with nothing and were rendered on the dashboard as if measured.
 * Numbers nobody can trace are worse than no numbers, and a reporting layer
 * reading them would have turned invented figures into official ones.
 *
 * These events are still demonstration data, and every report built on them
 * says so. The difference is that they describe the awards that actually
 * exist: each grant is a real award, and each revocation names a real student
 * and a real reason.
 */
export function seedEvents(awards: Award[]): DomainEvent[] {
  const events: DomainEvent[] = [];

  for (const a of awards) {
    events.push({
      kind: "award.granted",
      at: `${a.effectiveFrom}T09:00:00.000Z`,
      actor: "Registrar Office",
      awardId: a.id,
      studentRegNo: a.studentRegNo,
      scholarshipId: a.scholarshipId,
      effectiveFrom: a.effectiveFrom,
      semester: semesterOf(a.effectiveFrom),
      batchId: a.batchId,
    });
  }

  /* Eleven awards that genuinely ended, spread across the terms on record, so
     "how many students lost a scholarship last semester" has something true to
     count. Causes are the ones a registrar actually sees. */
  const endings: { semester: string; cause: RevocationCause; reason: string }[] = [
    {
      semester: "Fall 2023",
      cause: "Revoked by hand",
      reason: "CGPA fell below the 3.50 required to keep the award.",
    },
    {
      semester: "Fall 2023",
      cause: "Revoked by hand",
      reason: "Student withdrew from the programme.",
    },
    {
      semester: "Spring 2024",
      cause: "Revoked by hand",
      reason: "CGPA fell below the 3.70 required to keep the award.",
    },
    {
      semester: "Spring 2024",
      cause: "Scholarship archived",
      reason: "Legacy Arts Bursary was discontinued after the 2023 funding round.",
    },
    {
      semester: "Fall 2024",
      cause: "Revoked by hand",
      reason: "Student did not complete the required work-study hours.",
    },
    {
      semester: "Fall 2024",
      cause: "Revoked by hand",
      reason: "Duplicate award corrected; the student already held the same scholarship.",
    },
    {
      semester: "Fall 2024",
      cause: "Application reopened",
      reason: "Approval reopened after the declared income could not be verified.",
    },
    {
      semester: "Spring 2025",
      cause: "Revoked by hand",
      reason: "CGPA fell below the 3.50 required to keep the award.",
    },
    {
      semester: "Spring 2025",
      cause: "Revoked by hand",
      reason: "Student transferred to another university.",
    },
    {
      semester: "Fall 2025",
      cause: "Revoked by hand",
      reason: "Student took the award from another donor and could not hold both.",
    },
    {
      semester: "Fall 2025",
      cause: "Revoked by hand",
      reason: "Attendance fell below the level required to keep the award.",
    },
  ];

  /* Drawn from the back of the award list so the students carrying a
     revocation are not the same ones the overlap and override demos rely on. */
  const donors = awards.slice(-endings.length);
  endings.forEach((e, i) => {
    const a = donors[i];
    if (!a) return;
    const effectiveFrom = dateOfSemester(e.semester);
    events.push({
      kind: "award.revoked",
      at: `${effectiveFrom}T11:30:00.000Z`,
      actor: "Registrar Office",
      awardId: `${a.id}-hist-${i + 1}`,
      studentRegNo: a.studentRegNo,
      scholarshipId: a.scholarshipId,
      effectiveFrom,
      semester: e.semester,
      timing: "immediate",
      cause: e.cause,
      reason: e.reason,
    });
  });

  return events.sort((x, y) => x.at.localeCompare(y.at));
}
