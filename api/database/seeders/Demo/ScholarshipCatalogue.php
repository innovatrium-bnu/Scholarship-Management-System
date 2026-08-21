<?php

declare(strict_types=1);

namespace Database\Seeders\Demo;

use App\Domain\Support\BatchOrder;
use Illuminate\Support\Str;

/**
 * The eleven scholarships, their coverage, their rules and their criteria.
 *
 * A faithful port of seedScholarships() and seedCriteria() in
 * src/lib/scholarship/seed.ts. The set is not arbitrary: between them the
 * eleven exercise every branch the merge, the evaluator and the screening
 * engine have, and the comment on each says which one. Dropping any of them
 * leaves a code path with nothing on screen that reaches it.
 *
 * ## Slugs are not ids
 *
 * seed.ts identifies a scholarship as "sch-vc". The scholarships table's
 * primary key is `ulid`, which laravel-oci8 compiles to CHAR(26) — a
 * fixed-width type, so Oracle blank-pads anything shorter to 26 characters on
 * the way in and hands it back padded. 'sch-vc' would insert without complaint
 * and then fail to match itself in half the places that compare it, since
 * CHAR-to-VARCHAR2 comparison does not pad.
 *
 * So the slugs stay in PHP as the way this file and the award generator refer
 * to each other, and each one is issued a real ULID at build time. ids() is the
 * map between them; nothing outside this namespace sees a slug.
 */
final class ScholarshipCatalogue
{
    public const VC = 'sch-vc';

    public const DEAN = 'sch-dean';

    public const NEED = 'sch-need';

    public const MERIT = 'sch-merit';

    public const TALENT_F23 = 'sch-talent-f23';

    public const TALENT_F24 = 'sch-talent-f24';

    public const LEGACY_ARTS = 'sch-legacy-arts';

    public const TRANS = 'sch-trans';

    public const SPORTS = 'sch-sports';

    public const INSTITUTIONAL = 'sch-inst';

    public const EXTERNAL = 'sch-ext';

    /** seed.ts SEMESTERS[0] — the earliest term the demo data covers. */
    private const FIRST_SEMESTER = 'Fall 2023';

    /** slug => id, filled by build(). */
    private array $ids = [];

    /**
     * Every row the scholarship side of the demo needs, keyed by table.
     *
     * Built rather than inserted, so DemoSeeder decides the transaction. The
     * order the keys come back in is the order they must be written in: a
     * coverage line has a foreign key into scholarships, and a cgpa threshold
     * has one into eligibility_criteria.
     *
     * @return array<string, list<array<string, mixed>>>
     */
    public function build(): array
    {
        $tables = [
            'scholarships' => [],
            'coverage_lines' => [],
            'scholarship_rules' => [],
            'eligibility_criteria' => [],
            'cgpa_thresholds' => [],
        ];

        foreach (self::definitions() as $precedence => $definition) {
            $id = (string) Str::ulid();
            $this->ids[$definition['slug']] = $id;

            $tables['scholarships'][] = $this->scholarshipRow($id, $precedence, $definition);

            foreach ($definition['coverage'] as $line) {
                $tables['coverage_lines'][] = [
                    'id' => (string) Str::ulid(),
                    'scholarship_id' => $id,
                    'fee_head' => $line['feeHead'],
                    'benefit_kind' => $line['benefitKind'],
                    'value' => $line['value'],
                    'conditional_on' => $line['conditionalOn'] ?? null,
                ];
            }

            foreach (['award', 'retention'] as $type) {
                foreach ($definition[$type.'Rules'] ?? [] as $order => $rule) {
                    $tables['scholarship_rules'][] = [
                        'id' => (string) Str::ulid(),
                        'scholarship_id' => $id,
                        'rule_type' => $type,
                        'kind' => $rule['kind'],
                        'field' => $rule['field'] ?? null,
                        'operator' => $rule['operator'] ?? null,
                        // Stored as varchar2 because types.ts types it
                        // `string | number` and Oracle has no such union. The
                        // mapper hands numeric values back as numbers; see the
                        // note on ScholarshipMapper::threshold().
                        'threshold' => isset($rule['threshold']) ? (string) $rule['threshold'] : null,
                        'description' => $rule['description'] ?? null,
                        'weights' => isset($rule['weights']) ? Row::json($rule['weights']) : null,
                        'percentile' => $rule['percentile'] ?? null,
                        'sort_order' => $order,
                    ];
                }
            }
        }

        [$criteria, $thresholds] = $this->criteria();
        $tables['eligibility_criteria'] = $criteria;
        $tables['cgpa_thresholds'] = $thresholds;

        return $tables;
    }

