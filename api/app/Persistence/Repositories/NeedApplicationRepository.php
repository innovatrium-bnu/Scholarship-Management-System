<?php

declare(strict_types=1);

namespace App\Persistence\Repositories;

use App\Domain\Data\NeedApplication;
use App\Models\NeedApplication as ApplicationRecord;
use App\Persistence\Mappers\NeedApplicationMapper;

/**
 * Need-based applications, with the two things a review needs alongside them.
 *
 * documents and decision are always eager-loaded. The mapper reads both, and a
 * missing decision is meaningful rather than absent data — an application with
 * no decision row is still in the queue.
 */
final class NeedApplicationRepository
{
    /** @return NeedApplication[] */
    public function all(): array
    {
        return NeedApplicationMapper::toDomainList(
            ApplicationRecord::query()->with(['documents', 'decision'])->get()
        );
    }

    public function find(string $id): ?NeedApplication
    {
        $record = ApplicationRecord::query()->with(['documents', 'decision'])->find($id);

        return $record === null ? null : NeedApplicationMapper::toDomain($record);
    }

    /** @return NeedApplication[] */
    public function forScholarship(string $scholarshipId): array
    {
        return NeedApplicationMapper::toDomainList(
            ApplicationRecord::query()
                ->with(['documents', 'decision'])
                ->where('scholarship_id', $scholarshipId)
                ->get()
        );
    }
}
