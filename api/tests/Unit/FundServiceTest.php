<?php

declare(strict_types=1);

/**
 * A mirror of src/lib/scholarship/funds.test.ts, case for case.
 *
 * The test names are identical on both sides so a failure here points straight
 * at its counterpart there. Change a case in one file and change it in the
 * other — the two implementations are transliterations and the suites are what
 * keep them that way.
 */

use App\Domain\Data\Donation;
use App\Domain\Data\Donor;
use App\Domain\Data\DonorFunding;
use App\Domain\Data\FundAllocation;
use App\Domain\Data\Pledge;
use App\Domain\Data\PledgeInstalment;
use App\Domain\FundService;

const DONOR_ID = 'dn-1';

beforeEach(function () {
    $this->funds = new FundService;

    $this->donor = new Donor(
        id: DONOR_ID,
        name: 'Aslam Foundation',
        kind: 'Organisation',
        status: 'Active',
    );
});

function anInstalment(string $id, int $sequence, float $amount, string $dueOn): PledgeInstalment
{
    return new PledgeInstalment(id: $id, sequence: $sequence, amount: $amount, dueOn: $dueOn);
}

/** @param  array<string, mixed>  $patch */
function aPledge(array $patch = []): Pledge
{
    $defaults = [
        'id' => 'pl-1',
        'donorId' => DONOR_ID,
        'totalAmount' => 4_000_000.0,
        'termYears' => 4,
        'startsOn' => '2025-09-01',
        'endsOn' => '2029-09-01',
        'renewalNoticeDays' => 90,
        'status' => 'Active',
        'instalments' => [
            anInstalment('in-1', 1, 1_000_000.0, '2025-09-01'),
            anInstalment('in-2', 2, 1_000_000.0, '2026-09-01'),
            anInstalment('in-3', 3, 1_000_000.0, '2027-09-01'),
            anInstalment('in-4', 4, 1_000_000.0, '2028-09-01'),
        ],
    ];

    return new Pledge(...array_merge($defaults, $patch));
}

/** @param  array<string, mixed>  $patch */
function anAllocation(array $patch = []): FundAllocation
{
    $defaults = [
        'id' => 'al-1',
        'donationId' => 'do-1',
        'awardId' => 'aw-1',
        'amount' => 350_000.0,
        'allocatedOn' => '2025-09-15',
        'allocatedBy' => 'Admin',
        'reason' => 'Tuition support',
        'status' => 'Active',
    ];

    return new FundAllocation(...array_merge($defaults, $patch));
}

/** @param  array<string, mixed>  $patch */
function aDonation(array $patch = []): Donation
{
    $defaults = [
        'id' => 'do-1',
        'donorId' => DONOR_ID,
        'amount' => 1_000_000.0,
        'receivedOn' => '2025-09-12',
        'method' => 'Bank transfer',
        'recordedBy' => 'Admin',
        'allocations' => [],
    ];

    return new Donation(...array_merge($defaults, $patch));
}

describe('what one receipt is worth', function () {
    it('counts nothing as assigned when it has no allocations', function () {
        expect(aDonation()->assigned())->toBe(0.0)
            ->and(aDonation()->unassigned())->toBe(1_000_000.0);
    });

    it('counts active allocations against the balance', function () {
        $donation = aDonation(['allocations' => [
            anAllocation(['amount' => 350_000.0]),
            anAllocation(['id' => 'al-2', 'amount' => 300_000.0]),
        ]]);

        expect($donation->assigned())->toBe(650_000.0)
            ->and($donation->unassigned())->toBe(350_000.0);
    });

    it('ignores a released allocation, because the money came back', function () {
        $donation = aDonation(['allocations' => [
            anAllocation(['amount' => 350_000.0]),
            anAllocation(['id' => 'al-2', 'amount' => 300_000.0, 'status' => 'Released']),
        ]]);

        expect($donation->assigned())->toBe(350_000.0)
            ->and($donation->unassigned())->toBe(650_000.0);
    });

    it('floors an over-allocated receipt at zero rather than going negative', function () {
        // The write path refuses this, so reaching it means a guard already
        // failed. A negative would subtract from every other donation's
        // headroom and hide the fault instead of showing it.
        $donation = aDonation(['amount' => 100.0, 'allocations' => [anAllocation(['amount' => 250.0])]]);

        expect($donation->unassigned())->toBe(0.0);
    });
});

