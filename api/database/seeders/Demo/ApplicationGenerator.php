<?php

declare(strict_types=1);

namespace Database\Seeders\Demo;

use Illuminate\Support\Str;

/**
 * The review queue: need-based applications for the term the demo sits in.
 *
 * A port of seedApplications() in src/lib/scholarship/seed.ts, and it keeps that
 * function's actual purpose, which was not volume. The queue has to hold every
 * case the committee meets — clean ones, ones that fail a hard rule, ones that
 * only warrant a second look, and ones already settled — because the screening
 * engine has a branch for each and a queue of uniformly good applications shows
 * none of them.
 *
 * What is different is where the settled ones come from. seed.ts approved every
 * thirteenth application and left `awardId` unset, so an approval on screen led
 * nowhere. Here the approved pile is drawn from students who actually hold a
 * need award granted this term, and the decision points at it. The provenance
 * trail — application to decision to award — is a real chain in the demo data
 * rather than a shape the schema allows.
 *
 * ## What the filter is meant to catch
 *
 * The criteria are: CGPA 2.50 for Fall 2023 and 2.65 from Fall 2024, household
 * income at or under 150,000, at least 12 credit hours, at least 75% attendance,
 * four documents, and no more than 50% existing coverage. Of those, attendance
 * and existing coverage only raise a flag; the rest reject automatically.
 *
 * So this generator deliberately produces applications that fail each one: about
 * a fifth declare an income over the ceiling, about a seventh submit an
 * incomplete file, the CGPA spread in the register supplies the academic
 * failures on its own, and a handful of students apply for an award they already
 * hold, which is the duplicate case.
 */
final class ApplicationGenerator
{
    /** The term being applied for. */
    private const SEMESTER = Terms::CURRENT;

    /** Applications were taken in July, before the September term. */
    private const INTAKE_MONTH = '2025-07';

    /**
     * The documents the criteria ask for, in the order a file is assembled.
     *
     * Same four strings as the required_documents column, because
     * ApplicationDocument.kind is matched against that list by name. A
     * near-miss here — "CNIC copy" for "CNIC" — produces an application that
     * looks complete and screens as incomplete.
     */
    private const DOCUMENTS = [
        'CNIC',
        'Income certificate',
        'Utility bill',
        "Father's salary slip / affidavit",
    ];

    /**
     * Who signed the settled decisions.
     *
     * Three names, built from the same pools every other name in the demo comes
     * from, so no real reviewer is in the repository either. The role beside
     * them is a role in RoleMatrix, because that column is typed as one on the
     * frontend and a value outside the set renders as an unknown role rather
     * than failing.
     *
     * @var list<string>
     */
    private const REVIEWERS = [
        'Dr. Sana Qureshi',
        'Dr. Imran Bajwa',
        'Nida Farooq',
    ];

    private const REVIEWER_ROLE = 'Admin';

    /**
     * What a student writes when asked why they need the money.
     *
     * Composed rather than copied. Each statement is assembled from a
     * circumstance, a consequence and an ask, so the queue reads like 450
     * different people without any of them being one.
     *
     * @var list<string>
     */
    private const CIRCUMSTANCES = [
        'My father was the only earning member of our household until his retirement last year.',
        'We moved to Lahore for my admission and are renting a single room near the campus.',
        'My mother has supported four of us on her teaching salary since my father passed away.',
        "My father's shop was damaged in the floods and the family has been repaying a loan since.",
        'I am the first person in my family to attend university.',
        'My elder brother stopped his own degree so that the family could afford mine.',
        'My father works on contract and there have been months this year with no work at all.',
        'Two of my siblings are also in education and the fees fall in the same month.',
    ];

    /** @var list<string> */
    private const CONSEQUENCES = [
        'The tuition instalment is now beyond what the family can raise each semester.',
        'After rent and my younger brothers\' school fees there is very little left.',
        'I have been paying the fee in late instalments with a surcharge each time.',
        'I have kept my grades up while tutoring in the evenings, but the tuition is the one thing I cannot cover.',
        'The hours I can work alongside a full credit load are not enough to meet it.',
        'We have been managing by borrowing within the family, which is not something that can continue.',
    ];

    /** @var list<string> */
    private const ASKS = [
        'A partial waiver would let me finish the degree without the family selling land.',
        'I would like to complete the programme without interrupting a semester.',
        'A waiver would let me reduce my working hours and give the studio work the time it needs.',
        'Any support towards the tuition would make the difference between continuing and deferring.',
    ];

