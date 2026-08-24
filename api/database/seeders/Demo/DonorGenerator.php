<?php

declare(strict_types=1);

namespace Database\Seeders\Demo;

use Carbon\CarbonImmutable;
use Illuminate\Support\Str;

/**
 * Donors, what they promised, what arrived, and what it paid for.
 *
 * Built by the same arithmetic as every other generator: nothing calls rand(),
 * every varying value is a pure function of a row index and a salt, and the
 * organisation names are assembled from parts so that no real foundation is in
 * this repository. A donor name is a real organisation's name in a way a
 * student's name is not — inventing one carelessly is how a demo database ends
 * up naming a body that could object.
 *
 * ## What the proportions are for
 *
 * A demo of this module is judged on whether its three screens have anything to
 * show, so the shape is chosen rather than left to chance:
 *
 *   - roughly 40% of received money is left unassigned, or FR-03's screen opens
 *     on an empty state and demonstrates nothing;
 *   - some instalments are past due and unpaid, so overdue receivables exist;
 *   - some are future-dated, so receivables that are merely pending exist too;
 *   - at least two pledges sit inside their renewal window and one has lapsed,
 *     so the renewal report is non-empty and shows both states;
 *   - at least one receipt is fully assigned and one wholly unassigned, so both
 *     extremes render;
 *   - one donor holds two pledges, which is the case the detail page's layout
 *     has to handle.
 *
 * DemoDataTest asserts these rather than trusting them.
 *
 * ## Why this generator creates Aslam Foundation
 *
 * The link migration backfills a donor per distinct `donor_name` already in the
 * scholarships table — which is right for a real database and does nothing on a
 * fresh one, because migrations run before seeders and there is no scholarship
 * yet to read a name from. So the demo owns its own: this generator creates the
 * donor the catalogue's donor-funded scholarship names, and links it.
 */
final class DonorGenerator
{
    /**
     * The demo's present — the day it is seeded, not a date written here.
     *
     * It was the literal '2026-08-23' while `overdue` and `renewalsDue` are
     * computed from the server's real `now()`. The rows stood still and the
     * clock did not, so the demo drifted: three instalments totalling
     * PKR 2,175,000 were eight days from falling overdue, which would have
     * taken the headline from 2,475,000 to 4,650,000 without anybody touching
     * anything, and every figure quoted in the documentation would have rotted
     * with it.
     *
     * The schedule below is expressed in months either side of this instead of
     * in absolute dates, so the story a client is shown is the same story in
     * March as in August. Counts and amounts are unchanged and still
     * deterministic; only the literal dates move, together, with today.
     */
    private function today(): string
    {
        return CarbonImmutable::now()->toDateString();
    }

    /**
     * The first of the month, `$months` from the month being seeded in.
     *
     * The first, because every date in the plan was the first and the pledge
     * schedule reads better for it — and because anchoring to the day of the
     * month would make a seed on the 31st behave differently from one on the
     * 3rd.
     */
    private function monthsFromNow(int $months): string
    {
        return CarbonImmutable::now()->startOfMonth()->addMonths($months)->toDateString();
    }

    /**
     * Invented organisations, assembled from a place and a purpose.
     *
     * Deliberately not real. Two words that read as a funder and belong to
     * nobody.
     */
    private const STEMS = [
        'Ravi Delta', 'Chenab Valley', 'Karakoram', 'Sahiwal', 'Bahawalpur',
        'Indus Reach', 'Margalla', 'Thal Desert', 'Kohsar', 'Sialkot Works',
        'Neelum', 'Cholistan', 'Gomal',
    ];

    private const SUFFIXES = [
        'Trust', 'Foundation', 'Endowment', 'Welfare Fund', 'Charitable Trust',
    ];

    private const PEOPLE = [
        'Rukhsana Tarar', 'Iftikhar Gondal', 'Nasreen Cheema', 'Waqar Bajwa',
        'Shazia Durrani', 'Tanveer Sial', 'Naheed Warraich', 'Aftab Rana',
    ];

    /**
     * Relative weights for how much a pledge is worth.
     *
     * Skewed low, because most donors are not large ones — and a demo where
     * every pledge is a crore makes the unassigned figure meaningless.
     */
    private const AMOUNTS = [
        '500000' => 4,
        '1200000' => 5,
        '2500000' => 4,
        '4000000' => 3,
        '10000000' => 1,
    ];

    /** slug => scholarship id, from the catalogue. */
    private array $scholarshipIds;

    /** @var list<array<string, mixed>> the award rows the demo already built */
    private array $awards;

    private array $donors = [];

    private array $pledges = [];

    private array $instalments = [];

