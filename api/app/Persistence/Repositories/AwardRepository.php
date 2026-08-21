<?php

declare(strict_types=1);

namespace App\Persistence\Repositories;

use App\Domain\Data\Award;
use App\Models\Award as AwardRecord;
use App\Persistence\ChunkedIn;
use App\Persistence\Mappers\AwardMapper;

/**
 * Awards, loaded with their components.
 *
 * activeForStudents is the one that matters. Computing coverage for a cohort
 * needs every active award for every student in it, and the obvious shape —
 * ask per student inside the loop — is the N+1 AGENTS.md warns about becoming a
 * dashboard disaster at 5,000 students. So it is one query, grouped in PHP.
 */
final class AwardRepository
{
    /** @return Award[] */
    public function activeForStudent(string $regNo): array
    {
        return AwardMapper::toDomainList(
            AwardRecord::query()
                ->with('components')
                ->active()
                ->where('student_reg_no', $regNo)
                ->get()
        );
    }

    /**
     * Every active award for a set of students, grouped by registration number.
     *
     * Students with no awards are present with an empty array rather than
     * absent, so a caller can index the result without checking first — the
     * difference between "no awards" and "not asked about" is the caller's to
     * know, and they already do.
     *
     * @param  string[]  $regNos
     * @return array<string, Award[]>
     */
    public function activeForStudents(array $regNos): array
    {
        $grouped = array_fill_keys($regNos, []);

        $query = AwardRecord::query()->with('components')->active();

        ChunkedIn::apply($query, 'student_reg_no', $regNos);

        foreach ($query->get() as $record) {
            $grouped[$record->student_reg_no][] = AwardMapper::toDomain($record);
        }

        return $grouped;
    }

    /** @return Award[] */
    public function activeForScholarship(string $scholarshipId): array
    {
        return AwardMapper::toDomainList(
            AwardRecord::query()
                ->with('components')
                ->active()
                ->where('scholarship_id', $scholarshipId)
                ->get()
        );
    }

    /**
     * Every active award, for the institution-wide counts.
     *
     * @return Award[]
     */
    public function allActive(): array
    {
        return AwardMapper::toDomainList(
            AwardRecord::query()->with('components')->active()->get()
        );
    }
}
