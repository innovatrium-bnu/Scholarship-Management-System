<?php

declare(strict_types=1);

namespace Database\Seeders\Demo;

use App\Domain\Support\BatchOrder;

/**
 * The register: 2,000 students who do not exist.
 *
 * This is the PHP port DatabaseSeeder has been pointing at since the schema
 * landed — "the demo set has to be generated the way seed.ts generates it",
 * because no real student record may enter this repository. It generates the
 * same kind of data by the same means, at eighteen times the size and with the
 * distributions taken seriously rather than approximated.
 *
 * Every reference value it uses is a foreign key into a table ReferenceSeeder
 * has already filled. DemoSeederTest holds the two together, because a school
 * misspelled here is not a failed insert — it is an ORA-02291 halfway through a
 * seed, or worse, a student nobody can filter by.
 *
 * ## Why the distributions are shaped rather than uniform
 *
 * A demo database is not judged in the aggregate. It is judged one screen at a
 * time, and a uniform spread breaks screens in specific ways. A flat CGPA puts
 * an eighth of every cohort over 3.7, so the Dean's list shows hundreds and the
 * criteria screen looks mis-set. An even batch spread leaves the current intake
 * — the only cohort anyone assigns to — smaller than the ones that graduated. A
 * hostel fee on every student makes a conditional hostel coverage line
 * indistinguishable from an unconditional one.
 *
 * So each table below is a claim about the university, and the comment on it
 * says which screen the claim is for.
 */
final class StudentGenerator
{
    /** The term the demo data sits in. seed.ts CURRENT_SEMESTER. */
    public const CURRENT_SEMESTER = 'Fall 2025';

    /** When the demo register was notionally last updated. */
    public const AS_OF = '2025-09-01';

    /**
     * Relative sizes of the eight schools.
     *
     * Computer & IT and Management Sciences carry most of a BNU intake;
     * Education and Architecture are small. The ratios matter to the
     * cohort-rank rules more than anywhere else: "top 1 per cohort" against a
     * school of 40 and a school of 500 are different awards, and a demo where
     * every school is the same size cannot show that.
     */
    private const SCHOOL_WEIGHTS = [
        'Mariam Dawood School of Visual Arts & Design' => 10,
        'Razia Hassan School of Architecture' => 7,
        'Seeta Majeed School of Liberal Arts & Social Sciences' => 12,
        'School of Media and Mass Communication' => 11,
        'School of Computer & IT' => 24,
        'School of Education' => 6,
        'School of Management Sciences' => 22,
        'Institute of Psychology' => 8,
    ];

    /**
     * Programme => [registration-number code, relative weight].
     *
     * The codes are what makes a registration number readable — F25-BSCS-014
     * says intake, programme and sequence, which is what the university's own
     * numbers do and what the students table gives as its example. Masters
     * programmes carry low weights because they are small everywhere except
     * Management Sciences.
     */
    private const PROGRAMMES = [
        'Mariam Dawood School of Visual Arts & Design' => [
            'BFA' => ['BFA', 5],
            'MFA' => ['MFA', 1],
            'BDes Communication Design' => ['BDCD', 4],
            'BDes Textile' => ['BDTX', 3],
        ],
        'Razia Hassan School of Architecture' => [
            'BS Architecture' => ['BSAR', 6],
            'M.Arch' => ['MARC', 1],
        ],
        'Seeta Majeed School of Liberal Arts & Social Sciences' => [
            'BA Liberal Arts' => ['BALA', 4],
            'BS Social Sciences' => ['BSSS', 4],
            'BA English Literature' => ['BAEL', 3],
        ],
        'School of Media and Mass Communication' => [
            'BS Mass Communication' => ['BSMC', 5],
            'BS Media Studies' => ['BSMS', 3],
        ],
        'School of Computer & IT' => [
            'BS Computer Science' => ['BSCS', 7],
            'BS Software Engineering' => ['BSSE', 4],
            'BS Information Technology' => ['BSIT', 3],
        ],
        'School of Education' => [
            'BEd' => ['BED', 4],
            'MEd' => ['MED', 2],
        ],
        'School of Management Sciences' => [
            'BBA' => ['BBA', 6],
            'MBA' => ['MBA', 3],
        ],
        'Institute of Psychology' => [
            'BS Psychology' => ['BSPS', 5],
            'MS Psychology' => ['MSPS', 1],
        ],
    ];

