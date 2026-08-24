<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * Received money assigned to one award.
 *
 * Mirrors FundAllocation in src/lib/scholarship/types.ts.
 *
 * The link is to an award rather than to a student directly. The award already
 * names the student, the scholarship, the amount and the term, so one hop gives
 * both the sponsorship map the requirement asks for and the provenance behind
 * it, and donor money reconciles against fee relief that demonstrably exists.
 */
final readonly class FundAllocation
{
    public const STATUS_ACTIVE = 'Active';

    public const STATUS_RELEASED = 'Released';

    public function __construct(
        public string $id,
        public string $donationId,
        public string $awardId,
        public float $amount,
        /** YYYY-MM-DD */
        public string $allocatedOn,
        public string $allocatedBy,
        public string $reason,
        /** Active | Released */
        public string $status,
        public ?string $releasedAt = null,
        public ?string $releasedBy = null,
        public ?string $releaseReason = null,

        /*
         * Who the award paid for, carried on the allocation rather than looked
         * up from it.
         *
         * The donor page used to resolve the award out of the client's award
         * list, and that list is active-only — every read in AwardRepository is
         * scoped to Active, because the merge only ever sees live awards. So the
         * moment an award was revoked its allocation lost the student's name,
         * the reg no and the scholarship, and rendered "Unknown". The money was
         * still assigned and the screen could no longer say who it paid for.
         *
         * Nullable because an allocation is only ever written against an award
         * that exists, but a reader may not have loaded it.
         */
        public ?string $studentRegNo = null,
        public ?string $scholarshipId = null,
        /** Active | Revoked -- the award's status, not this allocation's. */
        public ?string $awardStatus = null,
    ) {}

    /**
     * Only an active allocation spends money.
     *
     * A released one is history and must not be summed, or the same rupees look
     * spent twice and the unassigned balance is understated — which would show
     * as money the university cannot find.
     */
    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }
}