describe('receivables', function () {
    it('counts every instalment when nothing has arrived', function () {
        expect($this->funds->receivable([aPledge()], []))->toBe(4_000_000.0);
    });

    it('stops counting an instalment once a receipt settles it', function () {
        $settled = aDonation(['pledgeId' => 'pl-1', 'instalmentId' => 'in-1']);

        expect($this->funds->receivable([aPledge()], [$settled]))->toBe(3_000_000.0);
    });

    it('ignores a cancelled pledge, because nobody is waiting for that money', function () {
        expect($this->funds->receivable([aPledge(['status' => 'Cancelled'])], []))->toBe(0.0);
    });

    it('ignores a completed pledge', function () {
        expect($this->funds->receivable([aPledge(['status' => 'Completed'])], []))->toBe(0.0);
    });

    it('falls back to the total minus receipts when a pledge has no schedule', function () {
        $pledge = aPledge(['instalments' => [], 'totalAmount' => 500_000.0]);
        $part = aDonation(['pledgeId' => 'pl-1', 'amount' => 200_000.0]);

        expect($this->funds->receivable([$pledge], [$part]))->toBe(300_000.0);
    });

    it('never reports a negative receivable when more arrived than was promised', function () {
        $pledge = aPledge(['instalments' => [], 'totalAmount' => 100_000.0]);
        $generous = aDonation(['pledgeId' => 'pl-1', 'amount' => 250_000.0]);

        expect($this->funds->receivable([$pledge], [$generous]))->toBe(0.0);
    });

    it('does not count a receipt against a different pledge', function () {
        $pledge = aPledge(['instalments' => [], 'totalAmount' => 500_000.0]);
        $elsewhere = aDonation(['pledgeId' => 'pl-other', 'amount' => 200_000.0]);

        expect($this->funds->receivable([$pledge], [$elsewhere]))->toBe(500_000.0);
    });

    /*
     * Part payments against a scheduled pledge.
     *
     * These used to reduce nothing at all. The only branch that read a receipt
     * against the pledge total was the no-schedule fallback above, and
     * PledgeRequest always writes a schedule -- so money that had genuinely
     * arrived left the donor liable for the whole of it.
     */
    it('credits a part payment against the schedule', function () {
        $part = aDonation(['pledgeId' => 'pl-1', 'amount' => 400_000.0]);

        expect($this->funds->receivable([aPledge()], [$part]))->toBe(3_600_000.0);
    });

    it('credits a part payment to the earliest unsettled instalment first', function () {
        // 400,000 against a 1,000,000 first instalment leaves 600,000 of it,
        // which is what the overdue case below depends on.
        $part = aDonation(['pledgeId' => 'pl-1', 'amount' => 400_000.0]);

        expect($this->funds->overdue([aPledge()], [$part], '2025-12-31'))->toBe(600_000.0);
    });

    it('carries a part payment past an instalment it more than covers', function () {
        $part = aDonation(['pledgeId' => 'pl-1', 'amount' => 1_500_000.0]);

        expect($this->funds->receivable([aPledge()], [$part]))->toBe(2_500_000.0)
            ->and($this->funds->overdue([aPledge()], [$part], '2026-12-31'))->toBe(500_000.0);
    });

    it('skips a settled instalment when crediting a part payment', function () {
        $settled = aDonation(['id' => 'do-s', 'pledgeId' => 'pl-1', 'instalmentId' => 'in-1']);
        $part = aDonation(['id' => 'do-p', 'pledgeId' => 'pl-1', 'amount' => 250_000.0]);

        // in-1 is gone entirely; the 250,000 lands on in-2.
        expect($this->funds->receivable([aPledge()], [$settled, $part]))->toBe(2_750_000.0);
    });

    it('never reports a negative when part payments exceed the whole schedule', function () {
        $part = aDonation(['pledgeId' => 'pl-1', 'amount' => 9_000_000.0]);

        expect($this->funds->receivable([aPledge()], [$part]))->toBe(0.0);
    });

    it('does not credit a part payment made against a different pledge', function () {
        $elsewhere = aDonation(['pledgeId' => 'pl-other', 'amount' => 400_000.0]);

        expect($this->funds->receivable([aPledge()], [$elsewhere]))->toBe(4_000_000.0);
    });

    it('does not credit an unsolicited gift, which is against no pledge at all', function () {
        $gift = aDonation(['amount' => 400_000.0]);

        expect($this->funds->receivable([aPledge()], [$gift]))->toBe(4_000_000.0);
    });
});

describe('overdue', function () {
    it('counts only instalments whose due date has passed', function () {
        expect($this->funds->overdue([aPledge()], [], '2026-12-31'))->toBe(2_000_000.0);
    });

    it('counts an instalment due exactly today', function () {
        expect($this->funds->overdue([aPledge()], [], '2025-09-01'))->toBe(1_000_000.0);
    });

    it('stops counting one that has been settled', function () {
        $settled = aDonation(['pledgeId' => 'pl-1', 'instalmentId' => 'in-1']);

        expect($this->funds->overdue([aPledge()], [$settled], '2026-12-31'))->toBe(1_000_000.0);
    });

    it('counts nothing before the first instalment falls due', function () {
        expect($this->funds->overdue([aPledge()], [], '2025-01-01'))->toBe(0.0);
    });
});

