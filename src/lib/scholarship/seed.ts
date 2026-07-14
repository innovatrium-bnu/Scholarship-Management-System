import type { Award, AuditEntry, AssignmentBatch, Scholarship, Student } from "./types";

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
  "Mariam Dawood School of Visual Arts & Design": ["BFA", "MFA", "BDes Communication Design", "BDes Textile"],
  "Razia Hassan School of Architecture": ["BS Architecture", "M.Arch"],
  "Seeta Majeed School of Liberal Arts & Social Sciences": ["BA Liberal Arts", "BS Social Sciences", "BA English Literature"],
  "School of Media and Mass Communication": ["BS Mass Communication", "BS Media Studies"],
  "School of Computer & IT": ["BS Computer Science", "BS Software Engineering", "BS Information Technology"],
  "School of Education": ["BEd", "MEd"],
  "School of Management Sciences": ["BBA", "MBA"],
  "Institute of Psychology": ["BS Psychology", "MS Psychology"],
};

const FIRST = [
  "Ali", "Ayesha", "Bilal", "Zainab", "Hassan", "Fatima", "Usman", "Hira",
  "Omar", "Sana", "Ahmed", "Maryam", "Hamza", "Iqra", "Yousuf", "Nida",
  "Saad", "Amna", "Faisal", "Rabia", "Danyal", "Sadia", "Kamran", "Mahnoor",
  "Zeeshan", "Anum", "Talha", "Kinza", "Ibrahim", "Mehreen",
];
const LAST = [
  "Khan", "Ahmed", "Malik", "Chaudhry", "Sheikh", "Raza", "Iqbal", "Butt",
  "Qureshi", "Bhatti", "Siddiqui", "Farooq", "Nawaz", "Aslam", "Javed",
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
    version: 1,
    effectiveFrom: "2024-09-01",
    schools: [] as string[],
    programmes: [] as string[],
    batches: [...BATCHES],
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
        { id: "r4", kind: "Cohort rank", percentile: 18, description: "Top 18% per cohort, Fall 2024+" },
      ],
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
      const studyLevel: "Bachelors" | "Masters" = programme.startsWith("M") ? "Masters" : "Bachelors";
      const geo = GEO_TRIPLES[(n + i * 7) % GEO_TRIPLES.length]!;
      const domicile = geo.city;
      batchSeq[batch] = (batchSeq[batch] ?? 0) + 1;
      students.push({
        regNo: regNoFor(batch, batchSeq[batch]),
        name: `${first} ${last}`,
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
      });
      n++;
    }
  }
  return students;
}

export function seedAwards(students: Student[]): Award[] {
  const awards: Award[] = [];
  const now = "2025-09-01";
  const push = (
    studentRegNo: string,
    schId: string,
    version: number,
    components: Award["components"],
  ) => {
    awards.push({
      id: `aw-${awards.length + 1}`,
      studentRegNo,
      scholarshipId: schId,
      scholarshipVersion: version,
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
    push(s.regNo, "sch-merit", 1, [
      {
        feeHead: "Tuition",
        entitlement: 75,
        entitlementKind: "Percentage",
        entitlementValue: 75,
        applied: 0,
        isOverridden: false,
      },
    ]);
    push(s.regNo, "sch-need", 1, [
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
    push(pinned.regNo, "sch-vc", 1, [
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
    push(pinned.regNo, "sch-need", 1, [
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
  const singles: [number, string, number, "Percentage" | "Full waiver" | "Fixed amount", number][] = [
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
    push(s.regNo, schId, 1, [
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
    push(s.regNo, "sch-need", 1, [
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

export function seedGainedLostBySemester(): { semester: string; gained: number; lost: number }[] {
  const gained = [14, 19, 23, 27, 31, 12];
  const lost = [3, 5, 6, 8, 9, 2];
  return SEMESTERS.map((semester, i) => ({
    semester,
    gained: gained[i]!,
    lost: lost[i]!,
  }));
}