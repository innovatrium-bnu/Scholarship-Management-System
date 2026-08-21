<?php

declare(strict_types=1);

namespace App\Persistence\Repositories;

use App\Domain\Data\Student;
use App\Models\Student as StudentRecord;
use App\Persistence\ChunkedIn;
use App\Persistence\Mappers\StudentMapper;

/**
 * Students, loaded in bulk.
 *
 * No relations are eager-loaded because the domain's Student has none — it is a
 * flat record of the person, and their awards and applications are loaded
 * separately by the repositories that own them. That keeps the cohort read,
 * which is the large one, as narrow as it can be.
 */
final class StudentRepository
{
    public function find(string $regNo): ?Student
    {
        $record = StudentRecord::query()->find($regNo);

        return $record === null ? null : StudentMapper::toDomain($record);
    }

    /**
     * @param  string[]  $regNos
     * @return Student[]
     */
    public function findMany(array $regNos): array
    {
        $query = StudentRecord::query();

        ChunkedIn::apply($query, 'reg_no', $regNos);

        return StudentMapper::toDomainList($query->get());
    }

    /**
     * The population a cohort-rank rule ranks against.
     *
     * EvaluationService takes this separately from the students being assigned,
     * and the distinction is load-bearing: targeting one student must still rank
     * them against their whole cohort, not against a population of one where
     * everybody is trivially in the top 1%.
     *
     * @return Student[]
     */
    public function enrolled(): array
    {
        return StudentMapper::toDomainList(
            StudentRecord::query()->enrolled()->get()
        );
    }
}
