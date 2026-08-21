<?php

declare(strict_types=1);

namespace App\Domain\Support;

/**
 * The two closed sets in a household declaration.
 *
 * Both were validated as ['required', 'string', 'max:255'], so an application
 * could declare a guardian status of "Interdimensional cable repairman" and a
 * residence "On the moon" and be filed. Neither is checked by the screening
 * filter, which is exactly why it matters: nothing downstream would ever
 * complain, and the household declaration is the evidence a need assessment
 * rests on. A committee reading it on appeal has no way to tell a typo from a
 * fact.
 *
 * Kept beside the other closed sets rather than on NeedApplication, because the
 * request layer needs them before any model exists, and ClosedSetTest checks
 * all of these against types.ts in one place.
 */
final class HouseholdOptions
{
    /** @var list<string> HouseholdInfo.guardianStatus in types.ts. */
    public const GUARDIAN_STATUSES = [
        'Employed',
        'Self-employed',
        'Retired',
        'Unemployed',
        'Deceased',
    ];

    /** @var list<string> HouseholdInfo.residence in types.ts. */
    public const RESIDENCE_KINDS = [
        'Owned',
        'Rented',
        'Family owned',
    ];
}
