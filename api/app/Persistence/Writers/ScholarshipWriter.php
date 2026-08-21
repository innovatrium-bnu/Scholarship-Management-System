<?php

declare(strict_types=1);

namespace App\Persistence\Writers;

use App\Domain\Data\DomainEvent;
use App\Models\Revocation;
use App\Models\Scholarship;
use App\Persistence\DomainDate;
use App\Persistence\Repositories\DomainEventRepository;
use Illuminate\Support\Facades\DB;

/**
 * Retires a scholarship, brings it back, and reorders precedence.
 *
 * A port of archiveScholarship, restoreScholarship and reorderScholarships in
 * store.tsx. Nothing here deletes: archiving is reversible, because an awarded
 * scholarship is part of a student record and a scholarship retired by mistake
 * has to go straight back with its history intact.
 */
final class ScholarshipWriter
{
    public function __construct(
        private readonly AuditWriter $audit,
        private readonly DomainEventRepository $events,
    ) {}

    /**
     * Archive a scholarship, optionally ending the awards that hang off it.
     *
     * The per-award records are the point. store.tsx notes that archiving used
     * to end dozens of awards behind a single scholarship-level audit line and
     * nothing against any student, so somebody could lose their funding with no
     * record under their own name. Every ending gets its own revocation row and
     * its own event.
     */
    public function archive(Scholarship $scholarship, bool $endExisting, string $semester, string $actor): int
    {
        return DB::transaction(function () use ($scholarship, $endExisting, $semester, $actor) {
            $at = now();

            $scholarship->update(['status' => 'Archived']);

            $ending = $endExisting
                ? $scholarship->awards()->active()->get()
                : collect();

            $effectiveFrom = DomainDate::looksLikeDate($semester)
                ? substr($semester, 0, 10)
                : DomainDate::dateOfSemester($semester);
            $term = DomainDate::looksLikeDate($semester)
                ? DomainDate::semesterOf($semester)
                : $semester;

            $reason = $scholarship->name.' was retired, and existing awards were ended from '.$semester.'.';

            foreach ($ending as $award) {
                Revocation::create([
                    'award_id' => $award->id,
                    'at' => $at,
                    'effective_from' => $effectiveFrom,
                    'semester' => $term,
                    'timing' => 'next',
                    'cause' => 'Scholarship archived',
                    'reason' => $reason,
                    'revoked_by' => $actor,
                ]);

                $award->update(['status' => 'Revoked']);

                $this->events->record(new DomainEvent(
                    kind: 'award.revoked',
                    at: DomainDate::timestamp($at),
                    actor: $actor,
                    awardId: $award->id,
                    studentRegNo: $award->student_reg_no,
                    scholarshipId: $scholarship->id,
                    effectiveFrom: $effectiveFrom,
                    semester: $term,
                    timing: 'next',
                    cause: 'Scholarship archived',
                    reason: $reason,
                ));
            }

            $count = $ending->count();

            $this->audit->record(
                entityType: 'Scholarship',
                entityId: $scholarship->id,
                action: $endExisting
                    ? 'Archived and ended '.$count.' award'.($count === 1 ? '' : 's').' from '.$semester
                    : 'Archived (no new awards)',
                actor: $actor,
                at: $at,
            );

            return $count;
        });
    }

    /**
     * Rewrite precedence to the given order.
     *
     * This is the operation the schema's deferrable constraint exists for.
     * Precedence is UNIQUE, and any order of UPDATEs passes through a state
     * where two rows briefly share a value — a plain unique index rejects that
     * halfway through. The constraint is DEFERRABLE INITIALLY DEFERRED, so
     * Oracle checks it once at COMMIT instead, and the reorder is free to be
     * messy inside its transaction while still being correct to anyone reading.
     *
     * Which makes the transaction load-bearing rather than merely tidy: run
     * these updates outside one and the deferral has no commit to wait for.
     *
     * Ids the caller omitted keep their relative order and go on the end. The
     * frontend always sends the full list, so that is a safety net rather than
     * a feature — but silently dropping a scholarship out of the ordering would
     * leave a row with a precedence nothing else can be compared against.
     *
     * @param  string[]  $orderedIds
     */
    public function reorder(array $orderedIds, string $actor): void
    {
        DB::transaction(function () use ($orderedIds, $actor) {
            $all = Scholarship::query()->inPrecedenceOrder()->get();

            $ordered = [];

            foreach ($orderedIds as $id) {
                $match = $all->firstWhere('id', $id);

                if ($match !== null) {
                    $ordered[] = $match;
                }
            }

            foreach ($all as $scholarship) {
                if (! in_array($scholarship->id, $orderedIds, true)) {
                    $ordered[] = $scholarship;
                }
            }

            foreach ($ordered as $position => $scholarship) {
                $scholarship->update(['precedence' => $position]);
            }

            $this->audit->record(
                entityType: 'Scholarship',
                entityId: 'precedence',
                action: 'Reordered scholarship precedence',
                actor: $actor,
                newValue: ['order' => array_map(fn ($s) => $s->id, $ordered)],
            );
        });
    }

    public function restore(Scholarship $scholarship, string $reason, string $actor): void
    {
        DB::transaction(function () use ($scholarship, $reason, $actor) {
            $scholarship->update(['status' => 'Active']);

            // Awards ended by the archive are deliberately not un-revoked. They
            // were ended on a date and a term, and reviving them silently would
            // reinstate money nobody re-approved.
            $this->audit->record(
                entityType: 'Scholarship',
                entityId: $scholarship->id,
                action: 'Restored from archive',
                actor: $actor,
                reason: $reason,
            );
        });
    }
}