    /**
     * slug => id, valid only after build().
     *
     * @return array<string, string>
     */
    public function ids(): array
    {
        return $this->ids;
    }

    /**
     * One scholarships row.
     *
     * @param  array<string, mixed>  $definition
     * @return array<string, mixed>
     */
    private function scholarshipRow(string $id, int $precedence, array $definition): array
    {
        return [
            'id' => $id,
            'name' => $definition['name'],
            'description' => $definition['description'],
            'study_level' => $definition['studyLevel'],

            /*
             * Which scholarship claims a fee head first when two overlap. In
             * the prototype this was the array index in scholarships[]; here it
             * is the index in definitions(), which is the same order, made
             * explicit. Every endpoint returning scholarships orders by it, and
             * the browser's copy of the merge takes the order it is given — so
             * a gap or a duplicate here is different money on screen from in
             * the database.
             */
            'precedence' => $precedence,

            'schools' => Row::json($definition['schools'] ?? []),
            'programmes' => Row::json($definition['programmes'] ?? []),
            'batches' => Row::json($definition['batches'] ?? BatchOrder::DEFAULT),
            'batch_mode' => $definition['batchMode'] ?? 'all',
            'batch_from' => $definition['batchFrom'] ?? null,

            'semester_from' => $definition['semesterFrom'] ?? self::FIRST_SEMESTER,
            'semester_till' => $definition['semesterTill'] ?? null,
            'all_semesters' => Row::bool($definition['allSemesters'] ?? true),
            'review_cycle' => $definition['reviewCycle'],

            'max_duration_years' => $definition['maxDurationYears'],
            'work_study_hours_per_month' => $definition['workStudyHoursPerMonth'] ?? 0,
            'requires_reapplication' => Row::bool($definition['requiresReapplication'] ?? false),

            'funding_source' => $definition['fundingSource'] ?? 'Internal',
            'donor_name' => $definition['donorName'] ?? null,
            'quota_per_cohort' => $definition['quotaPerCohort'] ?? null,

            'status' => $definition['status'],
            'effective_from' => Row::date($definition['effectiveFrom'] ?? '2024-09-01'),
            'may_exceed_ceiling' => Row::bool($definition['mayExceedCeiling'] ?? false),

            'created_at' => Row::stamp($definition['effectiveFrom'] ?? '2024-09-01', '10:00:00'),
            'updated_at' => Row::stamp(StudentGenerator::AS_OF, '10:00:00'),
        ];
    }

    /**
     * What one scholarship covers, as its awards will be entitled to it.
     *
     * Read from the same literal the coverage_lines rows are built from, rather
     * than restated in the award generator. An award's components are a copy of
     * its scholarship's coverage taken at grant time, and two copies of that
     * list would be two chances for a 50% scholarship to grant 40%.
     *
     * @return list<array<string, mixed>>
     */
    public static function coverageOf(string $slug): array
    {
        foreach (self::definitions() as $definition) {
            if ($definition['slug'] === $slug) {
                return $definition['coverage'];
            }
        }

        throw new \InvalidArgumentException("No demo scholarship called {$slug}");
    }

    /**
     * The eleven, in precedence order.
     *
     * Precedence is the array order, and the order is a policy statement rather
     * than a preference: the VC award claims tuition before anything else, and
     * the donor-funded need award comes last because it is the one permitted to
     * exceed the ceiling, so it should only ever be adding to what the internal
     * awards did not cover.
     *
     * @return list<array<string, mixed>>
     */
    private static function definitions(): array
    {
        return [
            /*
             * Cohort rank with a quota. The only scholarship with
             * quotaPerCohort set, so it is the one that shows what happens when
             * more students qualify than there is room for.
             */
            [
                'slug' => self::VC,
                'name' => 'VC Scholarship',
                'description' => "Vice Chancellor's flagship award for top incoming Bachelors students.",
                'studyLevel' => 'Bachelors',
                'reviewCycle' => 'Every semester',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 100],
                    ['feeHead' => 'Hostel', 'benefitKind' => 'Full waiver', 'value' => 100],
                ],
                'maxDurationYears' => 4,
                'workStudyHoursPerMonth' => 8,
                'quotaPerCohort' => 1,
                'status' => 'Active',
                'awardRules' => [
                    ['kind' => 'Cohort rank', 'percentile' => 1, 'description' => 'Top 1 per cohort'],
                ],
                'retentionRules' => [
                    ['kind' => 'Automatic', 'field' => 'cgpa', 'operator' => '>=', 'threshold' => 3.7],
                ],
            ],

