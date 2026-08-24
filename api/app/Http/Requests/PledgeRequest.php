<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domain\FundService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Recording a commitment and the schedule it arrives on.
 *
 * The schedule is optional in the request and mandatory in the database. Sending
 * one means the donor named their own dates; omitting it means the university's
 * standard shape, and `instalments()` builds it — one payment a year, the first
 * on the start date.
 *
 * That default is what makes "a four-year pledge of PKR 4,000,000" a form with
 * three fields rather than one with twelve.
 */
final class PledgeRequest extends FormRequest
{
    /**
     * A schedule longer than this is not a pledge, it is a direct debit.
     *
     * Bounded so a typo in termYears cannot generate ten thousand rows inside a
     * transaction.
     */
    private const MAX_INSTALMENTS = 40;

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
            /*
             * The ceiling is decimal(12,2)'s, not an opinion. Above it Oracle
             * raises ORA-01438 — "value larger than specified precision" — which
             * without this rule is a 500 on somebody typing one extra zero.
             */
            'totalAmount' => ['required', 'numeric', 'min:1', 'max:9999999999.99'],

            'termYears' => ['required', 'integer', 'min:1', 'max:10'],
            'startsOn' => ['required', 'date_format:Y-m-d'],
            'scholarshipId' => ['nullable', 'string', Rule::exists('scholarships', 'id')],
            'reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],

            /*
             * How long before the end this pledge starts appearing on the
             * renewal report. Editable per pledge because it is policy, and
             * policy lives in data.
             */
            'renewalNoticeDays' => ['sometimes', 'integer', 'min:0', 'max:730'],

            'instalments' => ['sometimes', 'array', 'min:1', 'max:'.self::MAX_INSTALMENTS],
            'instalments.*.amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999.99'],
            'instalments.*.dueOn' => ['required', 'date_format:Y-m-d'],

            'reason' => ['nullable', 'string'],
        ];
    }

    /**
     * A supplied schedule must add up to the commitment.
     *
     * No CHECK constraint can express "the sum of my children equals my column",
     * so it is enforced here and by nothing else. A schedule that does not sum
     * is a pledge whose receivable figure and whose headline disagree from the
     * moment it is written, and neither number would look wrong on its own.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $supplied = $this->input('instalments');

            if (! is_array($supplied) || $supplied === []) {
                return;
            }

            $scheduled = 0.0;

            foreach ($supplied as $instalment) {
                $scheduled += (float) ($instalment['amount'] ?? 0);
            }

            $total = (float) $this->input('totalAmount');

            if (abs($scheduled - $total) > FundService::TOLERANCE) {
                $validator->errors()->add('instalments', sprintf(
                    'The schedule adds up to %s, but the pledge is for %s.',
                    number_format($scheduled, 2),
                    number_format($total, 2),
                ));
            }
        });
    }

    /**
     * The schedule to write: the one supplied, or the standard one.
     *
     * The generated shape is one instalment a year for `termYears`, the first on
     * `startsOn`. The **last instalment carries the remainder**, because
     * PKR 1,000,000 over three years is 333,333.33 three times and 999,999.99 —
     * a penny short of the commitment, every time, forever. Putting the
     * difference on the last line is what makes the schedule sum exactly.
     *
     * @return list<array{amount: float, dueOn: string}>
     */
    public function instalments(): array
    {
        $supplied = $this->input('instalments');

        if (is_array($supplied) && $supplied !== []) {
            return array_map(
                fn (array $instalment) => [
                    'amount' => round((float) $instalment['amount'], 2),
                    'dueOn' => $instalment['dueOn'],
                ],
                array_values($supplied),
            );
        }

        $total = round((float) $this->input('totalAmount'), 2);
        $years = (int) $this->input('termYears');
        $each = round($total / $years, 2);

        $schedule = [];

        for ($year = 0; $year < $years; $year++) {
            $amount = $year === $years - 1
                ? round($total - ($each * ($years - 1)), 2)
                : $each;

            $schedule[] = [
                'amount' => $amount,
                'dueOn' => $this->yearsAfter((string) $this->input('startsOn'), $year),
            ];
        }

        return $schedule;
    }

    /**
     * The columns a pledge row is written from.
     *
     * `ends_on` is derived here rather than asked for. It is `startsOn` plus the
     * term, and letting a client send it would allow a four-year pledge that
     * ends in eighteen months — a renewal report sorted on a date nobody
     * checked.
     *
     * @return array<string, mixed>
     */
    public function columns(): array
    {
        $startsOn = (string) $this->input('startsOn');
        $years = (int) $this->input('termYears');

        return [
            'total_amount' => round((float) $this->input('totalAmount'), 2),
            'term_years' => $years,
            'starts_on' => $startsOn,
            'ends_on' => $this->yearsAfter($startsOn, $years),
            'renewal_notice_days' => (int) $this->input('renewalNoticeDays', 90),
            'scholarship_id' => $this->input('scholarshipId'),
            'reference' => $this->input('reference'),
            'notes' => $this->input('notes'),
            'status' => 'Active',
        ];
    }

    /**
     * The same date, n years on, as YYYY-MM-DD.
     *
     * strtotime rather than a date library so the shape is unmistakable: every
     * date the domain compares is a zero-padded ISO string, because the reports
     * sort them with strcmp.
     *
     * The day is clamped to the end of the target month, which matters for one
     * date a year. `strtotime('+1 years')` on 29 February gives 1 March, so a
     * pledge starting on a leap day used to move its whole schedule a day later
     * and never move back — every instalment after the first falling due on
     * 1 March. Clamping gives 28 February, which is the anniversary a person
     * would write down.
     */
    private function yearsAfter(string $date, int $years): string
    {
        $at = strtotime($date.' 00:00:00 UTC');

        if ($at === false) {
            return $date;
        }

        $year = (int) gmdate('Y', $at) + $years;
        $month = (int) gmdate('n', $at);
        $day = (int) gmdate('j', $at);

        $lastOfMonth = (int) gmdate('t', gmmktime(0, 0, 0, $month, 1, $year));

        return sprintf('%04d-%02d-%02d', $year, $month, min($day, $lastOfMonth));
    }
}
