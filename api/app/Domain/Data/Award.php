<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * A scholarship granted to a student.
 *
 * Mirrors Award in src/lib/scholarship/types.ts, minus the nested Revocation:
 * nothing in the ported domain logic reads it. MergeService only ever sees
 * active awards, and the counting in ReportService reads the event log rather
 * than this — because an award can end without surviving as a row at all when
 * a batch is undone.
 */
final readonly class Award
{
    public const STATUS_ACTIVE = 'Active';

    public const STATUS_REVOKED = 'Revoked';

    public function __construct(
        public string $id,
        public string $studentRegNo,
        public string $scholarshipId,
        /** Active | Revoked */
        public string $status,
        /** @var AwardComponent[] */
        public array $components,
        public string $effectiveFrom,
        public string $authorisedBy,
        public string $reasonCode,
        public ?string $batchId = null,
        public bool $editedByHand = false,
        public ?string $editReason = null,
    ) {}

    public function componentFor(string $feeHead): ?AwardComponent
    {
        foreach ($this->components as $component) {
            if ($component->feeHead === $feeHead) {
                return $component;
            }
        }

        return null;
    }
}
