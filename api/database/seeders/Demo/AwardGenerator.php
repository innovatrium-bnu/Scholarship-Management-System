<?php

declare(strict_types=1);

namespace Database\Seeders\Demo;

use Illuminate\Support\Str;

/**
 * Who holds what, since when, and what ended.
 *
 * seed.ts granted awards to students by array index — `[2, 'sch-dean'], [3,
 * 'sch-sports']` — which works at 112 students and says nothing at 2,000. Here
 * each scholarship has a rule instead, and the rule is the one the scholarship
 * describes: the Dean's award goes to students above the CGPA its retention
 * rule names, the sports award goes to students with a medal, the need award
 * goes to students whose need has been verified. So the register and the awards
 * agree with each other, and a demonstrator who filters the student list by
 * "CGPA over 3.5" sees the same people the Dean's list shows.
 *
 * ## Two things this deliberately does not do
 *
 * It does not run the evaluator. `App\Domain\EvaluationService` decides
 * eligibility for real, and calling it here would make the demo data a
 * restatement of the code it is meant to exercise — a bug in the evaluator
 * would produce a demo database that agreed with the bug. These rules are
 * written independently and stated in plain PHP for that reason.
 *
 * It does not compute `applied`. That is what the merge is for, and the merge
 * runs on read, in both languages. Every component below stores its entitlement
 * and leaves `applied` at zero, which is what seed.ts did and what the API's
 * own writers do.
 *
 * ## Why the dates are spread
 *
 * Every award in seed.ts started on the same day. The dashboard counts awards
 * gained and lost per term, so one date means one bar and five empty ones. Here
 * a grant is dated to a term the student could actually have been given it in —
 * no earlier than their intake, no later than the term the demo sits in —
 * weighted towards recent terms, and revocations are dated after their grant.
 * That is the whole reason the reporting screen has a shape.
 */
final class AwardGenerator
{
    /** Awards go to people who are actually studying. */
    private const ELIGIBLE_STATUS = 'Enrolled';

    /** The role that signed off the demo's awards, in RoleMatrix's vocabulary. */
    private const AUTHORISED_BY = 'Admin';

    /**
     * Endings a registrar actually records, with the cause the schema stores.
     *
     * Ported from seed.ts, which listed eleven of them for the same purpose:
     * "how many students lost a scholarship last semester" needs something true
     * to count. The difference is that these revoke real awards, so an ending
     * removes money from a student who had it, rather than naming an award id
     * that was never granted.
     *
     * @var list<array{cause: string, reason: string}>
     */
    private const ENDINGS = [
        ['cause' => 'Revoked by hand', 'reason' => 'CGPA fell below the 3.50 required to keep the award.'],
        ['cause' => 'Revoked by hand', 'reason' => 'CGPA fell below the 3.70 required to keep the award.'],
        ['cause' => 'Revoked by hand', 'reason' => 'Student withdrew from the programme.'],
        ['cause' => 'Revoked by hand', 'reason' => 'Student transferred to another university.'],
        ['cause' => 'Revoked by hand', 'reason' => 'Student did not complete the required work-study hours.'],
        ['cause' => 'Revoked by hand', 'reason' => 'Attendance fell below the level required to keep the award.'],
        ['cause' => 'Revoked by hand', 'reason' => 'Student took the award from another donor and could not hold both.'],
        ['cause' => 'Revoked by hand', 'reason' => 'Duplicate award corrected; the student already held the same scholarship.'],
        ['cause' => 'Application reopened', 'reason' => 'Approval reopened after the declared income could not be verified.'],
    ];

    /** slug => id, from the catalogue. */
    private array $ids;

    /** @var list<array<string, mixed>> */
    private array $awards = [];

    /** @var list<array<string, mixed>> */
    private array $components = [];

    /** @var list<array<string, mixed>> */
    private array $revocations = [];

    /** @var list<array<string, mixed>> */
    private array $events = [];

    /** @var list<array<string, mixed>> */
    private array $audit = [];

    /** reg_no => list of slugs held, so a rule can ask what came before it. */
    private array $held = [];

    /** @param  array<string, string>  $ids  slug => scholarship id */
    public function __construct(array $ids)
    {
        $this->ids = $ids;
    }

