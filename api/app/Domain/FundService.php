<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Data\Donation;
use App\Domain\Data\Donor;
use App\Domain\Data\DonorFunding;
use App\Domain\Data\Pledge;

/**
 * Donor money: what is promised, what arrived, and what is left of it.
 *
 * The sixth pure module, and the transliteration rules that govern the other
 * five govern this one. src/lib/scholarship/funds.ts is the same arithmetic in
 * TypeScript, case for case, and the two test suites mirror each other. The
 * browser needs its copy because the Donors screen filters by fund state and
 * the totals have to move with the filter — recomputing that over a round trip
 * per keystroke is the thing merge.ts exists in the browser to avoid.
 *
 * Floats, not decimals, for the same reason as everywhere else: every number in
 * TypeScript is an IEEE-754 double and so is a PHP float. Decimal arithmetic
 * here would be arguably more correct and demonstrably different from the
 * browser, which is the one outcome that cannot be allowed.
 *
 * ## Why the three states are computed rather than stored
 *
 * The requirement names three: Pledged (pending receipt), Received
 * (unassigned), Received (assigned). None of them is a column anywhere.
 *
 * They are not row states. One receipt can be part allocated, so a status
 * column on a donation could only ever describe the whole of it, and the money
 * would have to be in one bucket when it is genuinely in two. They are amounts,
 * and an amount derived on read cannot drift from the rows it is derived from.
 *
 * The same call was made for screening verdicts, and for the same reason: a
 * verdict is recomputed on every read so that editing a threshold re-sorts the
 * queue immediately, while a decision — a thing a person did — is stored.
 * Receiving money and allocating it are the stored acts here. What those acts
 * add up to is not.
 */
final class FundService
{
    /**
     * A rupee is 100 paisa, and floats do not land on exact hundredths.
     *
     * Balances are compared against this rather than against zero. Without it,
     * a donation of 1,000,000 fully allocated across three awards can leave
     * 1.16e-10 behind and be reported as having money left, which is a row on a
     * screen telling a finance officer to go and find a fraction of a paisa.
     */
    public const TOLERANCE = 0.005;

    /**
     * What a donor has promised and not yet sent.
     *
     * Read from the schedule where there is one, because that is what carries
     * the dates the receivables report needs. A pledge with no schedule falls
     * back to its total minus what has arrived against it — the schedule is
     * required by the write path, so this is a safety net rather than a second
     * supported shape.
     *
     * Cancelled and Completed pledges are excluded. Cancelled money is not owed;
     * Completed means every instalment arrived, so an outstanding balance on one
     * would be a contradiction this figure should surface rather than absorb.
     *
     * @param  Pledge[]  $pledges
     * @param  Donation[]  $donations
     */
    public function receivable(array $pledges, array $donations): float
    {
        $total = 0.0;

        foreach ($pledges as $pledge) {
            if (! $pledge->isOutstanding()) {
                continue;
            }

            if ($pledge->instalments === []) {
                $total += max(0.0, $pledge->totalAmount - $this->receivedForPledge($pledge->id, $donations));

                continue;
            }

            foreach ($this->outstandingInstalments($pledge, $donations) as $remaining) {
                $total += $remaining['amount'];
            }
        }

        return $total;
    }

    /**
     * The part of the receivable that is already late.
     *
     * Separated from `receivable` rather than folded into it because they
     * prompt different actions: one is a forecast, the other is a phone call.
     *
     * @param  Pledge[]  $pledges
     * @param  Donation[]  $donations
     * @param  string  $asOf  YYYY-MM-DD
     */
    public function overdue(array $pledges, array $donations, string $asOf): float
    {
        $total = 0.0;

        foreach ($pledges as $pledge) {
            if (! $pledge->isOutstanding()) {
                continue;
            }

            foreach ($this->outstandingInstalments($pledge, $donations) as $remaining) {
                if (strcmp($remaining['dueOn'], $asOf) <= 0) {
                    $total += $remaining['amount'];
                }
            }
        }

        return $total;
    }

    /**
     * Cash that arrived, whatever has since happened to it.
     *
     * This is the figure the acceptance criteria call "actual cash on hand", and
     * it must never be added to `receivable` to make a single headline number.
     * One is money the university has; the other is money it hopes to have.
     *
     * @param  Donation[]  $donations
     */
    public function received(array $donations): float
    {
        $total = 0.0;

        foreach ($donations as $donation) {
            $total += $donation->amount;
        }

        return $total;
    }

    /**
     * Received money that has been put against an award.
     *
     * @param  Donation[]  $donations
     */
    public function assigned(array $donations): float
    {
        $total = 0.0;

        foreach ($donations as $donation) {
            $total += $donation->assigned();
        }

        return $total;
    }

    /**
     * Received money not yet put against an award — FR-03.
     *
     * Summed per donation rather than as `received() - assigned()` across the
     * whole set. The two differ if any single donation is over-allocated: the
     * subtraction would let one over-allocated receipt cancel out headroom on
     * another and report a plausible total, while this floors each receipt at
     * zero and leaves the discrepancy visible.
     *
     * @param  Donation[]  $donations
     */
    public function unassigned(array $donations): float
    {
        $total = 0.0;

        foreach ($donations as $donation) {
            $total += $donation->unassigned();
        }

        return $total;
    }

