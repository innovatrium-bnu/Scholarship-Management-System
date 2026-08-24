<?php

declare(strict_types=1);

namespace App\Persistence\Mappers;

use App\Domain\Data\CoverageLine;
use App\Domain\Data\Rule;
use App\Domain\Data\Scholarship;
use App\Models\CoverageLine as CoverageLineRecord;
use App\Models\Scholarship as ScholarshipRecord;
use App\Models\ScholarshipRule as RuleRecord;
use App\Persistence\DomainDate;

/**
 * A scholarship and its two child collections, as the domain wants it.
 *
 * Expects coverageLines and rules to be loaded. It does not load them itself:
 * mapping one scholarship at a time is fine, mapping two hundred while each
 * quietly fires two more queries is the N+1 the repository exists to prevent.
 */
final class ScholarshipMapper
{
    public static function toDomain(ScholarshipRecord $record): Scholarship
    {
        $rules = $record->rules;

        return new Scholarship(
            id: $record->id,
            name: $record->name,
            description: $record->description,
            studyLevel: $record->study_level,
            schools: $record->schools ?? [],
            programmes: $record->programmes ?? [],
            batches: $record->batches ?? [],
            batchMode: $record->batch_mode,
            semesterFrom: $record->semester_from,
            coverage: array_map(self::coverage(...), $record->coverageLines->all()),
            awardRules: self::rulesOfType($rules, 'award'),
            retentionRules: self::rulesOfType($rules, 'retention'),
            maxDurationYears: $record->max_duration_years,
            workStudyHoursPerMonth: $record->work_study_hours_per_month,
            requiresReapplication: $record->requires_reapplication,
            fundingSource: $record->funding_source,
            status: $record->status,
            effectiveFrom: DomainDate::date($record->effective_from),
            reviewCycle: $record->review_cycle,
            batchFrom: $record->batch_from,
            semesterTill: $record->semester_till,
            allSemesters: $record->all_semesters,
            donorName: $record->donor_name,
            quotaPerCohort: $record->quota_per_cohort,
            mayExceedCeiling: $record->may_exceed_ceiling,
            donorId: $record->donor_id,
        );
    }

    /**
     * @param  iterable<ScholarshipRecord>  $records
     * @return Scholarship[]
     */
    public static function toDomainList(iterable $records): array
    {
        $scholarships = [];

        foreach ($records as $record) {
            $scholarships[] = self::toDomain($record);
        }

        return $scholarships;
    }

    private static function coverage(CoverageLineRecord $record): CoverageLine
    {
        return new CoverageLine(
            id: $record->id,
            feeHead: $record->fee_head,
            benefitKind: $record->benefit_kind,
            value: $record->value,
            conditionalOn: $record->conditional_on,
        );
    }

    /**
     * @param  iterable<RuleRecord>  $rules
     * @return Rule[]
     */
    private static function rulesOfType(iterable $rules, string $type): array
    {
        $mapped = [];

        foreach ($rules as $rule) {
            if ($rule->rule_type === $type) {
                $mapped[] = self::rule($rule);
            }
        }

        return $mapped;
    }

    private static function rule(RuleRecord $record): Rule
    {
        return new Rule(
            id: $record->id,
            kind: $record->kind,
            field: $record->field,
            operator: $record->operator,
            threshold: self::threshold($record->threshold),
            description: $record->description,
            weights: $record->weights,
            percentile: $record->percentile,
        );
    }

    /**
     * Give a threshold back the type it had before it was stored.
     *
     * This is the one line in this file that changes an answer rather than a
     * shape, and leaving it out is a silent wrong result rather than an error.
     *
     * Rule::$threshold is `string|float|int|null` because types.ts types it
     * `string | number` — what it means depends on the field. Oracle has no
     * such union, so the column is a varchar2 and everything comes back a
     * string. EvaluationService::passesAutomatic then asks:
     *
     *     $rule->field === 'cgpa' && is_numeric(...) && ! is_string(...)
     *
     * A threshold left as the string "3.5" fails that third test, so the CGPA
     * comparison never runs. Execution falls through to a branch that scrapes a
     * number out of the rule's English description — or, when there is no
     * description, returns [true, $label] and passes every student.
     *
     * That is a CGPA rule that silently stops rejecting anyone. So a stored
     * value that reads as a number is handed back as one, and anything else is
     * left alone: `+ 0` yields int for "3" and float for "3.5", which is the
     * same distinction JSON.parse would have made in the browser.
     */
    private static function threshold(?string $stored): string|int|float|null
    {
        if ($stored === null) {
            return null;
        }

        return is_numeric($stored) ? $stored + 0 : $stored;
    }
}
