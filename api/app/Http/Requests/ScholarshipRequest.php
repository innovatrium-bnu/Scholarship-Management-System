<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Http\Rules\StringOrNumber;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates a scholarship, in the vocabulary the SPA speaks.
 *
 * The payload is camelCase because types.ts is camelCase and the frontend
 * round-trips these objects verbatim. Columns are snake_case because the
 * database is. Translating between the two is this class's other job, in
 * attributes(), so no controller has to know both spellings.
 *
 * Creating requires everything; updating validates only what was sent, because
 * updateScholarship in store.tsx takes a Partial<Scholarship> and the edit
 * screens send exactly the fields they touched.
 */
class ScholarshipRequest extends FormRequest
{
    /** The four kinds evaluate() knows how to apply. */
    private const RULE_KINDS = ['Automatic', 'Manual', 'Calculated score', 'Cohort rank'];

    public function authorize(): bool
    {
        // Phase 9. Every route here is unauthenticated for now, and the role
        // that reaches the audit log comes from App\Http\Actor.
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $creating = $this->isMethod('POST');
        $required = $creating ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:255'],
            'description' => [$required, 'string'],
            'studyLevel' => [$required, Rule::in(['Bachelors', 'Masters', 'Both'])],

            // Scope. Empty means "any", which is why these are not required to
            // be non-empty — a scholarship open to the whole university sends
            // an empty array rather than every school by name.
            'schools' => ['sometimes', 'array'],
            'schools.*' => ['string', Rule::exists('schools', 'name')],
            'programmes' => ['sometimes', 'array'],
            'programmes.*' => ['string', Rule::exists('programmes', 'name')],
            'batches' => ['sometimes', 'array'],
            'batches.*' => ['string', Rule::exists('batches', 'label')],

            'batchMode' => [$required, Rule::in(['all', 'list', 'onwards'])],
            // Only meaningful for "onwards", and required by it: without a
            // starting batch the mode cannot resolve to any list at all.
            'batchFrom' => [
                Rule::requiredIf(fn () => $this->input('batchMode') === 'onwards'),
                'nullable', 'string', Rule::exists('batches', 'label'),
            ],

            'semesterFrom' => [$required, 'string', Rule::exists('semesters', 'label')],
            'semesterTill' => ['nullable', 'string', Rule::exists('semesters', 'label')],
            'allSemesters' => ['sometimes', 'boolean'],
            'reviewCycle' => [$required, Rule::in(['Every semester', 'Annual'])],

            'maxDurationYears' => [$required, 'integer', 'min:1', 'max:10'],
            'workStudyHoursPerMonth' => ['sometimes', 'integer', 'min:0'],
            'requiresReapplication' => ['sometimes', 'boolean'],

            'fundingSource' => [$required, Rule::in(['Internal', 'Donor'])],
            // A donor-funded scholarship that cannot name its donor is a
            // reporting problem later, so it is a validation error now.
            'donorName' => [
                Rule::requiredIf(fn () => $this->input('fundingSource') === 'Donor'),
                'nullable', 'string', 'max:255',
            ],
            'quotaPerCohort' => ['nullable', 'integer', 'min:1'],

            'effectiveFrom' => [$required, 'date_format:Y-m-d'],
            'mayExceedCeiling' => ['sometimes', 'boolean'],

            /*
             * Optional, and it never replaces donorName.
             *
             * A client that has never heard of donors behaves exactly as it
             * did before, which is what makes this additive. When it is sent,
             * the controller overwrites donor_name from the donor row so the
             * link and its display fallback cannot disagree.
             */
            'donorId' => ['nullable', 'string', Rule::exists('donors', 'id')],

            /*
             * The two child collections. Sent whole, replaced whole.
             *
             * A scholarship is never versioned, so there is no history to
             * preserve on either of these — when terms change you create a
             * second scholarship scoped to the newer batches. That makes
             * replacement the honest operation: the edit screen holds the whole
             * set and removing a line is expressed by sending the set without
             * it.
             */
            'coverage' => ['sometimes', 'array'],
            // `distinct`, because coverage_lines is UNIQUE(scholarship_id,
            // fee_head). Without it two lines on the same fee head passed
            // validation and collided in Oracle, so a duplicate row -- an
            // ordinary mistake on a five-step form -- came back as a 500
            // carrying ORA-00001 and the schema names instead of a 422 naming
            // the field.
            'coverage.*.feeHead' => [
                'required', 'string', 'distinct', Rule::exists('fee_heads', 'name'),
            ],
            'coverage.*.benefitKind' => [
                'required', Rule::in(['Percentage', 'Full waiver', 'Fixed amount']),
            ],
            'coverage.*.value' => ['required', 'numeric', 'min:0'],
            'coverage.*.conditionalOn' => ['nullable', 'string', 'max:255'],

            'awardRules' => ['sometimes', 'array'],
            'awardRules.*.kind' => ['required', Rule::in(self::RULE_KINDS)],
            'awardRules.*.field' => ['nullable', 'string', 'max:255'],
            'awardRules.*.operator' => ['nullable', 'string', 'max:255'],
            // string|number in types.ts, and a varchar2 here. The mapper gives
            // numeric-looking values their type back on the way out -- which
            // only works if what arrived was one of those two.
            'awardRules.*.threshold' => ['nullable', new StringOrNumber],
            'awardRules.*.description' => ['nullable', 'string'],
            'awardRules.*.weights' => ['nullable', 'array'],
            'awardRules.*.percentile' => ['nullable', 'numeric', 'min:0', 'max:100'],

            'retentionRules' => ['sometimes', 'array'],
            'retentionRules.*.kind' => ['required', Rule::in(self::RULE_KINDS)],
            'retentionRules.*.field' => ['nullable', 'string', 'max:255'],
            'retentionRules.*.operator' => ['nullable', 'string', 'max:255'],
            'retentionRules.*.threshold' => ['nullable', new StringOrNumber],
            'retentionRules.*.description' => ['nullable', 'string'],
            'retentionRules.*.weights' => ['nullable', 'array'],
            'retentionRules.*.percentile' => ['nullable', 'numeric', 'min:0', 'max:100'],
        ];
    }

    /**
     * Coverage lines, spelled the way the columns are.
     *
     * @return array<int, array<string, mixed>>|null null when not sent, which
     *                                               on a PATCH means leave them
     */
    public function coverageColumns(): ?array
    {
        $validated = $this->validated();

        if (! array_key_exists('coverage', $validated)) {
            return null;
        }

        return array_map(fn (array $line) => [
            'fee_head' => $line['feeHead'],
            'benefit_kind' => $line['benefitKind'],
            'value' => $line['value'],
            'conditional_on' => $line['conditionalOn'] ?? null,
        ], $validated['coverage']);
    }

    /**
     * Award and retention rules together, each tagged with its rule_type.
     *
     * One table with a discriminator, because Rule is one shape in types.ts and
     * evaluate() applies the same four kinds to both collections.
     *
     * @return array<int, array<string, mixed>>|null
     */
    public function ruleColumns(): ?array
    {
        $validated = $this->validated();

        if (! array_key_exists('awardRules', $validated) && ! array_key_exists('retentionRules', $validated)) {
            return null;
        }

        $columns = [];

        foreach (['award' => 'awardRules', 'retention' => 'retentionRules'] as $type => $key) {
            foreach ($validated[$key] ?? [] as $order => $rule) {
                $columns[] = [
                    'rule_type' => $type,
                    'kind' => $rule['kind'],
                    'field' => $rule['field'] ?? null,
                    'operator' => $rule['operator'] ?? null,
                    // Stored as text; the union is restored when read.
                    'threshold' => isset($rule['threshold']) ? (string) $rule['threshold'] : null,
                    'description' => $rule['description'] ?? null,
                    'weights' => $rule['weights'] ?? null,
                    'percentile' => $rule['percentile'] ?? null,
                    'sort_order' => $order,
                ];
            }
        }

        return $columns;
    }

    /**
     * The validated payload, spelled the way the columns are.
     *
     * Deliberately not called attributes(). FormRequest already defines that
     * method for custom attribute names in validation messages, and overriding
     * it with a different meaning would have Laravel feeding column data into
     * its error message formatting.
     *
     * @return array<string, mixed>
     */
    public function columns(): array
    {
        $map = [
            'name' => 'name',
            'description' => 'description',
            'studyLevel' => 'study_level',
            'schools' => 'schools',
            'programmes' => 'programmes',
            'batches' => 'batches',
            'batchMode' => 'batch_mode',
            'batchFrom' => 'batch_from',
            'semesterFrom' => 'semester_from',
            'semesterTill' => 'semester_till',
            'allSemesters' => 'all_semesters',
            'reviewCycle' => 'review_cycle',
            'maxDurationYears' => 'max_duration_years',
            'workStudyHoursPerMonth' => 'work_study_hours_per_month',
            'requiresReapplication' => 'requires_reapplication',
            'fundingSource' => 'funding_source',
            'donorName' => 'donor_name',
            'quotaPerCohort' => 'quota_per_cohort',
            'effectiveFrom' => 'effective_from',
            'mayExceedCeiling' => 'may_exceed_ceiling',
            'donorId' => 'donor_id',
        ];

        $columns = [];

        foreach ($this->validated() as $key => $value) {
            if (isset($map[$key])) {
                $columns[$map[$key]] = $value;
            }
        }

        return $columns;
    }
}