    /**
     * Every row the award side of the demo needs, keyed by table.
     *
     * The rules run in precedence order, which is what lets a later rule ask
     * whether an earlier one already gave this student something. Merit skips
     * students already on the Dean's award, because 75% of a tuition bill the
     * Dean's award already covers in full is a row the merge would suppress
     * entirely — a correct outcome, but not one worth 130 rows of demonstrating.
     *
     * @param  list<array<string, mixed>>  $students
     * @return array<string, list<array<string, mixed>>>
     */
    public function build(array $students): array
    {
        $enrolled = array_values(array_filter(
            $students,
            fn (array $s) => $s['enrollment_status'] === self::ELIGIBLE_STATUS,
        ));

        $this->grantVc($enrolled);
        $this->grantDeans($enrolled);
        $this->grantNeed($enrolled);
        $this->grantMerit($enrolled);
        $this->grantTalent($enrolled);
        $this->grantInclusion($enrolled);
        $this->grantSports($enrolled);
        $this->grantInstitutional($enrolled);
        $this->grantExternal($enrolled);
        $this->grantAndRetireLegacyArts($students);

        $this->revokeSome();

        return [
            // `semester` is carried on an award row so revokeSome() can tell
            // which term it was granted in without parsing the date back. It is
            // not a column, and an insert carrying it is ORA-00904 on a
            // statement that has already built two thousand rows.
            'awards' => array_map(
                fn (array $award) => array_diff_key($award, ['semester' => null]),
                $this->awards,
            ),
            'award_components' => $this->components,
            'revocations' => $this->revocations,
            'domain_events' => $this->events,
            'audit_entries' => $this->audit,
        ];
    }

    /**
     * Need awards granted in the term the demo sits in, as reg_no => award id.
     *
     * The application generator needs these to link an approved application to
     * the award it produced. Only the current term's, because an application
     * for Fall 2025 cannot have produced an award that started paying in Fall
     * 2023 — and a decision row pointing at one would be a provenance trail
     * that reads backwards.
     *
     * Valid only after build().
     *
     * @return array<string, string>
     */
    public function currentTermNeedAwards(): array
    {
        $needId = $this->ids[ScholarshipCatalogue::NEED];
        $found = [];

        foreach ($this->awards as $award) {
            if ($award['scholarship_id'] === $needId
                && $award['status'] === 'Active'
                && ($award['semester'] ?? null) === Terms::CURRENT) {
                $found[$award['student_reg_no']] = $award['id'];
            }
        }

        return $found;
    }

    /* -- the rules --------------------------------------------------------- */

    /**
     * Top of each cohort, one per cohort, which is what quotaPerCohort says.
     *
     * A cohort is a school and an intake together — that is what the
     * cohort-rank rule ranks within, and it is why the school weights in the
     * student generator matter: being top of Computer & IT's 200 and top of
     * Education's 30 are different achievements, and this is the only
     * scholarship that shows it.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function grantVc(array $students): void
    {
        $recent = ['Fall 2024', 'Spring 2025', 'Fall 2025'];
        $best = [];

        foreach ($students as $student) {
            if ($student['study_level'] !== 'Bachelors' || ! in_array($student['batch'], $recent, true)) {
                continue;
            }

            $cohort = $student['school'].'|'.$student['batch'];

            if (! isset($best[$cohort]) || $student['cgpa'] > $best[$cohort]['cgpa']) {
                $best[$cohort] = $student;
            }
        }

        $index = 0;

        foreach ($best as $student) {
            /*
             * A quarter of them carry a standing order rather than a rule
             * outcome. isOverridden is the flag that says a person set this
             * amount, and every screen that shows an award has a branch for it
             * — with no overridden award anywhere in the demo, that branch is
             * only ever seen in a test.
             */
            $override = Draw::chance('vc-override', $index, 0.25)
                ? ['reason' => 'VC Order 2024/17', 'authority' => 'Vice Chancellor']
                : null;