    private array $donations = [];

    private array $allocations = [];

    private array $events = [];

    private array $audit = [];

    /** scholarships that gain a donor_id, as id => donor id. */
    private array $scholarshipLinks = [];

    /**
     * @param  array<string, string>  $scholarshipIds  slug => id
     * @param  list<array<string, mixed>>  $awards
     */
    public function __construct(array $scholarshipIds, array $awards)
    {
        $this->scholarshipIds = $scholarshipIds;
        $this->awards = $awards;
    }

    /**
     * @return array<string, list<array<string, mixed>>>
     */
    public function build(): array
    {
        $this->createDonors();
        $this->createPledges();
        $this->receiveMoney();
        $this->allocateMoney();

        return [
            'donors' => $this->donors,
            'pledges' => $this->pledges,
            'pledge_instalments' => $this->instalments,
            'donations' => $this->donations,
            'fund_allocations' => $this->allocations,
            'domain_events' => $this->events,
            'audit_entries' => $this->audit,
        ];
    }

    /**
     * Scholarship id => donor id, for the seeder to apply.
     *
     * Returned rather than written, because `scholarships` rows are built by a
     * different generator and this one must not reach into them.
     *
     * @return array<string, string>
     */
    public function scholarshipLinks(): array
    {
        return $this->scholarshipLinks;
    }

    /* -- the donors ---------------------------------------------------------- */

    private function createDonors(): void
    {
        /*
         * The first is the one the catalogue already names. It has to exist
         * under exactly that name or the scholarship's donor_name and its
         * donor_id would disagree, which is the deficiency this module exists
         * to remove.
         */
        $this->donors[] = $this->donorRow(
            index: 0,
            name: 'Aslam Foundation',
            kind: 'Organisation',
            status: 'Active',
        );

        $this->scholarshipLinks[$this->scholarshipIds[ScholarshipCatalogue::EXTERNAL]]
            = $this->donors[0]['id'];

        for ($i = 1; $i < 14; $i++) {
            $isPerson = Draw::chance('donor-person', $i, 0.25);

            $name = $isPerson
                ? Draw::from('donor-person-name', $i, self::PEOPLE)
                : Draw::from('donor-stem', $i, self::STEMS)
                    .' '.Draw::from('donor-suffix', $i, self::SUFFIXES);

            $this->donors[] = $this->donorRow(
                index: $i,
                name: $name,
                kind: $isPerson
                    ? 'Individual'
                    : Draw::weighted('donor-kind', $i, [
                        'Organisation' => 6, 'Trust' => 3, 'Government' => 1,
                    ]),
                // Two archived, so the filter has something to hide.
                status: $i >= 12 ? 'Archived' : 'Active',
            );
        }
    }

    /** @return array<string, mixed> */
    private function donorRow(int $index, string $name, string $kind, string $status): array
    {
        $onboarded = sprintf('202%d-%02d-01', 3 + ($index % 3), 1 + ($index % 12));

        $row = [
            'id' => (string) Str::ulid(),
            'name' => $name,
            'kind' => $kind,
            'contact_name' => Draw::chance('donor-contact', $index, 0.7)
                ? Draw::from('donor-contact-name', $index, self::PEOPLE)
                : null,
            'contact_email' => null,
            'contact_phone' => null,
            'notes' => null,
            'status' => $status,
            'created_at' => Row::stamp($onboarded, '09:00:00'),
            'updated_at' => Row::stamp($onboarded, '09:00:00'),
        ];

        if ($row['contact_name'] !== null) {
            $slug = mb_strtolower(str_replace(' ', '.', $row['contact_name']));
            $row['contact_email'] = $slug.'@'.$this->emailHost($name);
            $row['contact_phone'] = sprintf('+92 %d %d', 300 + ($index % 46), 1000000 + ($index * 7919) % 8999999);
        }

        $this->log(
            kind: 'donor.registered',
            donorId: $row['id'],
            at: $onboarded,
            time: '09:00:00',
            action: 'Registered donor '.$name,
            reason: 'Donor onboarded',
        );

        return $row;
    }

    /** A plausible host built from the donor's own name, never a real domain. */
    private function emailHost(string $name): string
    {
        $slug = preg_replace('/[^a-z]+/', '', mb_strtolower($name));

        return substr((string) $slug, 0, 14).'.example.org';
    }

    /* -- what they promised -------------------------------------------------- */

