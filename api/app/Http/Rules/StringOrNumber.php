<?php

declare(strict_types=1);

namespace App\Http\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * A scalar that is either text or a number, and nothing else.
 *
 * For Rule::$threshold, which types.ts types `string | number` because what it
 * means depends on the field it is compared against — a CGPA floor is a number,
 * an award category is a word. Oracle has no union, so the column is a varchar2
 * and ScholarshipMapper::threshold() gives a numeric-looking value its type
 * back on the way out.
 *
 * The rule was `['nullable']`, which is no rule at all. Two consequences, both
 * reachable with one request:
 *
 *   - an array or object reached `(string) $rule['threshold']` in
 *     ScholarshipRequest::ruleColumns() and raised out of the cast, so a
 *     malformed rule was a 500 rather than a field error;
 *   - `true` cast to the string "1", which the mapper reads back as the number
 *     1 — a CGPA rule that silently passes every student, which is the exact
 *     failure the mapper's own docblock was written to prevent.
 *
 * Booleans are therefore refused rather than coerced. There is no threshold a
 * person means to write as true.
 */
final class StringOrNumber implements ValidationRule
{
    /**
     * @param  Closure(string): void  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) || is_int($value) || is_float($value)) {
            return;
        }

        $fail('The :attribute must be a number or a word, not '.get_debug_type($value).'.');
    }
}
