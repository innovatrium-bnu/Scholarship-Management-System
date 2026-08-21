<?php

declare(strict_types=1);

namespace App\Domain\Data;

/** One criterion's answer, in words a student could read. */
final readonly class CriterionCheck
{
    public const PASS = 'Pass';

    public const FAIL = 'Fail';

    public const NOT_APPLICABLE = 'Not applicable';

    public function __construct(
        /** cgpa|income|creditHours|attendance|documents|existingCoverage|duplicate */
        public string $id,
        public string $label,
        /** Pass | Fail | Not applicable */
        public string $outcome,
        /** A whole sentence, written to be read by a student, not only by staff. */
        public string $detail,
        /** Whether failing this one is enough to turn the application down alone. */
        public bool $autoRejects,
    ) {}
}
