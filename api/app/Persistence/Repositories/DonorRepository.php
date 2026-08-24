<?php

declare(strict_types=1);

namespace App\Persistence\Repositories;

use App\Domain\Data\Donation;
use App\Domain\Data\Donor;
use App\Domain\Data\Pledge;
use App\Models\Donation as DonationRecord;
use App\Models\Donor as DonorRecord;
use App\Models\FundAllocation as AllocationRecord;
use App\Models\Pledge as PledgeRecord;
use App\Persistence\ChunkedIn;
use App\Persistence\Mappers\DonationMapper;
use App\Persistence\Mappers\DonorMapper;
use App\Persistence\Mappers\PledgeMapper;

/**
 * Donors, their pledges and their receipts, as domain objects.
 *
 * Three collections rather than one nested graph, and that is the shape the
 * whole module is served in. Every fund figure is a fold over pledges and
 * receipts together, so FundService takes them as separate arrays; nesting them
 * under a donor here would mean unpicking them again at every call site.
 *
 * Reads are whole-collection, matching how awards and events are already
 * served. At a few hundred rows that is one query rather than one per donor,
 * and the alternative — a per-donor endpoint — is the N+1 this layer exists to
 * make impossible.
 */
final class DonorRepository
{
    /** @return Donor[] ordered by name, which is how every screen lists them */
    public function all(): array
    {
        return DonorMapper::toDomainList(
            DonorRecord::query()->orderBy('name')->get()
        );
    }

    /** @return Donor[] */
    public function active(): array
    {
        return DonorMapper::toDomainList(
            DonorRecord::query()->active()->orderBy('name')->get()
        );
    }

    public function find(string $id): ?Donor
    {
        $record = DonorRecord::query()->find($id);

        return $record === null ? null : DonorMapper::toDomain($record);
    }

    /**
     * Every pledge, with its schedule.
     *
     * Eager-loads instalments because PledgeMapper reads them, and a mapper
     * that lazy-loads is an N+1 waiting for a list.
     *
     * @return Pledge[]
     */
    public function pledges(): array
    {
        return PledgeMapper::toDomainList(
            PledgeRecord::query()->with('instalments')->orderBy('ends_on')->get()
        );
    }

    /**
     * @param  list<string>  $donorIds
     * @return Pledge[]
     */
    public function pledgesForDonors(array $donorIds): array
    {
        $query = PledgeRecord::query()->with('instalments');

        // Through ChunkedIn like every other list of ids in this layer: Oracle
        // raises ORA-01795 past 1000 expressions in an IN list.
        ChunkedIn::apply($query, 'donor_id', $donorIds);

        return PledgeMapper::toDomainList($query->orderBy('ends_on')->get());
    }

    /**
     * Every receipt, with what it has been spent on.
     *
     * @return Donation[]
     */
    public function donations(): array
    {
        return DonationMapper::toDomainList(
            DonationRecord::query()->with('allocations.award')->orderByDesc('received_on')->get()
        );
    }

    /**
     * @param  list<string>  $donorIds
     * @return Donation[]
     */
    public function donationsForDonors(array $donorIds): array
    {
        $query = DonationRecord::query()->with('allocations.award');

        ChunkedIn::apply($query, 'donor_id', $donorIds);

        return DonationMapper::toDomainList($query->orderByDesc('received_on')->get());
    }

    /**
     * Everything one donor's page needs, in three queries.
     *
     * @return array{donor: ?Donor, pledges: Pledge[], donations: Donation[]}
     */
    public function profile(string $donorId): array
    {
        return [
            'donor' => $this->find($donorId),
            'pledges' => $this->pledgesForDonors([$donorId]),
            'donations' => $this->donationsForDonors([$donorId]),
        ];
    }

    /**
     * Active allocations against a set of awards, keyed by award.
     *
     * The one read that goes the other way — from awards to donor money. Both
     * callers need it before they touch anything: the assignment writer, which
     * must refuse to undo a batch whose awards carry donor money, and the
     * revoke screen, which warns before ending a funded award.
     *
     * @param  list<string>  $awardIds
     * @return array<string, float> award id => total still allocated
     */
    public function allocatedByAward(array $awardIds): array
    {
        if ($awardIds === []) {
            return [];
        }

        $query = AllocationRecord::query()->active();

        ChunkedIn::apply($query, 'award_id', $awardIds);

        $totals = [];

        foreach ($query->get(['award_id', 'amount']) as $allocation) {
            $awardId = $allocation->award_id;
            $totals[$awardId] = ($totals[$awardId] ?? 0.0) + $allocation->amount;
        }

        return $totals;
    }
}
