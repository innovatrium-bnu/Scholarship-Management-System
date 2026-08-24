<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * Where the money comes from.
 *
 * Mirrors Donor in src/lib/scholarship/types.ts.
 *
 * The pledges and donations hanging off a donor are not fields here. They are
 * loaded and passed alongside, because a screen listing forty donors needs
 * their rollups and not their full histories, and a value object that always
 * carries everything makes the cheap read impossible.
 */
final readonly class Donor
{
    public const STATUS_ACTIVE = 'Active';

    public const STATUS_ARCHIVED = 'Archived';

    public function __construct(
        public string $id,
        public string $name,
        /** Organisation | Individual | Trust | Government */
        public string $kind,
        /** Active | Archived */
        public string $status,
        public ?string $contactName = null,
        public ?string $contactEmail = null,
        public ?string $contactPhone = null,
        public ?string $notes = null,
    ) {}

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }
}