    /**
     * Eighteen pledges across the twelve active donors.
     *
     * The terms are chosen against the demo's present rather than at random, so
     * the renewal report has both of its states on a fresh seed: two pledges
     * inside their notice window, one already past its end date and never
     * renewed, and the rest comfortably in the future.
     */
    private function createPledges(): void
    {
        $plans = [
            // [donor index, months from the seed month, term years, status]
            [0, -11, 4, 'Active'],    // Aslam Foundation, the big one
            [0, -47, 1, 'Completed'], // and an older, finished one
            [1, -11, 1, 'Active'],    // ends in one month -> inside the notice window
            [2, -13, 1, 'Active'],    // ended a month ago -> lapsed, still not renewed
            [3, -6, 1, 'Active'],
            [4, -23, 4, 'Active'],
            [5, -18, 3, 'Active'],
            [6, -7, 4, 'Active'],
            [7, -11, 2, 'Active'],
            [8, -30, 3, 'Active'],
            [9, -5, 1, 'Active'],
            [10, -14, 4, 'Active'],
            [11, -11, 1, 'Active'],   // ends in one month -> inside the notice window
            [1, -35, 2, 'Cancelled'],
            [4, -4, 2, 'Active'],
            [6, -9, 3, 'Active'],
            [8, -3, 1, 'Active'],
            [10, -26, 2, 'Active'],
        ];

        foreach ($plans as $index => [$donorIndex, $startsMonths, $termYears, $status]) {
            $donor = $this->donors[$donorIndex];
            $startsOn = $this->monthsFromNow($startsMonths);
            $total = (float) Draw::weighted('pledge-amount', $index, self::AMOUNTS);

            $pledgeId = (string) Str::ulid();
            $endsOn = $this->yearsAfter($startsOn, $termYears);

            // Only the flagship pledge is earmarked, so both shapes exist.
            $scholarshipId = $index === 0
                ? $this->scholarshipIds[ScholarshipCatalogue::EXTERNAL]
                : null;

            $this->pledges[] = [
                'id' => $pledgeId,
                'donor_id' => $donor['id'],
                'scholarship_id' => $scholarshipId,
                'reference' => sprintf('MOU-%d-%03d', 2023 + ($index % 4), $index + 1),
                'total_amount' => $total,
                'term_years' => $termYears,
                'starts_on' => Row::date($startsOn),
                'ends_on' => Row::date($endsOn),
                'renewal_notice_days' => Draw::weighted('notice', $index, ['90' => 7, '60' => 2, '120' => 2]),
                'status' => $status,
                'notes' => null,
                'created_at' => Row::stamp($startsOn, '10:00:00'),
                'updated_at' => Row::stamp($startsOn, '10:00:00'),
            ];

            $this->scheduleFor($pledgeId, $total, $startsOn, $termYears);

            $this->log(
                kind: 'pledge.recorded',
                donorId: $donor['id'],
                at: $startsOn,
                time: '10:00:00',
                action: sprintf(
                    'Pledged PKR %s over %d year%s, in %d instalment%s',
                    number_format($total, 2),
                    $termYears,
                    $termYears === 1 ? '' : 's',
                    $termYears,
                    $termYears === 1 ? '' : 's',
                ),
                reason: 'Commitment agreed',
                amount: $total,
                pledgeId: $pledgeId,
                scholarshipId: $scholarshipId,
            );
        }
    }

    /**
     * One instalment a year, with the remainder on the last.
     *
     * PKR 1,000,000 over three years is 333,333.33 three times and 999,999.99 —
     * a paisa short of the commitment, every time. Putting the difference on the
     * final line is what makes the schedule sum to the pledge exactly, which is
     * the invariant the receivable figure depends on.
     */
    private function scheduleFor(string $pledgeId, float $total, string $startsOn, int $years): void
    {
        $each = round($total / $years, 2);

        for ($year = 0; $year < $years; $year++) {
            $amount = $year === $years - 1
                ? round($total - ($each * ($years - 1)), 2)
                : $each;

            $this->instalments[] = [
                'id' => (string) Str::ulid(),
                'pledge_id' => $pledgeId,
                'sequence' => $year + 1,
                'amount' => $amount,
                'due_on' => Row::date($this->yearsAfter($startsOn, $year)),
            ];
        }
    }

    /* -- what arrived --------------------------------------------------------- */