    /**
     * Relative sizes of the nine intakes.
     *
     * Two shapes at once. Fall intakes are three to four times the size of
     * Spring ones, which is how a Pakistani university admits. And the older an
     * intake is, the fewer of it is still on the register — some graduated, some
     * left — so the counts fall away going back even though the university grew.
     *
     * Fall 2025 is about 40% of the whole register, as seed.ts also arranged.
     * The assignment screens only ever run against the current intake, and a
     * demo where that cohort is 200 students cannot show what a batch
     * assignment across a real one looks like.
     */
    private const BATCH_WEIGHTS = [
        'Fall 2021' => 12,
        'Spring 2022' => 7,
        'Fall 2022' => 16,
        'Spring 2023' => 9,
        'Fall 2023' => 22,
        'Spring 2024' => 11,
        'Fall 2024' => 28,
        'Spring 2025' => 14,
        'Fall 2025' => 81,
    ];

    /**
     * Semester tuition in rupees, by school, for a Bachelors programme.
     *
     * Masters is 15% more. These are the numbers every coverage bar, every
     * ceiling conflict and every rupee figure on the reports screen is computed
     * from, so they are set per school rather than flat: a 50% waiver worth
     * 137,500 in Education and 205,000 in Architecture is exactly the difference
     * the finance view exists to show.
     */
    private const TUITION = [
        'Mariam Dawood School of Visual Arts & Design' => 385000,
        'Razia Hassan School of Architecture' => 410000,
        'Seeta Majeed School of Liberal Arts & Social Sciences' => 320000,
        'School of Media and Mass Communication' => 340000,
        'School of Computer & IT' => 365000,
        'School of Education' => 275000,
        'School of Management Sciences' => 355000,
        'Institute of Psychology' => 310000,
    ];

    /** Schools whose programmes carry a studio or lab charge. */
    private const LAB_SCHOOLS = [
        'Mariam Dawood School of Visual Arts & Design',
        'Razia Hassan School of Architecture',
        'School of Computer & IT',
    ];

    /**
     * Admission categories.
     *
     * Self-Finance dominates because it does. Merit is next because it is the
     * category most scholarships are scoped against, and Kashmir / FATA is a
     * reserved-seat quota sized like one.
     */
    private const QUOTA_WEIGHTS = [
        'Self-Finance' => 45,
        'Merit' => 22,
        'Kashmir / FATA' => 11,
        'Staff Ward' => 8,
        'Sports' => 6,
        'Overseas' => 4,
        'Special Needs' => 4,
    ];

    /**
     * Where students come from, as province|city|district, weighted.
     *
     * Lahore is a little over half, which is what a Lahore university looks
     * like, and is the reason isOutOfStation splits the register rather than
     * flagging all of it. That flag decides who has a hostel fee at all, and the
     * Transgender Inclusion Scholarship's conditional hostel line — "Student is
     * not domiciled in Lahore" — has nothing to demonstrate without both sides.
     *
     * Every triple appears in ReferenceSeeder::GEOGRAPHY, and DemoSeederTest
     * checks that rather than trusting it.
     */
    private const GEOGRAPHY_WEIGHTS = [
        'Punjab|Lahore|Lahore Cantt' => 13,
        'Punjab|Lahore|Model Town' => 14,
        'Punjab|Lahore|Gulberg' => 15,
        'Punjab|Lahore|DHA' => 12,
        'Punjab|Faisalabad|Faisalabad City' => 6,
        'Punjab|Faisalabad|Jaranwala' => 2,
        'Punjab|Multan|Multan City' => 5,
        'Punjab|Multan|Shujabad' => 2,
        'Punjab|Rawalpindi|Rawalpindi Cantt' => 6,
        'Punjab|Rawalpindi|Taxila' => 3,
        'Sindh|Karachi|Karachi Central' => 4,
        'Sindh|Karachi|Karachi South' => 4,
        'Sindh|Karachi|Karachi East' => 3,
        'Sindh|Hyderabad|Hyderabad City' => 2,
        'Sindh|Hyderabad|Latifabad' => 2,
        'KPK|Peshawar|Peshawar City' => 3,
        'KPK|Peshawar|Hayatabad' => 2,
        'Balochistan|Quetta|Quetta City' => 2,
        'Balochistan|Quetta|Sariab' => 1,
    ];

    /**
     * Female slightly ahead of male, matching an arts- and psychology-heavy
     * intake, and four students in a thousand recorded as Other.
     *
     * That last figure is small on purpose and is not decoration. The
     * Transgender Inclusion Scholarship is one of the eleven seeded
     * scholarships, and with no student it can reach it is a row on a list that
     * appears nowhere else in the demo.
     */
    private const GENDER_WEIGHTS = ['Female' => 520, 'Male' => 476, 'Other' => 4];

