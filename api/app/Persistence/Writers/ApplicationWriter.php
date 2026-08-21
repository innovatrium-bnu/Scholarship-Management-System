<?php

declare(strict_types=1);

namespace App\Persistence\Writers;

use App\Domain\Data\DomainEvent;
use App\Models\ApplicationDecision;
use App\Models\Award;
use App\Models\NeedApplication;
use App\Persistence\DomainDate;
use App\Persistence\Repositories\DomainEventRepository;
use Illuminate\Support\Facades\DB;

/**
 * Decides a need-based application, and grants the award when it is approved.
 *
 * A port of decideApplication, reopenApplication and rejectApplications in
 * store.tsx.
 *
 * Approving creates the award in the same transaction. AGENTS.md calls this out
 * as one of the things that must stay atomic once there is a database:
 * approving an application creates its award in the same state update, and that
 * has to stay atomic in SQL too, or a student ends up approved but holding
 * nothing.
 */
final class ApplicationWriter
{
    /** The actor recorded when the filter decided rather than a person. */
    private const FILTER = 'Eligibility filter';

    public function __construct(
        private readonly AuditWriter $audit,
        private readonly DomainEventRepository $events,
    ) {}

    public function decide(
        NeedApplication $application,
        string $outcome,
        string $reason,
        string $role,
        ?float $awardedPct = null,
        bool $automatic = false,
    ): ApplicationDecision {
        return DB::transaction(function () use ($application, $outcome, $reason, $role, $awardedPct, $automatic) {
            $at = now();
            $actor = $automatic ? self::FILTER : $role;

            $award = null;

            if ($outcome === 'Approved') {
                $pct = $awardedPct ?? $application->requested_pct;
                $effectiveFrom = $at->format('Y-m-d');

                $award = Award::create([
                    'student_reg_no' => $application->student_reg_no,
                    'scholarship_id' => $application->scholarship_id,
                    'status' => 'Active',
                    'effective_from' => $effectiveFrom,
                    'authorised_by' => $role,
                    'reason_code' => 'Application '.$application->id,
                ]);

                /*
                 * A need award is always tuition, as a percentage.
                 *
                 * applied is 0 here on purpose, and is not a placeholder for a
                 * missing calculation: what a component actually pays is
                 * decided by the merge against every other award the student
                 * holds, and that answer changes when precedence is reordered
                 * or another scholarship is granted. store.tsx writes 0 for the
                 * same reason.
                 */
                $award->components()->create([
                    'fee_head' => 'Tuition',
                    'entitlement_kind' => 'Percentage',
                    'entitlement_value' => $pct,
                    'entitlement' => $pct,
                    'applied' => 0,
                    'is_overridden' => false,
                ]);

                $this->events->record(new DomainEvent(
                    kind: 'award.granted',
                    at: DomainDate::timestamp($at),
                    actor: $actor,
                    awardId: $award->id,
                    studentRegNo: $award->student_reg_no,
                    scholarshipId: $award->scholarship_id,
                    effectiveFrom: $effectiveFrom,
                    semester: DomainDate::semesterOf($effectiveFrom),
                ));
            }

            $decision = ApplicationDecision::create([
                'application_id' => $application->id,
                'outcome' => $outcome,
                'decided_by' => $actor,
                'role' => $role,
                'at' => $at,
                'reason' => $reason,
                'automatic' => $automatic,
                // Only meaningful on approval; a rejection carries no share.
                'awarded_pct' => $outcome === 'Approved'
                    ? ($awardedPct ?? $application->requested_pct)
                    : null,
                'award_id' => $award?->id,
            ]);

            $application->update(['status' => $outcome]);

            $this->events->record(new DomainEvent(
                kind: 'application.decided',
                at: DomainDate::timestamp($at),
                actor: $actor,
                studentRegNo: $application->student_reg_no,
                semester: $application->semester,
                applicationId: $application->id,
                outcome: $outcome,
                automatic: $automatic,
            ));

            $this->audit->record(
                entityType: 'Application',
                entityId: $application->id,
                action: 'Application '.mb_strtolower($outcome),
                actor: $actor,
                reason: $reason,
                at: $at,
            );

            return $decision;
        });
    }

    /**
     * Put a decided application back in the queue.
     *
     * The decision row is deleted rather than kept alongside a new one: the
     * table holds at most one decision per application by unique constraint,
     * and an application in the queue is one with no decision at all. The audit
     * entry is what remembers that a decision was taken and undone.
     */
    public function reopen(NeedApplication $application, string $reason, string $actor): void
    {
        DB::transaction(function () use ($application, $reason, $actor) {
            $previous = $application->decision;

            $previous?->delete();
            $application->update(['status' => 'Submitted']);

            $this->audit->record(
                entityType: 'Application',
                entityId: $application->id,
                action: 'Reopened application',
                actor: $actor,
                reason: $reason,
                oldValue: $previous === null ? null : [
                    'outcome' => $previous->outcome,
                    'by' => $previous->decided_by,
                    'reason' => $previous->reason,
                ],
            );
        });
    }

    /**
     * Reject several applications at once, as one act.
     *
     * The committee rejects a screened batch in one sitting, and the summary is
     * what explains the sitting. Each application still gets its own decision
     * row and its own reason, because a bulk action is not a bulk record.
     *
     * @param  array<int, array{id: string, reason: string}>  $entries
     */
    public function rejectMany(array $entries, string $summary, string $role): int
    {
        return DB::transaction(function () use ($entries, $summary, $role) {
            $rejected = 0;

            foreach ($entries as $entry) {
                $application = NeedApplication::find($entry['id']);

                if ($application === null) {
                    continue;
                }

                $this->decide($application, 'Rejected', $entry['reason'], $role, automatic: true);
                $rejected++;
            }

            $this->audit->record(
                entityType: 'Application',
                entityId: 'bulk',
                action: 'Rejected '.$rejected.' application'.($rejected === 1 ? '' : 's').' in one pass',
                actor: $role,
                reason: $summary,
            );

            return $rejected;
        });
    }
}
