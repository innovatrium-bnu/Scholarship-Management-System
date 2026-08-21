<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * A student, as the domain logic sees one.
 *
 * Mirrors the Student interface in src/lib/scholarship/types.ts field for
 * field. It is a plain value object, not an Eloquent model, for the same
 * reason the TypeScript original is a plain interface: merge, evaluate and
 * screen are pure functions, and a function that takes a value cannot
 * accidentally issue a query, lazy-load a relation, or depend on a database
 * being there at all.
 *
 * Money and percentages are floats rather than decimals. That is deliberate:
 * every number in TypeScript is an IEEE-754 double, PHP floats are the same
 * doubles, and the whole point of this port is to reproduce the TypeScript
 * results exactly. Using BCMath here would produce arithmetic that is arguably
 * more correct and demonstrably different, which is the one outcome that
 * cannot be allowed — the browser still runs the TypeScript copy to draw the
 * coverage bars a registrar reads. Storage is a separate question, and the
 * columns are decimal there.
 */
final readonly class Student
{
    public function __construct(
        public string $regNo,
        public string $name,
        public string $school,
        public string $programme,
        /** Bachelors | Masters */
        public string $studyLevel,
        public string $batch,
        public float $cgpa,
        public int $creditHours,
        public string $domicile,
        public bool $isOutOfStation,
        public float $tuitionFee,
        public float $hostelFee,
        public float $messFee,
        public float $otherFee,
        public string $province,
        public string $city,
        public string $district,
        public bool $financialNeedVerified,
        public bool $personalStatementOk,
        public bool $hasSportsMedal,
        public bool $bfitMember,
        public string $quota,
        /** Male | Female | Other */
        public string $gender,
        public string $dateOfBirth,
        public string $fatherName,
        public string $email,
        public string $phone,
        public float $attendancePct,
        public string $admissionDate,
        /** Enrolled | On leave | Graduated | Withdrawn */
        public string $enrollmentStatus,
        public int $currentSemester,
        public int $creditsEarned,
        public ?string $photoUrl = null,
    ) {}

    /**
     * Read one of the manual verification flags by name.
     *
     * evaluate() resolves a rule description to a field name and then reads it
     * dynamically — `s[ml.field]` in TypeScript. PHP has no equivalent that is
     * safe on a readonly class with arbitrary input, so the four flags that can
     * actually be addressed this way are listed explicitly.
     */
    public function flag(string $field): bool
    {
        return match ($field) {
            'financialNeedVerified' => $this->financialNeedVerified,
            'personalStatementOk' => $this->personalStatementOk,
            'hasSportsMedal' => $this->hasSportsMedal,
            'bfitMember' => $this->bfitMember,
            default => throw new \InvalidArgumentException("Not a verification flag: $field"),
        };
    }
}