    /** @var list<string> */
    private const OCCUPATIONS = [
        'Shopkeeper', 'Government clerk', 'Schoolteacher', 'Driver', 'Farmer',
        'Tailor', 'Bank officer', 'Electrician', 'Nurse', 'Small trader',
        'Carpenter', 'Security guard', 'Clerk', 'Mechanic', 'Retired civil servant',
    ];

    private string $scholarshipId;

    /** @var array<string, string> reg_no => award id, for approvals */
    private array $needAwards;

    /** @var list<array<string, mixed>> */
    private array $applications = [];

    /** @var list<array<string, mixed>> */
    private array $documents = [];

    /** @var list<array<string, mixed>> */
    private array $decisions = [];

    /** @var list<array<string, mixed>> */
    private array $events = [];

    /** @var list<array<string, mixed>> */
    private array $audit = [];

    /** @param  array<string, string>  $needAwards  reg_no => award id */
    public function __construct(string $scholarshipId, array $needAwards)
    {
        $this->scholarshipId = $scholarshipId;
        $this->needAwards = $needAwards;
    }

    /**
     * @param  list<array<string, mixed>>  $students
     * @return array<string, list<array<string, mixed>>>
     */
    public function build(array $students): array
    {
        $enrolled = array_values(array_filter(
            $students,
            fn (array $s) => $s['enrollment_status'] === 'Enrolled',
        ));

        $this->settled($enrolled);
        $this->queue($enrolled);
        $this->duplicates($enrolled);

        return [
            'need_applications' => $this->applications,
            'application_documents' => $this->documents,
            'application_decisions' => $this->decisions,
            'domain_events' => $this->events,
            'audit_entries' => $this->audit,
        ];
    }

    /* -- the three piles ---------------------------------------------------- */

    /**
     * The approvals, each one pointing at the award it produced.
     *
     * Every student holding a need award granted this term applied for it, which
     * is what `requiresReapplication` on that scholarship means. So the approved
     * pile is that list, and nothing else — an approval with no award behind it
     * would be the demo teaching that approving does not pay anybody.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function settled(array $students): void
    {
        $index = 0;

        foreach ($students as $student) {
            $awardId = $this->needAwards[$student['reg_no']] ?? null;

            if ($awardId === null) {
                continue;
            }

            $application = $this->application($student, $index, complete: true, overIncome: false);
            $this->applications[] = $application;

            $this->decide(
                $application,
                $student,
                'Approved',
                'Verified need and satisfactory academic standing. Granted at the standard 50%.',
                $index,
                awardedPct: 50,
                awardId: $awardId,
            );

            $index++;
        }
    }

    /**
     * The live queue, and the decisions already taken on part of it.
     *
     * Students with no need award: most are waiting, some were turned down, a
     * few are on hold pending a document. The proportions are what a queue looks
     * like a month into a term — the great majority still to be looked at.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function queue(array $students): void
    {
        $index = 1000;   // offset from settled(), so the draws do not repeat
        $wanted = 340;
        $taken = 0;

        foreach ($students as $student) {
            if ($taken >= $wanted) {
                return;
            }

            if (isset($this->needAwards[$student['reg_no']])) {
                continue;
            }

            // Applications come from students who have a reason to make one.
            // Skewed towards verified need, but not restricted to it: a student
            // whose need has not been verified yet is exactly who the queue is
            // for.
            $likely = $student['financial_need_verified'] === 1 ? 0.55 : 0.16;

            if (! Draw::chance('applies', $index++, $likely)) {
                continue;
            }

            $overIncome = Draw::chance('over-income', $index, 0.20);
            $complete = ! Draw::chance('incomplete', $index, 0.14);

            $application = $this->application($student, $index, $complete, $overIncome);

            $outcome = Draw::weighted('queue-outcome', $index, [
                'Submitted' => 74,
                'Rejected' => 14,
                'On hold' => 12,
            ]);

            if ($outcome !== 'Submitted') {
                $application['status'] = $outcome;
            }

            $this->applications[] = $application;

            if ($outcome === 'Rejected') {
                $this->decide(
                    $application,
                    $student,
                    'Rejected',
                    $overIncome
                        ? 'Declared household income is above the ceiling for this award.'
                        : 'Declared income could not be reconciled with the supporting documents.',
                    $index,
                );
            } elseif ($outcome === 'On hold') {
                $this->decide(
                    $application,
                    $student,
                    'On hold',
                    'Waiting on an attested income certificate from the student.',
                    $index,
                );
            }

            $taken++;
        }
    }

    /**
     * A few students applying for an award they already hold.
     *
     * The `duplicate` criterion is in autoRejectOn, so this is the one failure
     * the filter catches without looking at a number. It needs a duplicate to
     * catch, and nothing else in this generator produces one — the queue
     * deliberately skips award holders.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function duplicates(array $students): void
    {
        $index = 5000;
        $wanted = 8;
        $taken = 0;

        foreach ($students as $student) {
            if ($taken >= $wanted) {
                return;
            }

            if (! isset($this->needAwards[$student['reg_no']])) {
                continue;
            }

            if (! Draw::chance('duplicate', $index++, 0.05)) {
                continue;
            }

            $this->applications[] = $this->application(
                $student,
                $index,
                complete: true,
                overIncome: false,
            );

            $taken++;
        }
    }

    /* -- building one application -------------------------------------------- */

