<?php

declare(strict_types=1);

namespace App\Http\Rules;

use App\Persistence\DomainDate;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\DB;

/**
 * "When does this take effect" — a term label, or a date.
 *
 * Two endpoints accept either form, and that is deliberate rather than sloppy.
 * Revoking an award and archiving a scholarship both answer "from when does the
 * money stop", and a registrar answers it with a term ("Fall 2025") while an
 * imported record answers it with a date. AwardWriter and ScholarshipWriter
 * both branch on DomainDate::looksLikeDate() and normalise to both a date and a
 * term, so either input produces the same pair of stored values.
 *
 * What neither of them did was check that the input was one of the two. The
 * rule was ['required', 'string'], so "not-a-date-at-all" passed validation,
 * reached Carbon, and raised an unhandled InvalidFormatException — HTTP 500 on
 * a client mistake. The transaction rolled back, so no row was written, but the
 * caller got a server fault instead of a message naming the field.
 *
 * The date branch validates the calendar as well as the shape. `2025-02-31`
 * matches the pattern and is not a day, and Oracle would take it as far as the
 * bind before objecting.
 *
 * The term branch checks the semesters table rather than a regex, because a
 * well-formed label for a term the university does not have is still wrong:
 * ReportService groups by these labels, and a term nothing else knows about is
 * a row that appears in no report.
 */
final class TermOrDate implements ValidationRule
{
    /**
     * @param  Closure(string): void  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || $value === '') {
            $fail('The :attribute must be a term label or a date.');

            return;
        }

        if (DomainDate::looksLikeDate($value)) {
            $this->validateDate($value, $fail);

            return;
        }

        $this->validateTerm($value, $fail);
    }

    /**
     * A real day, not merely four-two-two digits.
     *
     * @param  Closure(string): void  $fail
     */
    private function validateDate(string $value, Closure $fail): void
    {
        [$year, $month, $day] = array_map('intval', explode('-', substr($value, 0, 10)));

        if (! checkdate($month, $day, $year)) {
            $fail('The :attribute is not a real date.');
        }
    }

    /**
     * A term the university has a record of.
     *
     * @param  Closure(string): void  $fail
     */
    private function validateTerm(string $value, Closure $fail): void
    {
        if (! DB::table('semesters')->where('label', $value)->exists()) {
            $fail('The :attribute must be a known term, such as "Fall 2025", or a date as YYYY-MM-DD.');
        }
    }
}