            /* A plain automatic retention rule, reviewed annually. */
            [
                'slug' => self::DEAN,
                'name' => "Dean's Scholarship",
                'description' => 'Awarded to high-achieving Bachelors students, reviewed annually.',
                'studyLevel' => 'Bachelors',
                'reviewCycle' => 'Annual',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 100],
                ],
                'maxDurationYears' => 4,
                'workStudyHoursPerMonth' => 8,
                'status' => 'Active',
                'retentionRules' => [
                    ['kind' => 'Automatic', 'field' => 'cgpa', 'operator' => '>=', 'threshold' => 3.5],
                ],
            ],

            /*
             * The only scholarship with eligibility criteria attached, and so
             * the only one the screening engine and the review queue have
             * anything to say about. requiresReapplication is what makes it
             * need-based rather than automatic.
             */
            [
                'slug' => self::NEED,
                'name' => 'Need-Based Scholarship',
                'description' => 'Financial need scholarship, renewed annually with fresh application.',
                'studyLevel' => 'Both',
                'reviewCycle' => 'Annual',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 50],
                ],
                'maxDurationYears' => 4,
                'requiresReapplication' => true,
                'status' => 'Active',
            ],

            /*
             * Percentile rather than a fixed rank, and scoped to one semester
             * onwards rather than to all of them — the two scoping mechanisms
             * that are not batch-based.
             */
            [
                'slug' => self::MERIT,
                'name' => 'Merit-Based Scholarship',
                'description' => 'Semester merit award. Excludes School of Education.',
                'studyLevel' => 'Bachelors',
                'reviewCycle' => 'Every semester',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 75],
                ],
                'maxDurationYears' => 4,
                'semesterFrom' => 'Fall 2024',
                'allSemesters' => false,
                'status' => 'Active',
                'awardRules' => [
                    [
                        'kind' => 'Cohort rank',
                        'percentile' => 18,
                        'description' => 'Top 18% per cohort, Fall 2024+',
                    ],
                ],
            ],

            /*
             * These two are the worked example of how a change of terms is
             * handled without versioning: the older intake keeps its own
             * scholarship at the old rate, and a second one covers every intake
             * from Fall 2024 on. Between them they are the only demonstration
             * of batchMode "list" and batchMode "onwards".
             */
            [
                'slug' => self::TALENT_F23,
                'name' => 'Talent Award (Fall 2023 intake)',
                'description' => 'Tuition support at the original 40% rate, for the Fall 2023 intake only.',
                'studyLevel' => 'Bachelors',
                'reviewCycle' => 'Annual',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 40],
                ],
                'maxDurationYears' => 4,
                'batches' => ['Fall 2023'],
                'batchMode' => 'list',
                'status' => 'Active',
            ],
            [
                'slug' => self::TALENT_F24,
                'name' => 'Talent Award (Fall 2024 onwards)',
                'description' => 'Replaces the Fall 2023 award for every later intake, at the revised 30% rate.',
                'studyLevel' => 'Bachelors',
                'reviewCycle' => 'Annual',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 30],
                ],
                'maxDurationYears' => 4,
                'batches' => ['Fall 2024', 'Spring 2025', 'Fall 2025'],
                'batchMode' => 'onwards',
                'batchFrom' => 'Fall 2024',
                'status' => 'Active',
            ],

            /* The one archived scholarship, so the Retired page is not empty. */
            [
                'slug' => self::LEGACY_ARTS,
                'name' => 'Legacy Arts Bursary',
                'description' => 'Discontinued after the 2023 funding round. Kept on record only.',
                'studyLevel' => 'Bachelors',
                'reviewCycle' => 'Annual',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 25],
                ],
                'maxDurationYears' => 4,
                'batches' => ['Fall 2021', 'Spring 2022', 'Fall 2022'],
                'batchMode' => 'list',
                'status' => 'Archived',
            ],

            /*
             * The only conditional coverage line, and the only fixed-amount
             * one. Both branches of merge.ts's fee handling are unreachable on
             * screen without it.
             */
            [
                'slug' => self::TRANS,
                'name' => 'Transgender Inclusion Scholarship',
                'description' => 'Inclusion award with tuition and conditional hostel support.',
                'studyLevel' => 'Both',
                'reviewCycle' => 'Annual',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 50],
                    [
                        'feeHead' => 'Hostel',
                        'benefitKind' => 'Fixed amount',
                        'value' => 20000,
                        'conditionalOn' => 'Student is not domiciled in Lahore',
                    ],
                ],
                'maxDurationYears' => 4,
                'status' => 'Active',
            ],

            [
                'slug' => self::SPORTS,
                'name' => 'Sports Scholarship',
                'description' => 'For students representing BNU in competitive sports.',
                'studyLevel' => 'Bachelors',
                'reviewCycle' => 'Every semester',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 30],
                ],
                'maxDurationYears' => 4,
                'status' => 'Active',
            ],

            [
                'slug' => self::INSTITUTIONAL,
                'name' => 'BNU Institutional Support',
                'description' => 'For students from MOU partner schools.',
                'studyLevel' => 'Both',
                'reviewCycle' => 'Annual',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 25],
                ],
                'maxDurationYears' => 4,
                'status' => 'Active',
            ],

            /*
             * Last in precedence and the only one that may exceed the ceiling,
             * which is the combination that makes it safe: it can only add to
             * what the internal awards left uncovered. Also the only donor-
             * funded row, so the funding-source split has both sides.
             */
            [
                'slug' => self::EXTERNAL,
                'name' => 'Externally Funded Need-Based',
                'description' => 'Donor-funded need scholarship. May exceed 100% ceiling by donor agreement.',
                'studyLevel' => 'Both',
                'reviewCycle' => 'Annual',
                'coverage' => [
                    ['feeHead' => 'Tuition', 'benefitKind' => 'Percentage', 'value' => 40],
                ],
                'maxDurationYears' => 4,
                'fundingSource' => 'Donor',
                'donorName' => 'Aslam Foundation',
                'status' => 'Active',
                'mayExceedCeiling' => true,
            ],
        ];
    }

    /**
     * The eligibility criteria the automatic filter applies, and its CGPA
     * ladder.
     *
     * One scholarship has criteria, which is the same as in seed.ts and is not
     * an omission — the need-based award is the only one an application is made
     * for, so it is the only one a filter has anything to filter. Every number
     * here is editable at /settings/criteria and nothing in the screening
     * engine hardcodes any of it.
     *
     * The policy is the Registrar Office's: CGPA 2.65 for the Fall 2024 intake
     * onwards, 2.50 for Fall 2023.
     *
     * @return array{0: list<array<string, mixed>>, 1: list<array<string, mixed>>}
     */
    private function criteria(): array
    {
        $id = $this->ids[self::NEED];

        $criteria = [[
            'scholarship_id' => $id,
            'max_monthly_income' => 150000,
            'min_credit_hours' => 12,
            'min_attendance_pct' => 75,
            'required_documents' => Row::json([
                'CNIC',
                'Income certificate',
                'Utility bill',
                "Father's salary slip / affidavit",
            ]),
            'max_existing_coverage_pct' => 50,

            /*
             * Attendance and existing coverage are deliberately absent: both
             * need a person to weigh the circumstances, so they raise a flag on
             * the application rather than turning it down. This list is the
             * switch that decides how aggressive the filter is, and it is data
             * rather than code for that reason.
             */
            'auto_reject_on' => Row::json(['cgpa', 'income', 'creditHours', 'documents', 'duplicate']),

            'created_at' => Row::stamp('2024-09-01', '10:00:00'),
            'updated_at' => Row::stamp(StudentGenerator::AS_OF, '10:00:00'),
        ]];

        $thresholds = [
            [
                'id' => (string) Str::ulid(),
                'scholarship_id' => $id,
                'from_batch' => 'Fall 2023',
                'min_cgpa' => 2.50,
            ],
            [
                'id' => (string) Str::ulid(),
                'scholarship_id' => $id,
                'from_batch' => 'Fall 2024',
                'min_cgpa' => 2.65,
            ],
        ];

        return [$criteria, $thresholds];
    }
}