    /**
     * One need_applications row, with its documents.
     *
     * @param  array<string, mixed>  $student
     * @return array<string, mixed>
     */
    private function application(array $student, int $index, bool $complete, bool $overIncome): array
    {
        $id = (string) Str::ulid();

        $day = 1 + (int) (Draw::uniform('day', $index) * 28);
        $hour = 9 + (int) (Draw::uniform('hour', $index) * 8);
        $minute = (int) (Draw::uniform('minute', $index) * 60);

        $date = sprintf('%s-%02d', self::INTAKE_MONTH, $day);
        $time = sprintf('%02d:%02d:00', $hour, $minute);

        /*
         * Income sits either side of the 150,000 ceiling on purpose. Below it,
         * the range is wide and low, which is what a need-based intake looks
         * like. Above it, only a little above — an application declaring two
         * million would be rejected by anyone reading it and teaches nothing
         * about where the line is.
         */
        $income = $overIncome
            ? 155_000 + (int) (Draw::uniform('income-over', $index) * 220_000)
            : 18_000 + (int) (Draw::uniform('income-under', $index) * 125_000);

        $owns = Draw::weighted('residence', $index, [
            'Rented' => 52, 'Family owned' => 30, 'Owned' => 18,
        ]);

        $this->attach($id, $student['reg_no'], $index, $date, $complete);

        return [
            'id' => $id,
            'student_reg_no' => $student['reg_no'],
            'scholarship_id' => $this->scholarshipId,
            'semester' => self::SEMESTER,
            'submitted_at' => Row::timestamp($date, $time),

            'household_monthly_income' => $income,
            'household_earning_members' => 1 + (int) (Draw::uniform('earners', $index) * 3),
            'household_dependants' => 2 + (int) (Draw::uniform('dependants', $index) * 6),
            'household_siblings_at_bnu' => Draw::chance('sibling', $index, 0.12) ? 1 : 0,
            'household_guardian_occupation' => Draw::from('occupation', $index, self::OCCUPATIONS),
            'household_guardian_status' => Draw::weighted('guardian', $index, [
                'Employed' => 46, 'Self-employed' => 30, 'Retired' => 12,
                'Deceased' => 7, 'Unemployed' => 5,
            ]),
            'household_residence' => $owns,
            'household_monthly_rent' => $owns === 'Rented'
                ? 15_000 + (int) (Draw::uniform('rent', $index) * 45_000)
                : 0,
            'household_owns_vehicle' => Row::bool(Draw::chance('vehicle', $index, 0.18)),

            'statement' => $this->statement($index),

            // What the student asked for, not what they will get. Most ask for
            // the standard rate; a few ask for everything.
            'requested_pct' => (int) Draw::weighted('requested', $index, [
                '50' => 44, '75' => 24, '25' => 18, '100' => 14,
            ]),

            'status' => 'Submitted',

            'created_at' => Row::stamp($date, $time),
            'updated_at' => Row::stamp($date, $time),
        ];
    }