describe('cash and its allocation', function () {
    it('adds up everything that arrived', function () {
        $donations = [
            aDonation(['amount' => 1_000_000.0]),
            aDonation(['id' => 'do-2', 'amount' => 250_000.0]),
        ];

        expect($this->funds->received($donations))->toBe(1_250_000.0);
    });

    it('adds up what has been spent and what has not', function () {
        $donations = [
            aDonation(['amount' => 1_000_000.0, 'allocations' => [anAllocation(['amount' => 400_000.0])]]),
            aDonation(['id' => 'do-2', 'amount' => 250_000.0]),
        ];

        expect($this->funds->assigned($donations))->toBe(400_000.0)
            ->and($this->funds->unassigned($donations))->toBe(850_000.0);
    });

    it('does not let an over-allocated receipt eat another receipt\'s headroom', function () {
        // received - assigned would report 50 here. Summing per donation
        // reports 100, which is the money genuinely available, and leaves the
        // bad row's discrepancy visible rather than netted away.
        $donations = [
            aDonation(['amount' => 100.0, 'allocations' => [anAllocation(['amount' => 150.0])]]),
            aDonation(['id' => 'do-2', 'amount' => 100.0]),
        ];

        expect($this->funds->received($donations))->toBe(200.0)
            ->and($this->funds->assigned($donations))->toBe(150.0)
            ->and($this->funds->unassigned($donations))->toBe(100.0);
    });
});

describe('the donor rollup', function () {
    it('reports all five figures together', function () {
        $settled = aDonation([
            'pledgeId' => 'pl-1',
            'instalmentId' => 'in-1',
            'allocations' => [anAllocation(['amount' => 400_000.0])],
        ]);

        $funding = $this->funds->rollup($this->donor, [aPledge()], [$settled], '2026-12-31');

        expect($funding)->toEqual(new DonorFunding(
            donorId: DONOR_ID,
            receivable: 3_000_000.0,
            received: 1_000_000.0,
            assigned: 400_000.0,
            unassigned: 600_000.0,
            overdue: 1_000_000.0,
        ));
    });

    it('keeps cash and promises apart', function () {
        // The acceptance criterion: actual cash on hand is never folded into
        // projected revenue.
        $funding = $this->funds->rollup($this->donor, [aPledge()], [], '2025-01-01');

        expect($funding->received)->toBe(0.0)
            ->and($funding->receivable)->toBe(4_000_000.0);
    });
});

describe('renewals', function () {
    it('opens the notice window the stated number of days before the end', function () {
        expect($this->funds->noticeOpensOn(aPledge()))->toBe('2029-06-03');
    });

    it('respects a per-pledge notice period rather than one constant', function () {
        expect($this->funds->noticeOpensOn(aPledge(['renewalNoticeDays' => 30])))->toBe('2029-08-02')
            ->and($this->funds->noticeOpensOn(aPledge(['renewalNoticeDays' => 365])))->toBe('2028-09-01');
    });

    it('says nothing until the window opens', function () {
        expect($this->funds->renewalsDue([aPledge()], '2029-06-02'))->toBe([]);
    });

    it('raises a pledge on the day its window opens', function () {
        expect($this->funds->renewalsDue([aPledge()], '2029-06-03'))->toHaveCount(1);
    });

    it('keeps raising one that is already past its end date', function () {
        // It was not renewed and was not marked Completed, which is exactly
        // when somebody needs to be told.
        expect($this->funds->renewalsDue([aPledge()], '2030-01-01'))->toHaveCount(1);
    });

    it('ignores cancelled and completed pledges', function () {
        $dead = [
            aPledge(['status' => 'Cancelled']),
            aPledge(['id' => 'pl-2', 'status' => 'Completed']),
        ];

        expect($this->funds->renewalsDue($dead, '2030-01-01'))->toBe([]);
    });

    it('returns the soonest ending first', function () {
        $later = aPledge(['id' => 'pl-late', 'endsOn' => '2029-12-01']);
        $sooner = aPledge(['id' => 'pl-soon', 'endsOn' => '2029-01-01']);

        $ids = array_map(
            fn (Pledge $pledge) => $pledge->id,
            $this->funds->renewalsDue([$later, $sooner], '2030-01-01')
        );

        expect($ids)->toBe(['pl-soon', 'pl-late']);
    });

    it('does not reorder the caller\'s array', function () {
        $pledges = [
            aPledge(['id' => 'pl-late', 'endsOn' => '2029-12-01']),
            aPledge(['id' => 'pl-soon']),
        ];

        $this->funds->renewalsDue($pledges, '2030-01-01');

        expect(array_map(fn (Pledge $pledge) => $pledge->id, $pledges))->toBe(['pl-late', 'pl-soon']);
    });
});

describe('the paisa tolerance', function () {
    it('treats a floating-point remainder as nothing', function () {
        $donation = aDonation(['amount' => 1_000_000.0, 'allocations' => [
            anAllocation(['amount' => 333_333.33]),
            anAllocation(['id' => 'al-2', 'amount' => 333_333.33]),
            anAllocation(['id' => 'al-3', 'amount' => 333_333.34]),
        ]]);

        expect($this->funds->isPositive($donation->unassigned()))->toBeFalse();
    });

    it('treats a real remainder as money', function () {
        $donation = aDonation([
            'amount' => 1_000_000.0,
            'allocations' => [anAllocation(['amount' => 999_999.0])],
        ]);

        expect($this->funds->isPositive($donation->unassigned()))->toBeTrue();
    });

    it('sits below one paisa', function () {
        expect(FundService::TOLERANCE)->toBeLessThan(0.01);
    });
});