    /**
     * Everything about one donor's money, in one pass.
     *
     * @param  Pledge[]  $pledges  this donor's pledges
     * @param  Donation[]  $donations  this donor's receipts
     * @param  string  $asOf  YYYY-MM-DD
     */
    public function rollup(Donor $donor, array $pledges, array $donations, string $asOf): DonorFunding
    {
        return new DonorFunding(
            donorId: $donor->id,
            receivable: $this->receivable($pledges, $donations),
            received: $this->received($donations),
            assigned: $this->assigned($donations),
            unassigned: $this->unassigned($donations),
            overdue: $this->overdue($pledges, $donations, $asOf),
        );
    }

    /**
     * Pledges close enough to their end date to need a conversation — FR-01.
     *
     * The window is each pledge's own `renewalNoticeDays`, not a constant here.
     * A policy number belongs in data, and the variance is real: a government
     * grant and a family trust do not want the same lead time.
     *
     * A pledge already past its end date is included rather than dropped. It has
     * not been renewed and it has not been marked Completed, which is exactly
     * when somebody needs to be told.
     *
     * @param  Pledge[]  $pledges
     * @param  string  $asOf  YYYY-MM-DD
     * @return Pledge[] soonest first
     */
    public function renewalsDue(array $pledges, string $asOf): array
    {
        $due = [];

        foreach ($pledges as $pledge) {
            if (! $pledge->isOutstanding()) {
                continue;
            }

            if (strcmp($this->noticeOpensOn($pledge), $asOf) <= 0) {
                $due[] = $pledge;
            }
        }

        usort($due, fn (Pledge $a, Pledge $b) => strcmp($a->endsOn, $b->endsOn));

        return $due;
    }

    /**
     * The first day a pledge appears on the renewal report.
     *
     * `endsOn` minus `renewalNoticeDays`, as a date string. Computed with the
     * epoch rather than a date library so the TypeScript copy can be a literal
     * transliteration; both sides do the same integer arithmetic on days.
     */
    public function noticeOpensOn(Pledge $pledge): string
    {
        $ends = strtotime($pledge->endsOn.' 00:00:00 UTC');

        if ($ends === false) {
            return $pledge->endsOn;
        }

        return gmdate('Y-m-d', $ends - ($pledge->renewalNoticeDays * 86400));
    }

    /**
     * Whether a balance is meaningfully greater than zero.
     *
     * @see self::TOLERANCE
     */
    public function isPositive(float $amount): bool
    {
        return $amount > self::TOLERANCE;
    }

    /**
     * Instalment ids that a receipt has settled, as a set.
     *
     * @param  Donation[]  $donations
     * @return array<string, true>
     */
    private function settledInstalmentIds(array $donations): array
    {
        $settled = [];

        foreach ($donations as $donation) {
            if ($donation->instalmentId !== null) {
                $settled[$donation->instalmentId] = true;
            }
        }

        return $settled;
    }

    /**
     * What is still owed on each instalment, after part payments are credited.
     *
     * An instalment named by a receipt is settled outright — the write path
     * only allows that when the receipt covers it exactly, so there is no
     * remainder to carry. Everything else received against the pledge is a part
     * payment: money that has genuinely arrived and that no instalment claims.
     *
     * Those are credited against the unsettled instalments in the order the
     * schedule gives them, oldest first, because that is how a finance office
     * applies an unallocated payment and because it makes the overdue figure
     * fall before the future one does.
     *
     * Without this, `receivedForPledge` was reachable only through the
     * no-schedule branch, and `PledgeRequest` always writes a schedule — so a
     * part payment reduced nothing and the donor stayed liable for money they
     * had already sent.
     *
     * @param  Donation[]  $donations
     * @return list<array{amount: float, dueOn: string}> only what is still owed
     */
    private function outstandingInstalments(Pledge $pledge, array $donations): array
    {
        $settled = $this->settledInstalmentIds($donations);
        $credit = $this->partPaymentsForPledge($pledge->id, $donations);

        $outstanding = [];

        foreach ($pledge->instalments as $instalment) {
            if (isset($settled[$instalment->id])) {
                continue;
            }

            $remaining = $instalment->amount;

            if ($credit > 0.0) {
                $applied = min($credit, $remaining);
                $credit -= $applied;
                $remaining -= $applied;
            }

            if ($this->isPositive($remaining)) {
                $outstanding[] = ['amount' => $remaining, 'dueOn' => $instalment->dueOn];
            }
        }

        return $outstanding;
    }

    /**
     * Money received against a pledge that settles no particular instalment.
     *
     * @param  Donation[]  $donations
     */
    private function partPaymentsForPledge(string $pledgeId, array $donations): float
    {
        $total = 0.0;

        foreach ($donations as $donation) {
            if ($donation->pledgeId === $pledgeId && $donation->instalmentId === null) {
                $total += $donation->amount;
            }
        }

        return $total;
    }

    /**
     * What has arrived against one pledge.
     *
     * @param  Donation[]  $donations
     */
    private function receivedForPledge(string $pledgeId, array $donations): float
    {
        $total = 0.0;

        foreach ($donations as $donation) {
            if ($donation->pledgeId === $pledgeId) {
                $total += $donation->amount;
            }
        }

        return $total;
    }
}
