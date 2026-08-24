<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * A commitment, and the schedule it will arrive on.
 *
 * Mirrors Pledge in src/lib/scholarship/types.ts.
 *
 * totalAmount sits beside the instalments rather than being derived from them,
 * because it is what the donor signed. A schedule that does not sum to it is a
 * data error worth being able to detect, not a disagreement to hide by
 * computing one from the other.
 */
final readonly class Pledge
{
    public const STATUS_ACTIVE = 'Active';

    public const STATUS_COMPLETED = 'Completed';

    public const STATUS_CANCELLED = 'Cancelled';

    public function __construct(
        public string $id,
        public string $donorId,
        public float $totalAmount,
        public int $termYears,
        /** YYYY-MM-DD */
        public string $startsOn,
        /** YYYY-MM-DD */
        public string $endsOn,
        public int $renewalNoticeDays,
        /** Active | Completed | Cancelled */
        public string $status,
        /** @var PledgeInstalment[] */
        public array $instalments = [],
        public ?string $scholarshipId = null,
        public ?string $reference = null,
        public ?string $notes = null,
    ) {}

    /**
     * A cancelled pledge is not money anyone is waiting for.
     *
     * Completed is deliberately not counted either: it means every instalment
     * arrived, so anything still outstanding on it would be a contradiction the
     * receivables figure should not paper over.
     */
    public function isOutstanding(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    /** The sum of the schedule, which should equal totalAmount. */
    public function scheduledAmount(): float
    {
        $total = 0.0;

        foreach ($this->instalments as $instalment) {
            $total += $instalment->amount;
        }

        return $total;
    }
}