    /**
     * @return list<array<string, mixed>> rows ready for the students table
     */
    public function generate(int $total): array
    {
        $batches = BatchOrder::DEFAULT;
        $lastBatch = count($batches) - 1;

        $rows = [];
        $sequence = [];   // batch and programme code => how many issued so far
        $index = 0;       // salt for every draw; unique per student

        foreach (Draw::apportion($total, self::BATCH_WEIGHTS) as $batch => $inBatch) {
            $batchIndex = (int) array_search($batch, $batches, true);
            $termsElapsed = $lastBatch - $batchIndex;

            foreach (Draw::apportion($inBatch, self::SCHOOL_WEIGHTS) as $school => $inSchool) {
                for ($i = 0; $i < $inSchool; $i++) {
                    $rows[] = $this->student($index++, $batch, $termsElapsed, $school, $sequence);
                }
            }
        }

        return $rows;
    }

    /**
     * One student.
     *
     * Reads top to bottom: each block decides something the blocks below it
     * depend on. Gender before the name, because the name is drawn from a
     * gendered list. Programme before study level, because the level is derived
     * from the programme the way ReferenceSeeder derives it. Enrollment status
     * before credit hours, because a student on leave is registered for none.
     *
     * @param  array<string, int>  $sequence  carried between calls, by reference
     * @return array<string, mixed>
     */
    private function student(
        int $index,
        string $batch,
        int $termsElapsed,
        string $school,
        array &$sequence,
    ): array {
        /* -- who --------------------------------------------------------- */

        $gender = Draw::weighted('gender', $index, self::GENDER_WEIGHTS);

        $given = match ($gender) {
            'Male' => Names::MALE,
            'Female' => Names::FEMALE,
            default => array_merge(Names::MALE, Names::FEMALE),
        };

        $first = Draw::from('given', $index, $given);
        $family = Draw::from('family', $index, Names::FAMILY);

        /* -- what they are studying --------------------------------------- */

        $programmes = self::PROGRAMMES[$school];
        $programme = Draw::weighted(
            'programme',
            $index,
            array_map(fn (array $entry) => $entry[1], $programmes),
        );
        $code = $programmes[$programme][0];

        // The rule ReferenceSeeder derives study_level by, and the one seed.ts
        // uses: every masters programme in the catalogue starts with M and no
        // bachelors one does.
        $isMasters = str_starts_with($programme, 'M');
        $programmeTerms = $isMasters ? 4 : 8;

        /* -- their registration number ------------------------------------ */

        [$term, $year] = explode(' ', $batch);
        $key = $batch.'|'.$code;
        $sequence[$key] = ($sequence[$key] ?? 0) + 1;

        $regNo = sprintf(
            '%s%s-%s-%03d',
            $term === 'Spring' ? 'S' : 'F',
            substr($year, 2),
            $code,
            $sequence[$key],
        );

        /* -- where they are in the degree --------------------------------- */

        $finished = $termsElapsed >= $programmeTerms;

        // Past the length of the programme most have graduated and a few are
        // still finishing. Inside it, a small number are on leave or gone. The
        // register keeps all four, because the eligibility filter and every
        // cohort count have to be right about who is actually studying.
        $status = $finished
            ? (Draw::chance('finished', $index, 0.86) ? 'Graduated' : 'Enrolled')
            : Draw::weighted('status', $index, ['Enrolled' => 93, 'On leave' => 3, 'Withdrawn' => 4]);

        $currentSemester = min($programmeTerms, $termsElapsed + 1);

        // Registered credit hours are for this term, so only someone sitting in
        // it has any. minCreditHours in the criteria is 12, and a graduate
        // showing 15 would pass a filter meant to catch exactly that.
        $creditHours = $status === 'Enrolled'
            ? 12 + (int) (Draw::uniform('credits', $index) * 7)
            : 0;

        $earnedTerms = $status === 'Graduated' ? $programmeTerms : max(0, $currentSemester - 1);
        $creditsEarned = $earnedTerms * 15 + (int) (Draw::uniform('earned', $index) * 9);

        /* -- how they are doing -------------------------------------------- */

        $cgpa = round(1.70 + Draw::bell('cgpa', $index) * 2.30, 2);

        // Two corrections, both of them things a real register would show. You
        // do not graduate on a 1.8, and a student who withdrew was usually not
        // doing well when they did.
        if ($status === 'Graduated') {
            $cgpa = max(2.20, $cgpa);
        } elseif ($status === 'Withdrawn') {
            $cgpa = min(2.75, $cgpa);
        }

        // Owned by the attendance system; nothing in this application writes it.
        $attendance = round(55 + Draw::bell('attendance', $index) * 45, 2);

        if ($status !== 'Enrolled') {
            $attendance = round($attendance * 0.6, 2);
        }

        /* -- where they are from ------------------------------------------- */

        [$province, $city, $district] = explode(
            '|',
            Draw::weighted('geography', $index, self::GEOGRAPHY_WEIGHTS),
        );

        $outOfStation = $city !== 'Lahore';

        /* -- what they owe -------------------------------------------------- */

        $tuition = round(self::TUITION[$school] * ($isMasters ? 1.15 : 1.0) / 5000) * 5000;

        // Only students from out of town take a room, and not all of them —
        // plenty stay with family in Lahore. Mess follows hostel, because you
        // are on the meal plan if you are in the hall.
        $hostel = $outOfStation && Draw::chance('hostel', $index, 0.72) ? 80000 : 0;
        $mess = $hostel > 0 ? 40000 : 0;
        $other = in_array($school, self::LAB_SCHOOLS, true) ? 22000 : 15000;

        /* -- the admissions record ------------------------------------------ */

        $entryYear = (int) $year;
        $birthYear = $entryYear - 18 - (int) (Draw::uniform('birth-year', $index) * 4);
        $birthMonth = 1 + (int) (Draw::uniform('birth-month', $index) * 12);
        $birthDay = 1 + (int) (Draw::uniform('birth-day', $index) * 28);

        $admittedOn = sprintf('%d-%s-01', $entryYear, $term === 'Spring' ? '02' : '09');

        return [
            'reg_no' => $regNo,
            'name' => $first.' '.$family,
            'school' => $school,
            'programme' => $programme,
            'study_level' => $isMasters ? 'Masters' : 'Bachelors',
            'batch' => $batch,

            'cgpa' => $cgpa,
            'credit_hours' => $creditHours,

            'domicile' => $city,
            'is_out_of_station' => Row::bool($outOfStation),

            'tuition_fee' => $tuition,
            'hostel_fee' => $hostel,
            'mess_fee' => $mess,
            'other_fee' => $other,

            'province' => $province,
            'city' => $city,
            'district' => $district,

            // What a person ticks by hand, and what the "Manual" rule kind
            // checks. About a fifth of the register has a verified need, which
            // is what makes the need-based scholarship's pool a pool.
            'financial_need_verified' => Row::bool(Draw::chance('need', $index, 0.22)),
            'personal_statement_ok' => Row::bool(Draw::chance('statement', $index, 0.65)),
            'has_sports_medal' => Row::bool(Draw::chance('sports', $index, 0.04)),
            'bfit_member' => Row::bool(Draw::chance('bfit', $index, 0.14)),

            'quota' => Draw::weighted('quota', $index, self::QUOTA_WEIGHTS),
            'gender' => $gender,
            'date_of_birth' => Row::date(sprintf('%04d-%02d-%02d', $birthYear, $birthMonth, $birthDay)),

            'father_name' => Draw::from('father', $index, Names::MALE).' '.$family,
            'email' => $this->email($first, $family, $regNo),
            'phone' => $this->phone($index),

            'attendance_pct' => $attendance,

            // No photographs. A URL here would either be dead or would be a
            // picture of somebody, and the register is meant to be neither.
            'photo_url' => null,

            'admission_date' => Row::date($admittedOn),
            'enrollment_status' => $status,
            'current_semester' => $currentSemester,
            'credits_earned' => $creditsEarned,

            'created_at' => Row::stamp($admittedOn, '08:00:00'),
            'updated_at' => Row::stamp(self::AS_OF, '08:00:00'),
        ];
    }

