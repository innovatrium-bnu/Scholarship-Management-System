<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * What a donor has promised, sent, and had spent.
 *
 * Mirrors DonorFunding in src/lib/scholarship/types.ts. Computed by
 * FundService, never stored.
 *
 * These are the three states the requirement asks to filter by — Pledged,
 * Received (unassigned), Received (assigned) — and they are amounts rather than
 * row statuses, because one receipt can be part allocated. That is precisely
 * why they are derived: a status column on a donation would have to be
 * maintained by every allocation and could only ever describe the whole row.
 */
final readonly class DonorFunding
{
    public function __construct(
        public string $donorId,
        /** Committed and not yet received. */
        public float $receivable,
        /** Received, whatever has since happened to it. */
        public float $received,
        /** Received and assigned to an award. */
        public float $assigned,
        /** Received and not yet assigned. */
        public float $unassigned,
        /** The part of `receivable` whose due date has already passed. */
        public float $overdue,
    ) {}
}
