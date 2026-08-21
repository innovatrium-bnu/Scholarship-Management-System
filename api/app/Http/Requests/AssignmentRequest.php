<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A batch assignment: who is getting this scholarship, and on what terms.
 *
 * The components arrive already resolved. RatePlanService turns a plan — "75%
 * for this family, 25% for the next, hostel for the two who moved cities" —
 * into the coverage one student is awarded, and the assign screen has run that
 * before it posts. Sending the plan instead would mean resolving it twice, in
 * two languages, and hoping the answers matched.
 */
class AssignmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'mode' => ['required', Rule::in(['Evaluate', 'Direct'])],
            'reason' => ['required', 'string'],

            'picks' => ['required', 'array', 'min:1'],
            'picks.*.studentRegNo' => ['required', 'string', Rule::exists('students', 'reg_no')],
            'picks.*.overrideAuthority' => ['nullable', 'string', 'max:255'],
            'picks.*.overrideRef' => ['nullable', 'string', 'max:255'],

            'picks.*.components' => ['required', 'array', 'min:1'],
            'picks.*.components.*.feeHead' => ['required', 'string', Rule::exists('fee_heads', 'name')],
            'picks.*.components.*.entitlementKind' => [
                'required', Rule::in(['Percentage', 'Full waiver', 'Fixed amount']),
            ],
            'picks.*.components.*.entitlementValue' => ['required', 'numeric', 'min:0'],
            'picks.*.components.*.entitlement' => ['required', 'numeric', 'min:0'],
            // What the merge decided this actually pays. Zero is legitimate and
            // common: a line fully suppressed by a higher-precedence award.
            'picks.*.components.*.applied' => ['required', 'numeric', 'min:0'],
            'picks.*.components.*.isOverridden' => ['sometimes', 'boolean'],
            'picks.*.components.*.overrideReason' => ['nullable', 'string'],
            'picks.*.components.*.overrideAuthority' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * The picks, spelled the way the columns are.
     *
     * @return array<int, array<string, mixed>>
     */
    public function picks(): array
    {
        return array_map(fn (array $pick) => [
            'student_reg_no' => $pick['studentRegNo'],
            'override_authority' => $pick['overrideAuthority'] ?? null,
            'override_ref' => $pick['overrideRef'] ?? null,
            'components' => array_map(fn (array $component) => [
                'fee_head' => $component['feeHead'],
                'entitlement_kind' => $component['entitlementKind'],
                'entitlement_value' => $component['entitlementValue'],
                'entitlement' => $component['entitlement'],
                'applied' => $component['applied'],
                'is_overridden' => $component['isOverridden'] ?? false,
                'override_reason' => $component['overrideReason'] ?? null,
                'override_authority' => $component['overrideAuthority'] ?? null,
            ], $pick['components']),
        ], $this->validated()['picks']);
    }
}
