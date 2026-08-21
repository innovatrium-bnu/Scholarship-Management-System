<?php

declare(strict_types=1);

namespace App\Persistence\Writers;

use App\Domain\Data\DomainEvent;
use App\Models\Award;
use App\Models\Revocation;
use App\Persistence\DomainDate;
use App\Persistence\Repositories\DomainEventRepository;
use Illuminate\Support\Facades\DB;

/**
 * Ends an award, or changes what it pays.
 *
 * A port of revokeAward, editAwardByHand and updateAwardComponent in store.tsx.
 */
final class AwardWriter
{
    public function __construct(
        private readonly AuditWriter $audit,
        private readonly DomainEventRepository $events,
    ) {}

    /**
     * Revoke an award, writing the revocation row that says why.
     *
     * $effective is either an ISO date or a term label, because one screen
     * offers a date picker and another offers a list of terms. store.tsx
     * normalises both at this boundary and so does this — the row always ends
     * up with both a date the money stops on and the term it falls in, so
     * "how many students lost a scholarship last semester" is a GROUP BY rather
     * than a regex over prose.
     */
    public function revoke(
        Award $award,
        string $effective,
        string $timing,
        string $cause,
        string $reason,
        string $actor,
    ): Revocation {
        return DB::transaction(function () use ($award, $effective, $timing, $cause, $reason, $actor) {
            $at = now();

            $isDate = DomainDate::looksLikeDate($effective);
            $effectiveFrom = $isDate
                ? substr($effective, 0, 10)
                : DomainDate::dateOfSemester($effective);
            $semester = $isDate ? DomainDate::semesterOf($effective) : $effective;

            $revocation = Revocation::create([
                'award_id' => $award->id,
                'at' => $at,
                'effective_from' => $effectiveFrom,
                'semester' => $semester,
                'timing' => $timing,
                'cause' => $cause,
                'reason' => $reason,
                // The actor, not a caller-supplied name. There is one
                // source of truth for who ended an award, and it is the
                // session -- the same value the event and the audit line
                // carry, so the three can never disagree.
                'revoked_by' => $actor,
            ]);

            $award->update(['status' => 'Revoked']);

            $this->events->record(new DomainEvent(
                kind: 'award.revoked',
                at: DomainDate::timestamp($at),
                actor: $actor,
                awardId: $award->id,
                studentRegNo: $award->student_reg_no,
                scholarshipId: $award->scholarship_id,
                effectiveFrom: $effectiveFrom,
                semester: $semester,
                timing: $timing,
                cause: $cause,
                reason: $reason,
            ));

            $this->audit->record(
                entityType: 'Award',
                entityId: $award->id,
                action: sprintf('Revoked award, effective %s (%s)', $effectiveFrom, $timing),
                actor: $actor,
                reason: $reason,
                at: $at,
            );

            return $revocation;
        });
    }

    /**
     * Replace an award's components by hand.
     *
     * Marks the award edited_by_hand, which is what stops a later recomputation
     * from quietly overwriting an amount a person agreed. The old components are
     * kept in the audit entry rather than in a history table — there is no
     * versioning of awards, so the trail is the only record of what changed.
     *
     * @param  array<int, array<string, mixed>>  $components
     */
    public function editComponents(Award $award, array $components, string $reason, string $actor): Award
    {
        return DB::transaction(function () use ($award, $components, $reason, $actor) {
            $before = $award->components()->get()
                ->map(fn ($component) => $component->only([
                    'fee_head', 'entitlement_kind', 'entitlement_value', 'entitlement',
                    'applied', 'is_overridden', 'override_reason', 'override_authority',
                ]))
                ->all();

            $award->components()->delete();

            foreach ($components as $component) {
                $award->components()->create($component);
            }

            $award->update([
                'edited_by_hand' => true,
                'edit_reason' => $reason,
            ]);

            $this->audit->record(
                entityType: 'Award',
                entityId: $award->id,
                action: 'Edited award components by hand',
                actor: $actor,
                reason: $reason,
                oldValue: ['components' => $before],
                newValue: ['components' => $components],
            );

            return $award->fresh(['components']);
        });
    }
}
