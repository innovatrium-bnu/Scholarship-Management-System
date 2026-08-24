<?php

declare(strict_types=1);

namespace App\Persistence\Writers;

use App\Domain\Data\DomainEvent;
use App\Domain\FundService;
use App\Models\Award;
use App\Models\Donation;
use App\Models\Donor;
use App\Models\FundAllocation;
use App\Persistence\DomainDate;
use App\Persistence\Repositories\DomainEventRepository;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Money arriving, being spent on a student, and coming back.
 *
 * The three writes in this system that move cash rather than compute relief.
 *
 * ## The over-allocation guard
 *
 * `allocate()` is the one path here where being wrong loses money silently, so
 * it re-reads the donation **under a row lock** rather than trusting the balance
 * the caller saw. Two people with the funds screen open both see PKR 400,000
 * unassigned; without the lock both allocate 300,000 and the receipt is
 * overspent by 200,000 with nothing anywhere saying so.
 *
 * A CHECK constraint cannot express it — the rule is "the sum of my children
 * must not exceed my column", which needs a subquery, and Oracle disallows one
 * in a CHECK. The alternatives were a trigger (nothing in this system uses one,
 * and a trigger is a rule invisible from the application) or a denormalised
 * `allocated` column, which is the stored-total mistake the whole module avoids.
 * So the lock is the mechanism, and a test proves two concurrent allocations
 * cannot both land.
 */
final class FundWriter
{
    public function __construct(
        private readonly AuditWriter $audit,
        private readonly DomainEventRepository $events,
        private readonly FundService $funds = new FundService,
    ) {}

    /**
     * Record money arriving.
     *
     * `recorded_by` is the signed-in actor and is never taken from the request.
     * A caller-supplied name on a money record is an attribution nobody can
     * rely on, which is exactly the defect that had to be closed on the
     * revocation endpoint.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function receive(Donor $donor, array $attributes, string $actor, ?string $reason = null): Donation
    {
        return DB::transaction(function () use ($donor, $attributes, $actor, $reason) {
            $at = now();

            $donation = $donor->donations()->create($attributes + ['recorded_by' => $actor]);

            $this->record(
                kind: 'funds.received',
                donorId: $donor->id,
                at: $at,
                actor: $actor,
                action: sprintf(
                    'Received PKR %s from %s by %s',
                    number_format($donation->amount, 2),
                    $donor->name,
                    mb_strtolower($donation->method),
                ),
                reason: $reason,
                amount: $donation->amount,
                pledgeId: $donation->pledge_id,
                donationId: $donation->id,
                newValue: [
                    'donationId' => $donation->id,
                    'amount' => $donation->amount,
                    'receivedOn' => DomainDate::date($donation->received_on),
                ],
            );

            return $donation;
        });
    }

    /**
     * Put received money against an award.
     *
     * Returns null when the receipt cannot cover it, so the caller can answer
     * 409 with the real balance rather than a validation error — the amount was
     * well formed, the world changed underneath it.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function allocate(
        Donation $donation,
        Award $award,
        float $amount,
        string $actor,
        string $reason,
    ): ?FundAllocation {
        return DB::transaction(function () use ($donation, $award, $amount, $actor, $reason) {
            /*
             * Re-read under a lock, and re-sum from the database.
             *
             * Not from the domain object the caller already has: that was
             * loaded before this transaction opened and another allocation may
             * have landed since. The lock is what makes the sum below true for
             * as long as it takes to write the row.
             */
            $locked = Donation::query()->whereKey($donation->id)->lockForUpdate()->firstOrFail();

            $spent = (float) FundAllocation::query()
                ->where('donation_id', $locked->id)
                ->active()
                ->sum('amount');

            $available = round($locked->amount - $spent, 2);

            if ($amount > $available + FundService::TOLERANCE) {
                return null;
            }

            $at = now();

            $allocation = FundAllocation::create([
                'donation_id' => $locked->id,
                'award_id' => $award->id,
                'amount' => $amount,
                'allocated_on' => $at->toDateString(),
                'allocated_by' => $actor,
                'reason' => $reason,
                'status' => 'Active',
            ]);

            $this->record(
                kind: 'funds.allocated',
                donorId: $locked->donor_id,
                at: $at,
                actor: $actor,
                action: sprintf(
                    'Allocated PKR %s of donor funds to %s',
                    number_format($amount, 2),
                    $award->student_reg_no,
                ),
                reason: $reason,
                amount: $amount,
                pledgeId: $locked->pledge_id,
                donationId: $locked->id,
                allocationId: $allocation->id,

                /*
                 * The student and scholarship are carried on the event as
                 * columns even though both are reachable by joining the award.
                 * The award row is deletable — undoing a batch really does
                 * delete it — and "which donor sponsored which student" is
                 * asked to be auditable, which a join through a deletable row
                 * is not.
                 */
                studentRegNo: $award->student_reg_no,
                scholarshipId: $award->scholarship_id,
                awardId: $award->id,
            );

            return $allocation;
        });
    }

    /**
     * Take money back off an award so it can go somewhere else.
     *
     * Released, not deleted, and it keeps who and why. The money was assigned to
     * a student at a point in time and reassigning it later does not make that
     * untrue — the same reason a revoked award keeps its row.
     */
    public function release(FundAllocation $allocation, string $actor, string $reason): void
    {
        DB::transaction(function () use ($allocation, $actor, $reason) {
            $at = now();

            $allocation->update([
                'status' => 'Released',
                'released_at' => $at,
                'released_by' => $actor,
                'release_reason' => $reason,
            ]);

            $donation = $allocation->donation;
            $award = $allocation->award;

            $this->record(
                kind: 'funds.released',
                donorId: $donation->donor_id,
                at: $at,
                actor: $actor,
                action: sprintf(
                    'Released PKR %s of donor funds from %s, back to unassigned',
                    number_format($allocation->amount, 2),
                    $award->student_reg_no,
                ),
                reason: $reason,
                amount: $allocation->amount,
                pledgeId: $donation->pledge_id,
                donationId: $donation->id,
                allocationId: $allocation->id,
                studentRegNo: $award->student_reg_no,
                scholarshipId: $award->scholarship_id,
                awardId: $award->id,
            );
        });
    }

    /**
     * The event and the audit line, together, on every money movement.
     *
     * The audit entity is the donor rather than the allocation, because nobody
     * browses to an allocation id — they open a donor and ask what happened to
     * their money. The award side stays reachable through the event, which
     * carries the student and the award as columns.
     *
     * @param  array<string, mixed>|null  $newValue
     */
    private function record(
        string $kind,
        string $donorId,
        Carbon $at,
        string $actor,
        string $action,
        ?string $reason = null,
        ?float $amount = null,
        ?string $pledgeId = null,
        ?string $donationId = null,
        ?string $allocationId = null,
        ?string $studentRegNo = null,
        ?string $scholarshipId = null,
        ?string $awardId = null,
        ?array $newValue = null,
    ): void {
        $this->events->record(new DomainEvent(
            kind: $kind,
            at: DomainDate::timestamp($at),
            actor: $actor,
            awardId: $awardId,
            studentRegNo: $studentRegNo,
            scholarshipId: $scholarshipId,
            semester: DomainDate::semesterOf(DomainDate::timestamp($at)),
            reason: $reason,
            donorId: $donorId,
            amount: $amount,
            pledgeId: $pledgeId,
            donationId: $donationId,
            allocationId: $allocationId,
        ));

        $this->audit->record(
            entityType: 'Donor',
            entityId: $donorId,
            action: $action,
            actor: $actor,
            reason: $reason,
            newValue: $newValue,
            at: $at,
        );
    }
}
