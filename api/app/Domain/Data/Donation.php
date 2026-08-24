<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * Money that actually arrived.
 *
 * Mirrors Donation in src/lib/scholarship/types.ts.
 *
 * Its allocations are carried, unlike a donor's pledges, because every question
 * asked of a donation needs them: what is left of it, and who it paid for. The
 * two cannot be answered from the receipt alone.
 */
final readonly class Donation
{
    public function __construct(
        public string $id,
        public string $donorId,
        public float $amount,
        /** YYYY-MM-DD */
        public string $receivedOn,
        /** Bank transfer | Cheque | Cash | Online */
        public string $method,
        public string $recordedBy,
        /** @var FundAllocation[] */
        public array $allocations = [],
        public ?string $pledgeId = null,
        public ?string $instalmentId = null,
        public ?string $reference = null,
        public ?string $notes = null,
    ) {}

    /** What this receipt has been spent on, releases excluded. */
    public function assigned(): float
    {
        $total = 0.0;

        foreach ($this->allocations as $allocation) {
            if ($allocation->isActive()) {
                $total += $allocation->amount;
            }
        }

        return $total;
    }

    /**
     * What is left of this receipt.
     *
     * Floored at zero rather than allowed to go negative. Over-allocation is
     * refused at the point of writing, so a negative here would mean the guard
     * had already failed — and a negative unassigned figure would then subtract
     * from the total across every other donation, hiding the fault instead of
     * showing it.
     */
    public function unassigned(): float
    {
        return max(0.0, $this->amount - $this->assigned());
    }
}
