<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * What happened, when, in a shape code can count.
 *
 * Mirrors DomainEvent in src/lib/scholarship/events.ts, flattened from a
 * discriminated union into one class with a `kind` and nullable fields —
 * exactly the shape of the domain_events table.
 *
 * This sits beside the audit log rather than replacing it, because the two
 * answer different questions. An audit entry answers "who changed this record
 * and why", is scoped to one entity, and is written to be read by a person. An
 * event answers "how many, when, of what kind" across the whole system, and is
 * only ever read by code.
 *
 * Trying to serve both from one record is what produced the bug this exists to
 * fix: revoking an award used to record the term by interpolating it into the
 * sentence "Revoked (immediate, from Fall 2025)", so counting last semester's
 * revocations meant running a regex over English. One copy-edit to that string
 * and the count silently becomes zero forever.
 */
final readonly class DomainEvent
{
    public const AWARD_GRANTED = 'award.granted';

    public const AWARD_REVOKED = 'award.revoked';

    /**
     * A batch assignment was undone. The awards are deleted outright rather
     * than revoked, because an undone mis-click is not part of a student's
     * financial record — but the grant and the undo both stay on this log, so
     * counts still reconcile and the history is not lost.
     */
    public const AWARD_UNDONE = 'award.undone';

    public const APPLICATION_DECIDED = 'application.decided';

    public function __construct(
        public string $kind,
        /** When this was recorded. */
        public string $at,
        /** The role that caused it, or "Eligibility filter" for automatic actions. */
        public string $actor,
        public ?string $awardId = null,
        public ?string $studentRegNo = null,
        public ?string $scholarshipId = null,
        /** When the award starts, or stops, paying. */
        public ?string $effectiveFrom = null,
        /**
         * $effectiveFrom as a semester label, resolved once at write time
         * rather than derived from a date by whoever is asking.
         */
        public ?string $semester = null,
        public ?string $batchId = null,
        /** award.revoked: immediate | next */
        public ?string $timing = null,
        /** award.revoked */
        public ?string $cause = null,
        public ?string $reason = null,
        /** application.decided */
        public ?string $applicationId = null,
        /** application.decided: Approved | Rejected | On hold */
        public ?string $outcome = null,
        /** application.decided: true when the filter decided it, not a person. */
        public ?bool $automatic = null,
    ) {}
}
