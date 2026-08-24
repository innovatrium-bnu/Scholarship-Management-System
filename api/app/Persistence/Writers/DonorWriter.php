<?php

declare(strict_types=1);

namespace App\Persistence\Writers;

use App\Domain\Data\DomainEvent;
use App\Models\Donor;
use App\Models\Pledge;
use App\Persistence\DomainDate;
use App\Persistence\Repositories\DomainEventRepository;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Registering donors and recording what they have promised.
 *
 * Every method writes three things in one transaction: the row, an event, and
 * an audit line. That is the rule for every mutation in this system and it is
 * not relaxed for a module that happens to be about money — if anything the
 * opposite, since these are the first rows that record cash rather than fee
 * relief.
 *
 * The split between the two logs matters here more than usual. The audit
 * sentence says "Pledged PKR 4,000,000 over 4 years" for a person to read; the
 * event carries the same amount as a number, because "how much was pledged this
 * term" has to be a sum and not a regex over English. That distinction was
 * learnt the hard way when a revocation's term lived only inside its audit
 * sentence.
 */
final class DonorWriter
{
    public function __construct(
        private readonly AuditWriter $audit,
        private readonly DomainEventRepository $events,
    ) {}

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function create(array $attributes, string $actor, ?string $reason = null): Donor
    {
        return DB::transaction(function () use ($attributes, $actor, $reason) {
            $at = now();

            $donor = Donor::create($attributes);

            $this->record(
                kind: 'donor.registered',
                donor: $donor,
                at: $at,
                actor: $actor,
                action: 'Registered donor '.$donor->name,
                reason: $reason,
                newValue: ['name' => $donor->name, 'kind' => $donor->kind],
            );

            return $donor;
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function update(Donor $donor, array $attributes, string $actor, string $reason): ?Donor
    {
        return DB::transaction(function () use ($donor, $attributes, $actor, $reason) {
            $donor->fill($attributes);

            /*
             * Nothing changed, so nothing is written.
             *
             * The same rule the student and scholarship endpoints follow: an
             * audit log that reports changes nobody made is worth less than one
             * with a visible gap, and a no-op that toasts "saved" teaches the
             * user their edit landed when it did not.
             */
            if ($donor->getDirty() === []) {
                return null;
            }

            $before = array_intersect_key($donor->getOriginal(), $donor->getDirty());
            $after = $donor->getDirty();

            $at = now();
            $donor->save();

            $this->record(
                kind: 'donor.updated',
                donor: $donor,
                at: $at,
                actor: $actor,
                action: 'Updated donor '.$donor->name,
                reason: $reason,
                oldValue: $before,
                newValue: $after,
            );

            return $donor;
        });
    }

    /**
     * Retire a donor without losing them.
     *
     * Archived, never deleted — a donor whose money paid a student's fee is
     * part of that student's financial record, and the allocations still point
     * at them. Archiving only removes them from the pickers.
     */
    public function archive(Donor $donor, string $actor, string $reason): void
    {
        DB::transaction(function () use ($donor, $actor, $reason) {
            $at = now();

            $donor->update(['status' => 'Archived']);

            $this->record(
                kind: 'donor.archived',
                donor: $donor,
                at: $at,
                actor: $actor,
                action: 'Archived donor '.$donor->name,
                reason: $reason,
            );
        });
    }

    public function restore(Donor $donor, string $actor, string $reason): void
    {
        DB::transaction(function () use ($donor, $actor, $reason) {
            $at = now();

            $donor->update(['status' => 'Active']);

            $this->record(
                kind: 'donor.restored',
                donor: $donor,
                at: $at,
                actor: $actor,
                action: 'Restored donor '.$donor->name.' from the archive',
                reason: $reason,
            );
        });
    }

    /**
     * Record a pledge and the schedule it will arrive on.
     *
     * The instalments are written here rather than by a second call, because a
     * pledge without its schedule is a commitment nobody can chase: the
     * receivables figure and the renewal date both read the schedule, and a
     * pledge that existed for even one request without one would be a row those
     * two reports quietly disagreed about.
     *
     * @param  array<string, mixed>  $attributes
     * @param  list<array{amount: float, dueOn: string}>  $instalments  already validated to sum
     */
    public function addPledge(Donor $donor, array $attributes, array $instalments, string $actor, string $reason): Pledge
    {
        return DB::transaction(function () use ($donor, $attributes, $instalments, $actor, $reason) {
            $at = now();

            $pledge = $donor->pledges()->create($attributes);

            foreach ($instalments as $sequence => $instalment) {
                $pledge->instalments()->create([
                    'sequence' => $sequence + 1,
                    'amount' => $instalment['amount'],
                    'due_on' => $instalment['dueOn'],
                ]);
            }

            $this->record(
                kind: 'pledge.recorded',
                donor: $donor,
                at: $at,
                actor: $actor,
                action: sprintf(
                    'Pledged PKR %s over %d year%s, in %d instalment%s',
                    number_format($pledge->total_amount, 2),
                    $pledge->term_years,
                    $pledge->term_years === 1 ? '' : 's',
                    count($instalments),
                    count($instalments) === 1 ? '' : 's',
                ),
                reason: $reason,
                newValue: [
                    'pledgeId' => $pledge->id,
                    'totalAmount' => $pledge->total_amount,
                    'termYears' => $pledge->term_years,
                    'endsOn' => DomainDate::date($pledge->ends_on),
                ],
                amount: $pledge->total_amount,
                pledgeId: $pledge->id,
                scholarshipId: $pledge->scholarship_id,
            );

            return $pledge->fresh(['instalments']);
        });
    }

    /**
     * Withdraw a commitment.
     *
     * The event carries the **outstanding** amount, not the headline total,
     * because the question a report asks is how much promised money evaporated
     * — and money already received did not. Writing the headline would overstate
     * every cancellation by whatever had already arrived.
     */
    public function cancelPledge(Pledge $pledge, float $outstanding, string $actor, string $reason): void
    {
        DB::transaction(function () use ($pledge, $outstanding, $actor, $reason) {
            $at = now();

            $pledge->update(['status' => 'Cancelled']);

            $this->record(
                kind: 'pledge.cancelled',
                donor: $pledge->donor,
                at: $at,
                actor: $actor,
                action: sprintf(
                    'Cancelled a pledge with PKR %s still outstanding',
                    number_format($outstanding, 2)
                ),
                reason: $reason,
                oldValue: ['pledgeId' => $pledge->id, 'totalAmount' => $pledge->total_amount],
                amount: $outstanding,
                pledgeId: $pledge->id,
            );
        });
    }

    /**
     * The event and the audit line, written together.
     *
     * Every mutation above funnels through here so the pairing cannot be half
     * done. The audit entity is always the donor: nobody browses to a pledge
     * id, they open a donor and ask what has happened to them, so a donor's
     * whole history is one query.
     *
     * @param  array<string, mixed>|null  $oldValue
     * @param  array<string, mixed>|null  $newValue
     */
    private function record(
        string $kind,
        Donor $donor,
        Carbon $at,
        string $actor,
        string $action,
        ?string $reason = null,
        ?array $oldValue = null,
        ?array $newValue = null,
        ?float $amount = null,
        ?string $pledgeId = null,
        ?string $scholarshipId = null,
    ): void {
        $this->events->record(new DomainEvent(
            kind: $kind,
            at: DomainDate::timestamp($at),
            actor: $actor,
            scholarshipId: $scholarshipId,
            semester: DomainDate::semesterOf(DomainDate::timestamp($at)),
            donorId: $donor->id,
            amount: $amount,
            pledgeId: $pledgeId,
        ));

        $this->audit->record(
            entityType: 'Donor',
            entityId: $donor->id,
            action: $action,
            actor: $actor,
            reason: $reason,
            oldValue: $oldValue,
            newValue: $newValue,
            at: $at,
        );
    }
}
