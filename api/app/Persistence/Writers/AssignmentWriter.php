<?php

declare(strict_types=1);

namespace App\Persistence\Writers;

use App\Domain\Data\DomainEvent;
use App\Models\AssignmentBatch;
use App\Models\Award;
use App\Models\FundAllocation;
use App\Models\Scholarship;
use App\Persistence\DomainDate;
use App\Persistence\Repositories\DomainEventRepository;
use Illuminate\Support\Facades\DB;

/**
 * Grants many awards as one act, and takes them back the same way.
 *
 * A port of assignBatch and undoBatch in store.tsx.
 *
 * The transaction is the point. AGENTS.md lists "batch assign and undo must
 * become a single database transaction" as one of the artefacts of the
 * in-memory store to fix when a backend lands: in React a batch either happened
 * or the state update never ran, and nothing in between was reachable. Against
 * a database, a half-written batch is entirely reachable — awards granted, the
 * batch row missing, and no way to undo what was just done.
 */
final class AssignmentWriter
{
    public function __construct(
        private readonly AuditWriter $audit,
        private readonly DomainEventRepository $events,
    ) {}

    /**
     * Grant one award per pick.
     *
     * Each pick is a student and the components they get, which the caller has
     * already resolved through RatePlanService — per-student and per-fee rates
     * are decided before anything reaches here, so a hand-set rate is stored
     * exactly like a standard one and cannot be treated differently later.
     *
     * @param  array<int, array{
     *     student_reg_no: string,
     *     components: array<int, array<string, mixed>>,
     *     override_authority?: ?string,
     *     override_ref?: ?string
     * }>  $picks
     */
    public function assign(
        Scholarship $scholarship,
        array $picks,
        string $mode,
        string $reason,
        string $actor,
    ): AssignmentBatch {
        return DB::transaction(function () use ($scholarship, $picks, $mode, $reason, $actor) {
            $at = now();
            $effectiveFrom = $at->format('Y-m-d');

            $batch = AssignmentBatch::create([
                'scholarship_id' => $scholarship->id,
                'actor' => $actor,
                'reason' => $reason,
                'assignment_mode' => $mode,
                'undone' => false,
            ]);

            $awardIds = [];
            $events = [];

            foreach ($picks as $pick) {
                $award = Award::create([
                    'student_reg_no' => $pick['student_reg_no'],
                    'scholarship_id' => $scholarship->id,
                    'status' => 'Active',
                    'effective_from' => $effectiveFrom,
                    // store.tsx: an override names its own authority, and the
                    // reason code records the reference it was granted under.
                    'authorised_by' => $pick['override_authority'] ?? 'Registrar Office',
                    'reason_code' => isset($pick['override_ref'])
                        ? 'Override: '.$pick['override_ref']
                        : $reason,
                    'batch_id' => $batch->id,
                ]);

                foreach ($pick['components'] as $component) {
                    $award->components()->create($component);
                }

                $awardIds[] = $award->id;

                $events[] = new DomainEvent(
                    kind: 'award.granted',
                    at: DomainDate::timestamp($at),
                    actor: $actor,
                    awardId: $award->id,
                    studentRegNo: $award->student_reg_no,
                    scholarshipId: $scholarship->id,
                    effectiveFrom: $effectiveFrom,
                    semester: DomainDate::semesterOf($effectiveFrom),
                    batchId: $batch->id,
                );
            }

            $this->events->recordMany($events);

            $count = count($awardIds);

            $this->audit->record(
                entityType: 'Batch',
                entityId: $batch->id,
                action: sprintf(
                    'Assigned %s to %d student%s (%s)',
                    $scholarship->name,
                    $count,
                    $count === 1 ? '' : 's',
                    $mode,
                ),
                actor: $actor,
                reason: $reason,
                newValue: ['awardIds' => $awardIds],
                at: $at,
            );

            return $batch->fresh();
        });
    }

    /**
     * Delete a batch's awards, keeping the batch.
     *
     * The batch row survives marked undone, so the history still shows that an
     * assignment happened and was taken back. This is the only place in the
     * schema that hard-deletes anything, and it is why awards.batch_id is
     * nullOnDelete rather than cascade everywhere else.
     *
     * Returns false when the batch was already undone, so a double undo is a
     * no-op rather than a second set of events describing awards that are long
     * gone.
     */
    /**
     * Donor money assigned to the awards in this batch, in rupees.
     *
     * Undoing a batch deletes its awards outright — the one place this system
     * hard-deletes anything, because an undone mis-click is not part of a
     * student's record. Money that has been assigned is not a mis-click, and
     * `fund_allocations.award_id` is `restrictOnDelete`, so the delete would
     * fail at the database and surface as ORA-02292 from a feature with no
     * visible connection to donors.
     *
     * Checked here so the caller can refuse in plain English instead.
     */
    public function allocatedFunds(AssignmentBatch $batch): float
    {
        return (float) FundAllocation::query()
            ->active()
            ->whereIn('award_id', $batch->awards()->pluck('id'))
            ->sum('amount');
    }

    /**
     * Whether any allocation row at all points at this batch's awards.
     *
     * Separate from `allocatedFunds` because the two answer different
     * questions, and conflating them was a defect. `allocatedFunds` answers
     * "how much donor money is riding on these awards", which only Active
     * allocations do. This answers "will the database let the awards be
     * deleted", and the foreign key does not care about status: a Released
     * allocation is still a child row.
     *
     * So a batch whose allocation had been released passed the money check with
     * zero and then died on ORA-02292 from `$award->delete()` — the exact
     * failure the money check was written to prevent, one status away from it.
     */
    public function hasAllocationHistory(AssignmentBatch $batch): bool
    {
        return FundAllocation::query()
            ->whereIn('award_id', $batch->awards()->pluck('id'))
            ->exists();
    }

    public function undo(AssignmentBatch $batch, string $actor): bool
    {
        if ($batch->undone) {
            return false;
        }

        return DB::transaction(function () use ($batch, $actor) {
            $at = now();
            $awards = $batch->awards()->get();

            $events = [];

            foreach ($awards as $award) {
                $events[] = new DomainEvent(
                    kind: 'award.undone',
                    at: DomainDate::timestamp($at),
                    actor: $actor,
                    awardId: $award->id,
                    studentRegNo: $award->student_reg_no,
                    scholarshipId: $award->scholarship_id,
                    batchId: $batch->id,
                );
            }

            // Recorded before the delete, because the events name awards that
            // will not exist a statement later. The event log is the only thing
            // that will still know they did.
            $this->events->recordMany($events);

            $count = $awards->count();

            foreach ($awards as $award) {
                $award->delete();
            }

            $batch->update(['undone' => true]);

            $this->audit->record(
                entityType: 'Batch',
                entityId: $batch->id,
                action: sprintf('Undid batch, removed %d award%s', $count, $count === 1 ? '' : 's'),
                actor: $actor,
                at: $at,
            );

            return true;
        });
    }
}
