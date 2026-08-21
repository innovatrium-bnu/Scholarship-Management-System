<?php

declare(strict_types=1);

namespace App\Domain\Data;

/** What the student declares about the household paying their fee. */
final readonly class HouseholdInfo
{
    public function __construct(
        public float $monthlyIncome,
        public int $earningMembers,
        public int $dependants,
        public int $siblingsAtBNU,
        public string $guardianOccupation,
        /** Employed | Self-employed | Retired | Unemployed | Deceased */
        public string $guardianStatus,
        /** Owned | Rented | Family owned */
        public string $residence,
        public float $monthlyRent,
        public bool $ownsVehicle,
    ) {}
}
