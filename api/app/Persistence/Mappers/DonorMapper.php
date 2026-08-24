<?php

declare(strict_types=1);

namespace App\Persistence\Mappers;

use App\Domain\Data\Donor;
use App\Models\Donor as DonorRecord;

/**
 * A donor row, as the domain wants it.
 *
 * The donor's pledges and receipts are deliberately not folded in here. A screen
 * listing forty donors wants their rollups, not forty full histories, and a
 * mapper that always carried everything would make the cheap read impossible.
 * PledgeMapper and DonationMapper are called alongside when the caller needs
 * them.
 */
final class DonorMapper
{
    public static function toDomain(DonorRecord $record): Donor
    {
        return new Donor(
            id: $record->id,
            name: $record->name,
            kind: $record->kind,
            status: $record->status,
            contactName: $record->contact_name,
            contactEmail: $record->contact_email,
            contactPhone: $record->contact_phone,
            notes: $record->notes,
        );
    }

    /**
     * @param  iterable<DonorRecord>  $records
     * @return Donor[]
     */
    public static function toDomainList(iterable $records): array
    {
        $donors = [];

        foreach ($records as $record) {
            $donors[] = self::toDomain($record);
        }

        return $donors;
    }
}