    /**
     * Receipts against instalments that have already fallen due.
     *
     * Not all of them: what is left unpaid and past its date is exactly the
     * overdue receivable the requirement asks to surface. Instalments not yet
     * due are left alone, because money that has not been asked for has not
     * been missed.
     */
    private function receiveMoney(): void
    {
        $pledgesById = [];

        foreach ($this->pledges as $pledge) {
            $pledgesById[$pledge['id']] = $pledge;
        }

        $index = 0;

        foreach ($this->instalments as $instalment) {
            $index++;

            $pledge = $pledgesById[$instalment['pledge_id']];

            if ($pledge['status'] === 'Cancelled') {
                continue;
            }

            $dueOn = substr($instalment['due_on'], 0, 10);

            // Nothing arrives before it is asked for.
            if (strcmp($dueOn, $this->today()) > 0) {
                continue;
            }

            // A completed pledge was paid in full; otherwise about four in five
            // due instalments have been settled, leaving the rest overdue.
            $settled = $pledge['status'] === 'Completed'
                || Draw::chance('settled', $index, 0.8);

            if (! $settled) {
                continue;
            }

            $receivedOn = $this->daysAfter($dueOn, (int) (Draw::uniform('receipt-lag', $index) * 21));

            $donationId = (string) Str::ulid();

            $this->donations[] = [
                'id' => $donationId,
                'donor_id' => $pledge['donor_id'],
                'pledge_id' => $pledge['id'],
                'instalment_id' => $instalment['id'],
                'amount' => $instalment['amount'],
                'received_on' => Row::date($receivedOn),
                'method' => Draw::weighted('method', $index, [
                    'Bank transfer' => 7, 'Cheque' => 2, 'Online' => 2, 'Cash' => 1,
                ]),
                'reference' => sprintf('TXN-%d-%05d', 2025 + ($index % 2), 10000 + $index * 37),
                'recorded_by' => 'Admin',
                'notes' => null,
                'created_at' => Row::stamp($receivedOn, '11:00:00'),
                'updated_at' => Row::stamp($receivedOn, '11:00:00'),
            ];

            $this->log(
                kind: 'funds.received',
                donorId: $pledge['donor_id'],
                at: $receivedOn,
                time: '11:00:00',
                action: sprintf('Received PKR %s', number_format($instalment['amount'], 2)),
                reason: 'Instalment settled',
                amount: $instalment['amount'],
                pledgeId: $pledge['id'],
                donationId: $donationId,
            );
        }

        // Two unsolicited gifts, which arrive against no promise at all and
        // exercise the null pledge_id branch.
        foreach ([[3, -5, 250000.0], [7, -2, 400000.0]] as $n => [$donorIndex, $months, $amount]) {
            $on = $this->monthsFromNow($months);
            $donationId = (string) Str::ulid();

            $this->donations[] = [
                'id' => $donationId,
                'donor_id' => $this->donors[$donorIndex]['id'],
                'pledge_id' => null,
                'instalment_id' => null,
                'amount' => $amount,
                'received_on' => Row::date($on),
                'method' => 'Bank transfer',
                'reference' => sprintf('GIFT-%02d', $n + 1),
                'recorded_by' => 'Admin',
                'notes' => 'Unsolicited gift, not against a pledge.',
                'created_at' => Row::stamp($on, '11:30:00'),
                'updated_at' => Row::stamp($on, '11:30:00'),
            ];

            $this->log(
                kind: 'funds.received',
                donorId: $this->donors[$donorIndex]['id'],
                at: $on,
                time: '11:30:00',
                action: sprintf('Received PKR %s', number_format($amount, 2)),
                reason: 'Unsolicited gift',
                amount: $amount,
                donationId: $donationId,
            );
        }
    }

    /* -- what it paid for ----------------------------------------------------- */

