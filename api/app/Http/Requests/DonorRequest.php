<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domain\Support\FundingOptions;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Creating or amending a donor.
 *
 * Authorisation is the route's `can:` gate, not this class — the matrix decides
 * who may write, and duplicating it here would be a second answer to one
 * question.
 */
final class DonorRequest extends FormRequest
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
        // PATCH sends only what changed; POST must carry the whole record.
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:255'],
            'kind' => [$required, Rule::in(FundingOptions::DONOR_KINDS)],
            'contactName' => ['nullable', 'string', 'max:255'],
            'contactEmail' => ['nullable', 'email', 'max:255'],
            'contactPhone' => ['nullable', 'string', 'max:40'],
            'notes' => ['nullable', 'string'],

            // Every write to a donor takes a reason, as every other mutation in
            // this system does. It is what the audit sentence carries.
            'reason' => [$this->isMethod('POST') ? 'nullable' : 'required', 'string'],
        ];
    }

    /**
     * camelCase in, snake_case out.
     *
     * Called columns() rather than attributes(), which Laravel reserves for
     * validation-message names — a collision this codebase has already hit once.
     *
     * @return array<string, mixed>
     */
    public function columns(): array
    {
        $map = [
            'name' => 'name',
            'kind' => 'kind',
            'contactName' => 'contact_name',
            'contactEmail' => 'contact_email',
            'contactPhone' => 'contact_phone',
            'notes' => 'notes',
        ];

        $columns = [];

        foreach ($map as $field => $column) {
            if ($this->has($field)) {
                $columns[$column] = $this->input($field);
            }
        }

        return $columns;
    }
}
