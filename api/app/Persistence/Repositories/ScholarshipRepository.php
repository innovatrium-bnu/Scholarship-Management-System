<?php

declare(strict_types=1);

namespace App\Persistence\Repositories;

use App\Domain\Data\EligibilityCriteria;
use App\Domain\Data\Scholarship;
use App\Models\EligibilityCriteria as CriteriaRecord;
use App\Models\Scholarship as ScholarshipRecord;
use App\Persistence\ChunkedIn;
use App\Persistence\Mappers\EligibilityCriteriaMapper;
use App\Persistence\Mappers\ScholarshipMapper;

/**
 * Scholarships, loaded whole and in the order the merge depends on.
 *
 * Every read here eager-loads coverageLines and rules. That is not an
 * optimisation: ScholarshipMapper needs both to build a domain Scholarship, so
 * without it mapping a list of scholarships fires two queries per row.
 *
 * And every list is returned in precedence order. The merge resolves competing
 * claims on a fee head by the order it is handed the scholarships, so a list in
 * any other order does not fail — it silently computes different money.
 */
final class ScholarshipRepository
{
    /** @return Scholarship[] in precedence order */
    public function all(): array
    {
        return ScholarshipMapper::toDomainList(
            ScholarshipRecord::query()
                ->with(['coverageLines', 'rules'])
                ->inPrecedenceOrder()
                ->get()
        );
    }

    /** @return Scholarship[] in precedence order */
    public function active(): array
    {
        return ScholarshipMapper::toDomainList(
            ScholarshipRecord::query()
                ->with(['coverageLines', 'rules'])
                ->active()
                ->inPrecedenceOrder()
                ->get()
        );
    }

    public function find(string $id): ?Scholarship
    {
        $record = ScholarshipRecord::query()
            ->with(['coverageLines', 'rules'])
            ->find($id);

        return $record === null ? null : ScholarshipMapper::toDomain($record);
    }

    /**
     * @param  string[]  $ids
     * @return Scholarship[] in precedence order
     */
    public function findMany(array $ids): array
    {
        $query = ScholarshipRecord::query()->with(['coverageLines', 'rules']);

        ChunkedIn::apply($query, 'id', $ids);

        return ScholarshipMapper::toDomainList($query->orderBy('precedence')->get());
    }

    /**
     * Criteria for many scholarships at once, keyed by scholarship id.
     *
     * Screening a queue needs the criteria for every scholarship represented in
     * it. Asking per application would be an N+1 over a table with one row per
     * scholarship, which is the cheapest possible thing to get wrong.
     *
     * @param  string[]  $scholarshipIds
     * @return array<string, EligibilityCriteria>
     */
    public function criteriaByScholarship(array $scholarshipIds): array
    {
        $query = CriteriaRecord::query()->with('cgpaThresholds');

        ChunkedIn::apply($query, 'scholarship_id', $scholarshipIds);

        $criteria = [];

        foreach ($query->get() as $record) {
            $criteria[$record->scholarship_id] = EligibilityCriteriaMapper::toDomain($record);
        }

        return $criteria;
    }

    public function criteriaFor(string $scholarshipId): ?EligibilityCriteria
    {
        $record = CriteriaRecord::query()
            ->with('cgpaThresholds')
            ->find($scholarshipId);

        return $record === null ? null : EligibilityCriteriaMapper::toDomain($record);
    }
}