    /**
     * Assign roughly 60% of what arrived, against real awards.
     *
     * Deliberately not all of it. The remainder is the "Unassigned Funds" the
     * requirement asks to make visible, and a demo that assigned everything
     * would show that screen empty.
     *
     * Allocations go against awards on the donor-funded scholarship where there
     * are enough, because that is the coherent story: a donor's money paying the
     * scholarship their pledge is earmarked for.
     */
    private function allocateMoney(): void
    {
        $fundable = array_values(array_filter(
            $this->awards,
            fn (array $award) => $award['status'] === 'Active'
        ));

        if ($fundable === []) {
            return;
        }

        $index = 0;
        $cursor = 0;

        foreach ($this->donations as $donation) {
            $index++;

            // Three receipts are left wholly unassigned, on purpose.
            if ($index % 9 === 0) {
                continue;
            }

            if (! Draw::chance('allocate', $index, 0.75)) {
                continue;
            }

            // Either the whole receipt or a slice of it, so both a fully
            // assigned and a part assigned receipt exist.
            $whole = Draw::chance('allocate-whole', $index, 0.35);
            $share = $whole ? 1.0 : 0.4 + Draw::uniform('allocate-share', $index) * 0.3;
            $amount = round($donation['amount'] * $share, 2);

            if ($amount <= 0) {
                continue;
            }

            $award = $fundable[$cursor % count($fundable)];
            $cursor++;

            $allocatedOn = $this->daysAfter(substr($donation['received_on'], 0, 10), 3);
            $allocationId = (string) Str::ulid();

            // A few are released again, so "money came back" is visible.
            $released = Draw::chance('release', $index, 0.07);

            $this->allocations[] = [
                'id' => $allocationId,
                'donation_id' => $donation['id'],
                'award_id' => $award['id'],
                'amount' => $amount,
                'allocated_on' => Row::date($allocatedOn),
                'allocated_by' => 'Admin',
                'reason' => 'Tuition support for this award',
                'status' => $released ? 'Released' : 'Active',
                'released_at' => $released ? Row::timestamp($this->daysAfter($allocatedOn, 30), '12:00:00') : null,
                'released_by' => $released ? 'Admin' : null,
                'release_reason' => $released ? 'Reassigned to a student in greater need.' : null,
                'created_at' => Row::stamp($allocatedOn, '12:00:00'),
                'updated_at' => Row::stamp($allocatedOn, '12:00:00'),
            ];

            $this->log(
                kind: 'funds.allocated',
                donorId: $donation['donor_id'],
                at: $allocatedOn,
                time: '12:00:00',
                action: sprintf(
                    'Allocated PKR %s of donor funds to %s',
                    number_format($amount, 2),
                    $award['student_reg_no'],
                ),
                reason: 'Tuition support for this award',
                amount: $amount,
                pledgeId: $donation['pledge_id'],
                donationId: $donation['id'],
                allocationId: $allocationId,
                studentRegNo: $award['student_reg_no'],
                scholarshipId: $award['scholarship_id'],
                awardId: $award['id'],
            );

            if ($released) {
                $this->log(
                    kind: 'funds.released',
                    donorId: $donation['donor_id'],
                    at: $this->daysAfter($allocatedOn, 30),
                    time: '12:00:00',
                    action: sprintf(
                        'Released PKR %s of donor funds from %s, back to unassigned',
                        number_format($amount, 2),
                        $award['student_reg_no'],
                    ),
                    reason: 'Reassigned to a student in greater need.',
                    amount: $amount,
                    pledgeId: $donation['pledge_id'],
                    donationId: $donation['id'],
                    allocationId: $allocationId,
                    studentRegNo: $award['student_reg_no'],
                    scholarshipId: $award['scholarship_id'],
                    awardId: $award['id'],
                );
            }
        }
    }

    /* -- the two logs ---------------------------------------------------------- */

    /**
     * An event and an audit line, written together, exactly as the writers do.
     *
     * The demo trail has to read like the live one or it teaches the wrong
     * thing: the same sentences, the same kinds, and the amount on the event as
     * a number rather than only inside the prose.
     */
    private function log(
        string $kind,
        string $donorId,
        string $at,
        string $time,
        string $action,
        string $reason,
        ?float $amount = null,
        ?string $pledgeId = null,
        ?string $donationId = null,
        ?string $allocationId = null,
        ?string $studentRegNo = null,
        ?string $scholarshipId = null,
        ?string $awardId = null,
    ): void {
        $payload = array_filter([
            'actor' => 'Admin',
            'reason' => $reason,
            'pledgeId' => $pledgeId,
            'donationId' => $donationId,
            'allocationId' => $allocationId,
        ], fn ($value) => $value !== null);

        $this->events[] = [
            'id' => (string) Str::ulid(),
            'kind' => $kind,
            'at' => Row::timestamp($at, $time),
            'semester' => Terms::semesterOf($at),
            'student_reg_no' => $studentRegNo,
            'scholarship_id' => $scholarshipId,
            'donor_id' => $donorId,
            'amount_pkr' => $amount,
            'award_id' => $awardId,
            'application_id' => null,
            'batch_id' => null,
            'payload' => Row::json($payload),
        ];

        $this->audit[] = [
            'id' => (string) Str::ulid(),
            'entity_type' => 'Donor',
            'entity_id' => $donorId,
            'action' => $action,
            'old_value' => null,
            'new_value' => null,
            'reason' => $reason,
            'actor' => 'Admin',
            'occurred_at' => Row::timestamp($at, $time),
        ];
    }

    /* -- dates ------------------------------------------------------------------ */

    private function yearsAfter(string $date, int $years): string
    {
        return gmdate('Y-m-d', strtotime("+{$years} years", (int) strtotime($date.' 00:00:00 UTC')));
    }

    private function daysAfter(string $date, int $days): string
    {
        return gmdate('Y-m-d', (int) strtotime($date.' 00:00:00 UTC') + ($days * 86400));
    }
}
