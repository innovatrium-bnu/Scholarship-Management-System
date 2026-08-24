<?php

declare(strict_types=1);

namespace App\Persistence\Mappers;

use App\Domain\Data\Pledge;
use App\Domain\Data\PledgeInstalment;
use App\Models\Pledge as PledgeRecord;
use App\Models\PledgeInstalment as InstalmentRecord;
use App\Persistence\DomainDate;

/**
 * A pledge and its schedule.
 *
 * The instalments come with it because nothing asks about a pledge without
 * asking what is still owed on it, and that is a per-instalment question. This
 * mapper reads the relation and never loads it — the repository eager-loads, or
 * a list of forty pledges is forty extra queries.
 */
final class PledgeMapper
{
    public static function toDomain(PledgeRecord $record): Pledge
    {
        return new Pledge(
            id: $record->id,
            donorId: $record->donor_id,
            totalAmount: $record->total_amount,
            termYears: $record->term_years,
            startsOn: DomainDate::date($record->starts_on),
            endsOn: DomainDate::date($record->ends_on),
            renewalNoticeDays: $record->renewal_notice_days,
            status: $record->status,
            instalments: array_map(self::instalment(...), $record->instalments->all()),
            scholarshipId: $record->scholarship_id,
            reference: $record->reference,
            notes: $record->notes,
        );
    }

    /**
     * @param  iterable<PledgeRecord>  $records
     * @return Pledge[]
     */
    public static function toDomainList(iterable $records): array
    {
        $pledges = [];

        foreach ($records as $record) {
            $pledges[] = self::toDomain($record);
        }

        return $pledges;
    }

    private static function instalment(InstalmentRecord $record): PledgeInstalment
    {
        return new PledgeInstalment(
            id: $record->id,
            sequence: $record->sequence,
            amount: $record->amount,

            // Through DomainDate, not ->format(). Instalment due dates are
            // compared with strcmp to decide what is overdue, and that only
            // works because every date in the domain has one shape.
            dueOn: DomainDate::date($record->due_on),
        );
    }
}
