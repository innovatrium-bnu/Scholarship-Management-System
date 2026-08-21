<?php

namespace Database\Seeders;

use App\Domain\Support\BatchOrder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Reference data, seeded from the same values as src/lib/scholarship/seed.ts.
 *
 * These lists are duplicated between here and seed.ts on purpose, for now. The
 * frontend still imports SCHOOLS, BATCHES, SEMESTERS, GEOGRAPHY and PROGRAMMES
 * directly from seed.ts, and leaving that alone is what keeps the eight files
 * doing so unchanged. When the API starts serving reference data, seed.ts loses
 * the constants and this becomes the only copy.
 *
 * Until then: change one, change the other. ReferenceDataTest guards it.
 */
class ReferenceSeeder extends Seeder
{
    /** seed.ts SCHOOLS */
    public const SCHOOLS = [
        'Mariam Dawood School of Visual Arts & Design',
        'Razia Hassan School of Architecture',
        'Seeta Majeed School of Liberal Arts & Social Sciences',
        'School of Media and Mass Communication',
        'School of Computer & IT',
        'School of Education',
        'School of Management Sciences',
        'Institute of Psychology',
    ];

    /** seed.ts PROGRAMMES */
    public const PROGRAMMES = [
        'Mariam Dawood School of Visual Arts & Design' => [
            'BFA', 'MFA', 'BDes Communication Design', 'BDes Textile',
        ],
        'Razia Hassan School of Architecture' => [
            'BS Architecture', 'M.Arch',
        ],
        'Seeta Majeed School of Liberal Arts & Social Sciences' => [
            'BA Liberal Arts', 'BS Social Sciences', 'BA English Literature',
        ],
        'School of Media and Mass Communication' => [
            'BS Mass Communication', 'BS Media Studies',
        ],
        'School of Computer & IT' => [
            'BS Computer Science', 'BS Software Engineering', 'BS Information Technology',
        ],
        'School of Education' => [
            'BEd', 'MEd',
        ],
        'School of Management Sciences' => [
            'BBA', 'MBA',
        ],
        'Institute of Psychology' => [
            'BS Psychology', 'MS Psychology',
        ],
    ];

    /**
     * seed.ts BATCHES — order is meaningful: batchMode "onwards" reads it, and
     * so does minCgpaFor. Defined in the domain rather than here, because the
     * screening service needs the same sequence as a default and must not
     * depend on a seeder to get it.
     */
    public const BATCHES = BatchOrder::DEFAULT;

    /** seed.ts SEMESTERS */
    public const SEMESTERS = [
        'Fall 2023', 'Spring 2024', 'Fall 2024', 'Spring 2025', 'Fall 2025', 'Spring 2026',
    ];

    /** seed.ts QUOTAS */
    public const QUOTAS = [
        'Merit', 'Self-Finance', 'Overseas', 'Sports', 'Staff Ward',
        'Special Needs', 'Kashmir / FATA',
    ];

    /** seed.ts GEOGRAPHY */
    public const GEOGRAPHY = [
        'Punjab' => [
            'Lahore' => ['Lahore Cantt', 'Model Town', 'Gulberg', 'DHA'],
            'Faisalabad' => ['Faisalabad City', 'Jaranwala'],
            'Multan' => ['Multan City', 'Shujabad'],
            'Rawalpindi' => ['Rawalpindi Cantt', 'Taxila'],
        ],
        'Sindh' => [
            'Karachi' => ['Karachi Central', 'Karachi South', 'Karachi East'],
            'Hyderabad' => ['Hyderabad City', 'Latifabad'],
        ],
        'KPK' => [
            'Peshawar' => ['Peshawar City', 'Hayatabad'],
        ],
        'Balochistan' => [
            'Quetta' => ['Quetta City', 'Sariab'],
        ],
    ];

    /** types.ts CORE_FEE_HEADS — the four merge.ts feeOf() knows by name. */
    public const CORE_FEE_HEADS = ['Tuition', 'Hostel', 'Mess', 'Other'];

    public function run(): void
    {
        DB::transaction(function () {
            $this->seedSchoolsAndProgrammes();
            $this->seedBatches();
            $this->seedSemesters();
            $this->seedQuotas();
            $this->seedGeography();
            $this->seedFeeHeads();
        });
    }

    private function seedSchoolsAndProgrammes(): void
    {
        foreach (self::SCHOOLS as $i => $school) {
            DB::table('schools')->updateOrInsert(
                ['name' => $school],
                ['sort_order' => $i],
            );
        }

        foreach (self::PROGRAMMES as $school => $programmes) {
            foreach ($programmes as $programme) {
                DB::table('programmes')->updateOrInsert(
                    ['name' => $programme],
                    [
                        'school' => $school,
                        // seed.ts:437 derives the level from the programme name
                        // the same way. Every masters programme here starts
                        // with M (MFA, M.Arch, MEd, MBA, MS Psychology) and no
                        // bachelors one does.
                        'study_level' => str_starts_with($programme, 'M') ? 'Masters' : 'Bachelors',
                    ],
                );
            }
        }
    }

    private function seedBatches(): void
    {
        foreach (self::BATCHES as $i => $label) {
            DB::table('batches')->updateOrInsert(
                ['label' => $label],
                ['sort_order' => $i],
            );
        }
    }

    private function seedSemesters(): void
    {
        foreach (self::SEMESTERS as $i => $label) {
            [$term, $year] = explode(' ', $label);

            /**
             * These bounds match semesterOf() in seed.ts, which classifies a
             * date by `month <= 6 ? "Spring" : "Fall"` — so Spring is January
             * to June and Fall is July to December.
             *
             * They are deliberately wider than dateOfSemester(), which returns
             * 1 February and 1 September. That function answers "when does
             * teaching start", which is what a form needs when it has a term
             * and wants a date. These columns answer "which term does this date
             * fall in", which is what a report needs. Using the teaching dates
             * here would leave January and July through August belonging to no
             * term at all.
             */
            /**
             * Written with the time part, which is not decoration. The driver
             * sets NLS_DATE_FORMAT to 'YYYY-MM-DD HH24:MI:SS' for the session,
             * and Oracle converts a bound string to DATE using exactly that
             * format. A bare 'YYYY-MM-DD' is relying on it to forgive the
             * missing half. Midnight is what an Oracle DATE stores for these
             * anyway, so nothing about the value changes.
             */
            $startsOn = $term === 'Spring' ? "$year-01-01 00:00:00" : "$year-07-01 00:00:00";
            $endsOn = $term === 'Spring' ? "$year-06-30 00:00:00" : "$year-12-31 00:00:00";

            DB::table('semesters')->updateOrInsert(
                ['label' => $label],
                ['sort_order' => $i, 'starts_on' => $startsOn, 'ends_on' => $endsOn],
            );
        }
    }

    private function seedQuotas(): void
    {
        foreach (self::QUOTAS as $quota) {
            DB::table('quotas')->updateOrInsert(['name' => $quota], []);
        }
    }

    private function seedGeography(): void
    {
        foreach (self::GEOGRAPHY as $province => $cities) {
            foreach ($cities as $city => $districts) {
                foreach ($districts as $district) {
                    DB::table('geography')->updateOrInsert(
                        ['province' => $province, 'city' => $city, 'district' => $district],
                        [],
                    );
                }
            }
        }
    }

    private function seedFeeHeads(): void
    {
        foreach (self::CORE_FEE_HEADS as $i => $name) {
            DB::table('fee_heads')->updateOrInsert(
                ['name' => $name],
                ['is_core' => true, 'sort_order' => $i],
            );
        }
    }
}