    /**
     * The file attached to an application.
     *
     * An incomplete one carries between one and three of the four, which is what
     * makes the `documents` criterion reject it. Verification is separate from
     * presence: a document can be attached and not yet checked, and the review
     * screen shows the two differently.
     */
    private function attach(
        string $applicationId,
        string $regNo,
        int $index,
        string $date,
        bool $complete,
    ): void {
        $count = $complete
            ? count(self::DOCUMENTS)
            : 1 + (int) (Draw::uniform('doc-count', $index) * 3);

        foreach (array_slice(self::DOCUMENTS, 0, $count) as $position => $kind) {
            $slug = trim((string) preg_replace('/[^a-z]+/', '-', mb_strtolower($kind)), '-');

            $this->documents[] = [
                'id' => (string) Str::ulid(),
                'application_id' => $applicationId,
                'kind' => $kind,
                // Prefixed with the registration number, as seed.ts named
                // them. A queue where every second file is cnic.pdf is a queue
                // nobody can talk about across a desk.
                'file_name' => $regNo.'-'.$slug.'.pdf',
                'uploaded_at' => Row::timestamp($date, '12:00:00'),
                'verified' => Row::bool(! Draw::chance('unverified', $index * 10 + $position, 0.22)),
            ];
        }
    }

    /**
     * A statement, assembled from three parts.
     *
     * @see self::CIRCUMSTANCES for why it is built rather than picked
     */
    private function statement(int $index): string
    {
        return Draw::from('circumstance', $index, self::CIRCUMSTANCES).' '
            .Draw::from('consequence', $index, self::CONSEQUENCES).' '
            .Draw::from('ask', $index, self::ASKS);
    }

    /**
     * Record a decision, and everything that has to be written with it.
     *
     * Four rows again, for the reasons AwardWriter and ApplicationWriter give:
     * the application's status, the decision itself, an event so outcomes can be
     * counted by term, and an audit line in the same wording ApplicationWriter
     * uses so the demo trail and the live one read alike.
     *
     * @param  array<string, mixed>  $application
     * @param  array<string, mixed>  $student
     */
    private function decide(
        array $application,
        array $student,
        string $outcome,
        string $reason,
        int $index,
        ?int $awardedPct = null,
        ?string $awardId = null,
    ): void {
        $decidedOn = '2025-07-30';
        $time = sprintf('%02d:%02d:00', 10 + (int) (Draw::uniform('decide-hour', $index) * 7), (int) (Draw::uniform('decide-minute', $index) * 60));

        $last = array_key_last($this->applications);

        if ($last !== null && $this->applications[$last]['id'] === $application['id']) {
            $this->applications[$last]['status'] = $outcome;
            $this->applications[$last]['updated_at'] = Row::stamp($decidedOn, $time);
        }

        $this->decisions[] = [
            'id' => (string) Str::ulid(),
            'application_id' => $application['id'],
            'outcome' => $outcome,
            'decided_by' => Draw::from('reviewer', $index, self::REVIEWERS),
            'role' => self::REVIEWER_ROLE,
            'at' => Row::timestamp($decidedOn, $time),
            'reason' => $reason,

            // Every decision here was taken by a person. The filter's automatic
            // rejections are not seeded: they are what the queue produces when
            // somebody presses the button, and pre-recording them would show
            // the outcome of a screening run nobody performed.
            'automatic' => Row::bool(false),

            'awarded_pct' => $awardedPct,
            'award_id' => $awardId,
        ];

        $this->events[] = [
            'id' => (string) Str::ulid(),
            'kind' => 'application.decided',
            'at' => Row::timestamp($decidedOn, $time),
            'semester' => self::SEMESTER,
            'student_reg_no' => $student['reg_no'],
            'scholarship_id' => $this->scholarshipId,
            'award_id' => $awardId,
            'application_id' => $application['id'],
            'batch_id' => null,
            'payload' => Row::json([
                'actor' => self::REVIEWER_ROLE,
                'reason' => $reason,
                'outcome' => $outcome,
                'automatic' => false,
            ]),
        ];

        $this->audit[] = [
            'id' => (string) Str::ulid(),
            'entity_type' => 'Application',
            'entity_id' => $application['id'],
            'action' => 'Application '.mb_strtolower($outcome),
            'old_value' => null,
            'new_value' => null,
            'reason' => $reason,
            'actor' => self::REVIEWER_ROLE,
            'occurred_at' => Row::timestamp($decidedOn, $time),
        ];
    }
}
