<?php

declare(strict_types=1);

namespace App\Persistence\Mappers;

use App\Domain\Data\Award;
use App\Domain\Data\AwardComponent;
use App\Models\Award as AwardRecord;
use App\Models\AwardComponent as AwardComponentRecord;
use App\Persistence\DomainDate;

/**
 * An award and its components, as the domain wants it.
 *
 * The domain's Award deliberately has no revocation on it: MergeService only
 * ever sees active awards, and ReportService counts from the event log rather
 * than from here, because an award can end without surviving as a row at all
 * when a batch is undone. So the revocation relation is not mapped, and that
 * is not an omission.
 *
 * Expects components to be loaded.
 */
final class AwardMapper
{
    public static function toDomain(AwardRecord $record): Award
    {
        return new Award(
            id: $record->id,
            studentRegNo: $record->student_reg_no,
            scholarshipId: $record->scholarship_id,
            status: $record->status,
            components: array_map(self::component(...), $record->components->all()),
            effectiveFrom: DomainDate::date($record->effective_from),
            authorisedBy: $record->authorised_by,
            reasonCode: $record->reason_code,
            batchId: $record->batch_id,
            editedByHand: $record->edited_by_hand,
            editReason: $record->edit_reason,
        );
    }

    /**
     * @param  iterable<AwardRecord>  $records
     * @return Award[]
     */
    public static function toDomainList(iterable $records): array
    {
        $awards = [];

        foreach ($records as $record) {
            $awards[] = self::toDomain($record);
        }

        return $awards;
    }

    private static function component(AwardComponentRecord $record): AwardComponent
    {
        return new AwardComponent(
            feeHead: $record->fee_head,
            entitlement: $record->entitlement,
            entitlementKind: $record->entitlement_kind,
            entitlementValue: $record->entitlement_value,
            applied: $record->applied,
            isOverridden: $record->is_overridden,
            overrideReason: $record->override_reason,
            overrideAuthority: $record->override_authority,
        );
    }
}
