<?php

declare(strict_types=1);

namespace App\Persistence\Mappers;

use App\Domain\Data\CgpaThreshold;
use App\Domain\Data\EligibilityCriteria;
use App\Models\CgpaThreshold as CgpaThresholdRecord;
use App\Models\EligibilityCriteria as CriteriaRecord;

/**
 * A scholarship's eligibility criteria, as the domain wants it.
 *
 * Expects cgpaThresholds to be loaded. Their order does not matter:
 * ScreeningService::minCgpaFor resolves each one through the batch order and
 * takes the latest applicable, rather than trusting the order it is handed.
 */
final class EligibilityCriteriaMapper
{
    public static function toDomain(CriteriaRecord $record): EligibilityCriteria
    {
        return new EligibilityCriteria(
            scholarshipId: $record->scholarship_id,
            cgpaThresholds: array_map(self::threshold(...), $record->cgpaThresholds->all()),
            maxMonthlyIncome: $record->max_monthly_income,
            minCreditHours: $record->min_credit_hours,
            minAttendancePct: $record->min_attendance_pct,
            requiredDocuments: $record->required_documents ?? [],
            maxExistingCoveragePct: $record->max_existing_coverage_pct,
            autoRejectOn: $record->auto_reject_on ?? [],
        );
    }

    private static function threshold(CgpaThresholdRecord $record): CgpaThreshold
    {
        return new CgpaThreshold(
            id: $record->id,
            fromBatch: $record->from_batch,
            minCgpa: $record->min_cgpa,
        );
    }
}
