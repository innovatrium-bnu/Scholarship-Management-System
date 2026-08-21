<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * The result of the automatic first pass over one application.
 *
 * Mirrors Screening, CriterionCheck and ScreeningContext in
 * src/lib/scholarship/screening.ts.
 *
 * The split between blockers and flags is the point of the whole exercise: a
 * blocker is a failure nobody needs to weigh, a flag is one somebody does. A
 * verdict of "Fails criteria" is still only a verdict — rejecting on it stays
 * an explicit action a person takes.
 */
final readonly class Screening
{
    public const MEETS = 'Meets criteria';

    public const NEEDS_LOOK = 'Needs a closer look';

    public const FAILS = 'Fails criteria';

    public function __construct(
        /** Meets criteria | Needs a closer look | Fails criteria */
        public string $verdict,
        /** @var CriterionCheck[] Every criterion, passed or not. */
        public array $checks,
        /** @var CriterionCheck[] Failed criteria that reject on their own. */
        public array $blockers,
        /** @var CriterionCheck[] Failed criteria that only warrant a closer look. */
        public array $flags,
        /** The sentence an automatic rejection would be recorded with. */
        public string $rejectionReason,
    ) {}

    public function checkFor(string $criterionId): ?CriterionCheck
    {
        foreach ($this->checks as $check) {
            if ($check->id === $criterionId) {
                return $check;
            }
        }

        return null;
    }
}
