<?php

declare(strict_types=1);

namespace App\Persistence\Mappers;

use App\Domain\Data\Donation;
use App\Domain\Data\FundAllocation;
use App\Models\Donation as DonationRecord;
use App\Models\FundAllocation as AllocationRecord;
use App\Persistence\DomainDate;

/**
 * A receipt and what it has been spent on.
 *
 * Unlike a donor's pledges, the allocations always come along, because both
 * questions asked of a receipt need them: what is left of it, and who it paid
 * for. Neither can be answered from the receipt row alone.
 *
 * Released allocations are mapped too rather than filtered out here. The domain
 * decides what counts — Donation::assigned() skips them — and a mapper that
 * dropped rows would leave the release history unreadable on the donor page.
 *
 * Expects `allocations.award` to be eager-loaded. The award's student and
 * status ride along on the allocation because the award may since have been
 * revoked, and a revoked award is absent from every award list this system
 * serves.
 */
final class DonationMapper
{
    public static function toDomain(DonationRecord $record): Donation
    {
        return new Donation(
            id: $record->id,
            donorId: $record->donor_id,
            amount: $record->amount,
            receivedOn: DomainDate::date($record->received_on),
            method: $record->method,
            recordedBy: $record->recorded_by,
            allocations: array_map(self::allocation(...), $record->allocations->all()),
            pledgeId: $record->pledge_id,
            instalmentId: $record->instalment_id,
            reference: $record->reference,
            notes: $record->notes,
        );
    }

    /**
     * @param  iterable<DonationRecord>  $records
     * @return Donation[]
     */
    public static function toDomainList(iterable $records): array
    {
        $donations = [];

        foreach ($records as $record) {
            $donations[] = self::toDomain($record);
        }

        return $donations;
    }

    private static function allocation(AllocationRecord $record): FundAllocation
    {
        return new FundAllocation(
            id: $record->id,
            donationId: $record->donation_id,
            awardId: $record->award_id,
            amount: $record->amount,
            allocatedOn: DomainDate::date($record->allocated_on),
            allocatedBy: $record->allocated_by,
            reason: $record->reason,
            status: $record->status,
            releasedAt: DomainDate::timestamp($record->released_at),
            releasedBy: $record->released_by,
            releaseReason: $record->release_reason,

            // From the award row itself, not from whatever award list the
            // reader happens to hold. Revoking an award must not erase who the
            // donor's money paid for.
            studentRegNo: $record->award?->student_reg_no,
            scholarshipId: $record->award?->scholarship_id,
            awardStatus: $record->award?->status,
        );
    }
}