            $this->grant(ScholarshipCatalogue::VC, $student, $index++, $override);
        }
    }

    /**
     * Above the CGPA the award's own retention rule names.
     *
     * 3.55 rather than the 3.50 in the rule, so that the students who hold it
     * are comfortably above the line rather than sitting on it. A demo where a
     * third of the Dean's list would fail its own retention check at the next
     * review is a demo that raises a question nobody wants to answer on the day.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function grantDeans(array $students): void
    {
        $index = 0;

        foreach ($students as $student) {
            if ($student['study_level'] !== 'Bachelors' || $student['cgpa'] < 3.55) {
                continue;
            }

            if ($this->holds($student, ScholarshipCatalogue::VC)) {
                continue;
            }

            $this->grant(ScholarshipCatalogue::DEAN, $student, $index++);
        }
    }

    /**
     * Verified financial need, most of it.
     *
     * Not all of it: the ones left out are what the review queue is full of.
     * An application from a student who already holds the award it is for is
     * the "duplicate" criterion, and a pool with none of them left would leave
     * that branch of the screening engine unexercised — so a few are granted
     * and also apply.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function grantNeed(array $students): void
    {
        $index = 0;

        foreach ($students as $student) {
            if ($student['financial_need_verified'] !== 1) {
                continue;
            }

            if (Draw::chance('need-award', $index++, 0.62)) {
                $this->grant(ScholarshipCatalogue::NEED, $student, $index);
            }
        }
    }

    /**
     * The scholarship most likely to overlap something else.
     *
     * Merit is 75% of tuition and Need is 50%, so a student holding both is at
     * 125% of a bill that can only be waived once. That is the ceiling conflict
     * the merge exists to resolve, and the reason this rule does not exclude
     * students already on the need award — it is the single most useful thing
     * in the demo database.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function grantMerit(array $students): void
    {
        $recent = ['Fall 2024', 'Spring 2025', 'Fall 2025'];
        $index = 0;

        foreach ($students as $student) {
            if ($student['study_level'] !== 'Bachelors' || ! in_array($student['batch'], $recent, true)) {
                continue;
            }

            if ($student['cgpa'] < 3.30) {
                continue;
            }

            if ($this->holds($student, ScholarshipCatalogue::VC, ScholarshipCatalogue::DEAN)) {
                continue;
            }

            $this->grant(ScholarshipCatalogue::MERIT, $student, $index++);
        }
    }

    /**
     * The two Talent awards, which are the same award under two sets of terms.
     *
     * The Fall 2023 intake keeps the original 40%; every intake after it gets
     * 30% from a second scholarship. Both are granted here so that the two rates
     * appear side by side on the reports screen, which is the entire point of
     * scoping by batch instead of versioning a scholarship.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function grantTalent(array $students): void
    {
        $onwards = ['Fall 2024', 'Spring 2025', 'Fall 2025'];
        $index = 0;

        foreach ($students as $student) {
            if ($student['study_level'] !== 'Bachelors') {
                continue;
            }

            $index++;

            if ($student['batch'] === 'Fall 2023' && Draw::chance('talent-23', $index, 0.18)) {
                $this->grant(ScholarshipCatalogue::TALENT_F23, $student, $index);
            } elseif (in_array($student['batch'], $onwards, true) && Draw::chance('talent-24', $index, 0.06)) {
                $this->grant(ScholarshipCatalogue::TALENT_F24, $student, $index);
            }
        }
    }

    /**
     * Every student recorded as Other, which is nine of two thousand.
     *
     * Small, and the only reason the conditional hostel line is reachable: the
     * ones domiciled outside Lahore get the fixed 20,000 and the ones in Lahore
     * do not, from the same scholarship, which is what `conditionalOn` means.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function grantInclusion(array $students): void
    {
        $index = 0;

        foreach ($students as $student) {
            if ($student['gender'] === 'Other') {
                $this->grant(ScholarshipCatalogue::TRANS, $student, $index++);
            }
        }
    }

    /** @param  list<array<string, mixed>>  $students */
    private function grantSports(array $students): void
    {
        $index = 0;

        foreach ($students as $student) {
            if ($student['has_sports_medal'] === 1 && $student['study_level'] === 'Bachelors') {
                $this->grant(ScholarshipCatalogue::SPORTS, $student, $index++);
            }
        }
    }

    /**
     * MOU partner schools, which the register does not record.
     *
     * There is no column for "came from a partner school", so this is the one
     * rule with no basis in the student data — a flat 2.5%, stated as such
     * rather than dressed up as a criterion. If BNU's CMS turns out to carry the
     * feeder school, this becomes a real rule; until then it exists so the
     * scholarship has holders.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function grantInstitutional(array $students): void
    {
        $index = 0;

        foreach ($students as $student) {
            if (Draw::chance('institutional', $index++, 0.025)) {
                $this->grant(ScholarshipCatalogue::INSTITUTIONAL, $student, $index);
            }
        }
    }

    /**
     * The donor award, given only to students who already hold the internal one.
     *
     * That combination is deliberate and is the only demonstration of
     * `mayExceedCeiling`. This scholarship is last in precedence, so it claims
     * tuition after everything else has; being permitted to exceed 100% means it
     * can still pay where a fourth internal award would have been suppressed.
     * Granting it to students with no other award would show none of that.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function grantExternal(array $students): void
    {
        $index = 0;

        foreach ($students as $student) {
            if (! $this->holds($student, ScholarshipCatalogue::NEED)) {
                continue;
            }

            if (Draw::chance('external', $index++, 0.14)) {
                $this->grant(ScholarshipCatalogue::EXTERNAL, $student, $index);
            }
        }
    }

    /**
     * The archived scholarship, and the awards it took with it.
     *
     * Archiving a scholarship ends its live awards with cause "Scholarship
     * archived" — one of the four causes in the schema, and the only one no
     * other rule here produces. So these are granted to students from the three
     * intakes it covered and then ended together, in Spring 2024, which is what
     * the archive actually did.
     *
     * Drawn from all students rather than only enrolled ones, because most of
     * that cohort has since graduated and an award that ended two years ago
     * does not care what the holder is doing now.
     *
     * @param  list<array<string, mixed>>  $students
     */
    private function grantAndRetireLegacyArts(array $students): void
    {
        $covered = ['Fall 2021', 'Spring 2022', 'Fall 2022'];
        $arts = [
            'Mariam Dawood School of Visual Arts & Design',
            'Razia Hassan School of Architecture',
        ];

        $index = 0;
        $granted = [];

        foreach ($students as $student) {
            if (! in_array($student['batch'], $covered, true) || ! in_array($student['school'], $arts, true)) {
                continue;
            }

            if (! Draw::chance('legacy', $index++, 0.45)) {
                continue;
            }

            $award = $this->grant(ScholarshipCatalogue::LEGACY_ARTS, $student, $index, null, 'Fall 2023');

            if ($award !== null) {
                $granted[] = $award;
            }
        }

        foreach ($granted as $award) {
            $this->revoke(
                $award,
                'Spring 2024',
                'next',
                'Scholarship archived',
                'Legacy Arts Bursary was discontinued after the 2023 funding round.',
            );
        }
    }

    /**
     * A scattering of endings across the terms on record.
     *
     * Drawn from the awards granted earliest, so a revocation always has a term
     * after its grant to fall in, and never from an award already ended by the
     * archive. Roughly one in twelve, which is about what a registrar sees.
     */
    private function revokeSome(): void
    {
        $index = 0;

        foreach ($this->awards as $award) {
            if ($award['status'] !== 'Active') {
                continue;
            }

            $granted = (int) array_search($award['semester'], Terms::ALL, true);

            // Nothing can end in the term the demo is sitting in and still show
            // a term of having been held, so awards granted in the last term
            // are left alone.
            if ($granted >= Terms::currentIndex()) {
                continue;
            }

            if (! Draw::chance('revoke', $index++, 0.085)) {
                continue;
            }

            $ending = self::ENDINGS[$index % count(self::ENDINGS)];
            $when = Terms::at($granted + 1 + (int) (Draw::uniform('revoke-when', $index) * (Terms::currentIndex() - $granted)));

            $this->revoke($award, $when, 'immediate', $ending['cause'], $ending['reason']);
        }
    }

    /* -- writing one award -------------------------------------------------- */

    /**
     * Grant $slug to $student, with the coverage its scholarship defines.
     *
     * Returns the award row so a caller that intends to end it — the archive
     * rule — can, and null when the student already holds this scholarship.
     * That guard is not theoretical: the rules overlap by design, and awarding
     * the same scholarship twice would be a duplicate the merge would double.
     *
     * @param  array<string, mixed>  $student
     * @param  array{reason: string, authority: string}|null  $override
     * @return array<string, mixed>|null
     */
    private function grant(
        string $slug,
        array $student,
        int $index,
        ?array $override = null,
        ?string $forceSemester = null,
    ): ?array {
        $regNo = $student['reg_no'];

        if (in_array($slug, $this->held[$regNo] ?? [], true)) {
            return null;
        }

        $this->held[$regNo][] = $slug;

        $semester = $forceSemester ?? $this->grantTerm($student, $slug.$index);
        $effectiveFrom = Terms::dateOf($semester);
        $id = (string) Str::ulid();

        $award = [
            'id' => $id,
            'student_reg_no' => $regNo,
            'scholarship_id' => $this->ids[$slug],
            'status' => 'Active',
            'effective_from' => Row::date($effectiveFrom),
            'authorised_by' => self::AUTHORISED_BY,
            'reason_code' => 'Initial award',
            'batch_id' => null,
            'edited_by_hand' => Row::bool($override !== null),
            'edit_reason' => $override['reason'] ?? null,
            'created_at' => Row::stamp($effectiveFrom, '09:00:00'),
            'updated_at' => Row::stamp($effectiveFrom, '09:00:00'),

            // Not a column. Carried so revokeSome() can tell which term this
            // was granted in without parsing the date back, and stripped before
            // the row is written.
            'semester' => $semester,
        ];

        $this->awards[] = $award;

        foreach (ScholarshipCatalogue::coverageOf($slug) as $line) {
            if (! $this->coverageApplies($line, $student)) {
                continue;
            }

            $isTuition = $line['feeHead'] === 'Tuition';

            $this->components[] = [
                'id' => (string) Str::ulid(),
                'award_id' => $id,
                'fee_head' => $line['feeHead'],
                'entitlement_kind' => $line['benefitKind'],
                'entitlement_value' => $line['value'],
                'entitlement' => $line['value'],

                // Zero, because the merge computes it on read — in PHP for the
                // API and again in the browser to draw the coverage bars. A
                // number stored here would be a third answer nobody recomputed.
                'applied' => 0,

                'is_overridden' => Row::bool($override !== null && $isTuition),
                'override_reason' => $isTuition ? ($override['reason'] ?? null) : null,
                'override_authority' => $isTuition ? ($override['authority'] ?? null) : null,
            ];
        }

        $this->events[] = $this->event('award.granted', $effectiveFrom, '09:00:00', [
            'semester' => $semester,
            'student_reg_no' => $regNo,
            'scholarship_id' => $this->ids[$slug],
            'award_id' => $id,
            'payload' => ['actor' => self::AUTHORISED_BY, 'effectiveFrom' => $effectiveFrom],
        ]);

        $this->audit[] = [
            'id' => (string) Str::ulid(),
            'entity_type' => 'Award',
            'entity_id' => $id,
            'action' => 'Granted, effective '.$effectiveFrom,
            'old_value' => null,
            'new_value' => null,
            'reason' => $override['reason'] ?? 'Initial award',
            'actor' => self::AUTHORISED_BY,
            'occurred_at' => Row::timestamp($effectiveFrom, '09:00:00'),
        ];

        return $award;
    }

    /**
     * End an award, and say when the money stops and why.
     *
     * Writes four things because ending an award is four facts: the award's
     * status, a revocation row holding the detail, an event so it can be
     * counted, and an audit line so it can be read. The audit sentence is the
     * one AwardWriter writes, word for word — AuditPanel renders that string
     * directly, and a demo trail in a different dialect from the live one is a
     * trail that teaches the wrong thing.
     *
     * @param  array<string, mixed>  $award
     */
    private function revoke(
        array $award,
        string $semester,
        string $timing,
        string $cause,
        string $reason,
    ): void {
        $effectiveFrom = Terms::dateOf($semester);

        foreach ($this->awards as $i => $existing) {
            if ($existing['id'] === $award['id']) {
                $this->awards[$i]['status'] = 'Revoked';
                $this->awards[$i]['updated_at'] = Row::stamp($effectiveFrom, '11:30:00');
                break;
            }
        }

        $this->revocations[] = [
            'id' => (string) Str::ulid(),
            'award_id' => $award['id'],
            'at' => Row::timestamp($effectiveFrom, '11:30:00'),
            'effective_from' => Row::date($effectiveFrom),
            'semester' => $semester,
            'timing' => $timing,
            'cause' => $cause,
            'reason' => $reason,
            'revoked_by' => self::AUTHORISED_BY,
        ];

        $this->events[] = $this->event('award.revoked', $effectiveFrom, '11:30:00', [
            'semester' => $semester,
            'student_reg_no' => $award['student_reg_no'],
            'scholarship_id' => $award['scholarship_id'],
            'award_id' => $award['id'],
            'payload' => [
                'actor' => self::AUTHORISED_BY,
                'effectiveFrom' => $effectiveFrom,
                'timing' => $timing,
                'cause' => $cause,
                'reason' => $reason,
            ],
        ]);

        $this->audit[] = [
            'id' => (string) Str::ulid(),
            'entity_type' => 'Award',
            'entity_id' => $award['id'],
            'action' => sprintf('Revoked award, effective %s (%s)', $effectiveFrom, $timing),
            'old_value' => null,
            'new_value' => null,
            'reason' => $reason,
            'actor' => self::AUTHORISED_BY,
            'occurred_at' => Row::timestamp($effectiveFrom, '11:30:00'),
        ];
    }

    /* -- small decisions ---------------------------------------------------- */

    /**
     * Which term an award starts in.
     *
     * No earlier than the student's own intake and no later than the term the
     * demo sits in. Weighted towards the recent end, because a register shows
     * more live awards from this year than from three years ago — and because
     * the terms in between need to be populated but not equally.
     *
     * @param  array<string, mixed>  $student
     */
    private function grantTerm(array $student, string $salt): string
    {
        $earliest = Terms::earliestFor($student['batch']);
        $latest = Terms::currentIndex();

        if ($earliest >= $latest) {
            return Terms::at($latest);
        }

        $span = $latest - $earliest;
        $skew = Draw::uniform($salt, $span);

        // Squaring pulls the draw towards 1, so most awards land in the last
        // term or two without the earlier ones being empty.
        return Terms::at($earliest + (int) round($span * $skew * $skew));
    }

    /**
     * Whether a coverage line means anything for this student.
     *
     * Two cases. A conditional line applies only when its condition holds — the
     * inclusion award's hostel support is written "Student is not domiciled in
     * Lahore" and is read here rather than stored as a component that pays
     * nothing. And a fee the student does not owe is not covered: a hostel
     * waiver for someone living at home is a row on a screen with a rupee value
     * of zero, which reads as a bug.
     *
     * @param  array<string, mixed>  $line
     * @param  array<string, mixed>  $student
     */
    private function coverageApplies(array $line, array $student): bool
    {
        if (($line['conditionalOn'] ?? null) === 'Student is not domiciled in Lahore'
            && $student['domicile'] === 'Lahore') {
            return false;
        }

        return match ($line['feeHead']) {
            'Hostel' => $student['hostel_fee'] > 0,
            'Mess' => $student['mess_fee'] > 0,
            default => true,
        };
    }

    /** @param  array<string, mixed>  $student */
    private function holds(array $student, string ...$slugs): bool
    {
        $held = $this->held[$student['reg_no']] ?? [];

        foreach ($slugs as $slug) {
            if (in_array($slug, $held, true)) {
                return true;
            }
        }

        return false;
    }

    /**
     * A domain_events row.
     *
     * The column-or-payload split follows DomainEventMapper exactly: a field is
     * a column when something groups by it, and in the payload when it is only
     * ever read back with the row.
     *
     * @param  array<string, mixed>  $parts
     * @return array<string, mixed>
     */
    private function event(string $kind, string $date, string $time, array $parts): array
    {
        return array_merge([
            'id' => (string) Str::ulid(),
            'kind' => $kind,
            'at' => Row::timestamp($date, $time),
            'semester' => null,
            'student_reg_no' => null,
            'scholarship_id' => null,
            'award_id' => null,
            'application_id' => null,
            'batch_id' => null,
            'payload' => null,
        ], array_map(
            fn ($value) => is_array($value) ? Row::json($value) : $value,
            $parts,
        ));
    }
}
