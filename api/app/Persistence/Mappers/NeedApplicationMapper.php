<?php

declare(strict_types=1);

namespace App\Persistence\Mappers;

use App\Domain\Data\ApplicationDecision;
use App\Domain\Data\ApplicationDocument;
use App\Domain\Data\HouseholdInfo;
use App\Domain\Data\NeedApplication;
use App\Models\ApplicationDecision as DecisionRecord;
use App\Models\ApplicationDocument as DocumentRecord;
use App\Models\NeedApplication as ApplicationRecord;
use App\Persistence\DomainDate;

/**
 * A need-based application, as the domain wants it.
 *
 * Expects documents and decision to be loaded. A missing decision is not an
 * error and must not become one: an application with no decision row is still
 * in the queue, which is the whole reason the decision is its own table.
 *
 * The household columns are inlined on the row with a household_ prefix and
 * become a HouseholdInfo here, which is the one place the two shapes differ.
 */
final class NeedApplicationMapper
{
    public static function toDomain(ApplicationRecord $record): NeedApplication
    {
        return new NeedApplication(
            id: $record->id,
            studentRegNo: $record->student_reg_no,
            scholarshipId: $record->scholarship_id,
            semester: $record->semester,
            submittedAt: DomainDate::timestamp($record->submitted_at),
            household: self::household($record),
            statement: $record->statement,
            documents: array_map(self::document(...), $record->documents->all()),
            requestedPct: $record->requested_pct,
            status: $record->status,
            decision: $record->decision === null ? null : self::decision($record->decision),
        );
    }

    /**
     * @param  iterable<ApplicationRecord>  $records
     * @return NeedApplication[]
     */
    public static function toDomainList(iterable $records): array
    {
        $applications = [];

        foreach ($records as $record) {
            $applications[] = self::toDomain($record);
        }

        return $applications;
    }

    private static function household(ApplicationRecord $record): HouseholdInfo
    {
        return new HouseholdInfo(
            monthlyIncome: $record->household_monthly_income,
            earningMembers: $record->household_earning_members,
            dependants: $record->household_dependants,
            siblingsAtBNU: $record->household_siblings_at_bnu,
            guardianOccupation: $record->household_guardian_occupation,
            guardianStatus: $record->household_guardian_status,
            residence: $record->household_residence,
            monthlyRent: $record->household_monthly_rent,
            ownsVehicle: $record->household_owns_vehicle,
        );
    }

    /**
     * uploadedAt is rendered as a date, not a timestamp.
     *
     * The column is a timestamptz and holds a time, but seed.ts — which is the
     * specification this port follows — builds it as submittedAt.slice(0, 10),
     * so the domain's shape is a date. Nothing in the domain parses it; it is
     * metadata a reviewer reads. Phase 8 can still expose the full timestamp
     * from the model in an API resource, which is a separate question from what
     * the domain object carries.
     */
    private static function document(DocumentRecord $record): ApplicationDocument
    {
        return new ApplicationDocument(
            id: $record->id,
            kind: $record->kind,
            fileName: $record->file_name,
            uploadedAt: DomainDate::date($record->uploaded_at),
            verified: $record->verified,
        );
    }

    private static function decision(DecisionRecord $record): ApplicationDecision
    {
        return new ApplicationDecision(
            outcome: $record->outcome,
            // The domain calls this `by`; the column could not, because BY is
            // an Oracle reserved word.
            by: $record->decided_by,
            role: $record->role,
            at: DomainDate::timestamp($record->at),
            reason: $record->reason,
            automatic: $record->automatic,
            awardedPct: $record->awarded_pct,
            awardId: $record->award_id,
        );
    }
}