    /**
     * first.family.regno@bnu.edu.pk, reduced to what an address may hold.
     *
     * The registration number is in there because two students really can be
     * Ali Khan, and an address collision would be a duplicate the register
     * cannot show. Names with a space or a hyphen — Qurat-ul-Ain, Ghulam Abbas —
     * are stripped to letters rather than left to make an invalid address.
     */
    private function email(string $first, string $family, string $regNo): string
    {
        $part = fn (string $value) => mb_strtolower((string) preg_replace('/[^A-Za-z]/', '', $value));

        return $part($first).'.'.$part($family).'.'
            .mb_strtolower(str_replace('-', '', $regNo)).'@bnu.edu.pk';
    }

    /** A Pakistani mobile number, in the shape a form would accept. */
    private function phone(int $index): string
    {
        $network = 300 + (int) (Draw::uniform('network', $index) * 46);   // 0300-0345
        $line = 1000000 + (int) (Draw::uniform('line', $index) * 8999999);

        return sprintf('+92 %d %d', $network, $line);
    }

    /* -- what DemoSeederTest holds against ReferenceSeeder ----------------- */

    /** @return list<string> */
    public static function schools(): array
    {
        return array_keys(self::SCHOOL_WEIGHTS);
    }

    /** @return array<string, list<string>> */
    public static function programmes(): array
    {
        return array_map(fn (array $entry) => array_keys($entry), self::PROGRAMMES);
    }

    /** @return list<string> province|city|district triples this generator uses */
    public static function geography(): array
    {
        return array_keys(self::GEOGRAPHY_WEIGHTS);
    }

    /** @return list<string> */
    public static function quotas(): array
    {
        return array_keys(self::QUOTA_WEIGHTS);
    }
}
