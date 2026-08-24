<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Domain\FundService;
use App\Domain\Support\FundingOptions;
use App\Models\PledgeInstalment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Recording money that arrived.
 *
 * `recordedBy` is absent on purpose. Who logged a receipt comes from the
 * session, never from the request — the same rule that had to be applied to the
 * revocation endpoint after it was found storing a caller-supplied name as the
 * person who ended a student's funding.
 */
final class DonationRequest extends FormRequest
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
            'amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999.99'],

            /*
             * A receipt records money that has arrived.
             *
             * A future date here is a pledge wearing a receipt's clothes, and it
             * would be counted as cash on hand — the one figure this module
             * exists to keep honest.
             */
            'receivedOn' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],

            'method' => ['required', Rule::in(FundingOptions::DONATION_METHODS)],
            'pledgeId' => ['nullable', 'string', Rule::exists('pledges', 'id')],
            'instalmentId' => ['nullable', 'string', Rule::exists('pledge_instalments', 'id')],
            'reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
            'reason' => ['nullable', 'string'],
        ];
    }

    /**
     * An instalment may only be settled by its own pledge's receipt, for the
     * exact amount.
     *
     * Two separate rules, and both had to be here.
     *
     * Rule::exists proves the instalment is real, not that it belongs here.
     * Without the ownership check a receipt against one donor's pledge could
     * mark another donor's instalment settled, and that instalment would
     * silently drop off the receivables report.
     *
     * The amount check is the one that was missing. Settling is all-or-nothing
     * — `donations.instalment_id` is unique, so an instalment is either claimed
     * or not — and nothing carried a remainder. So a receipt of one rupee
     * naming a PKR 1,200,000 instalment removed the whole 1,200,000 from
     * `receivable` and from `overdue`, on the strength of the rupee. The
     * browser form already refused to send that (DonorDialogs.tsx drops
     * instalmentId unless the amount matches within TOLERANCE); this is the
     * same rule where it is actually enforceable. A part payment leaves
     * instalmentId unset and FundService credits it against the schedule.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $instalmentId = $this->input('instalmentId');
            $pledgeId = $this->input('pledgeId');

            if ($instalmentId === null) {
                return;
            }

            if ($pledgeId === null) {
                $validator->errors()->add(
                    'instalmentId',
                    'A receipt can only settle an instalment when it names the pledge it belongs to.'
                );

                return;
            }

            $instalment = PledgeInstalment::query()
                ->whereKey($instalmentId)
                ->where('pledge_id', $pledgeId)
                ->first();

            if ($instalment === null) {
                $validator->errors()->add(
                    'instalmentId',
                    'That instalment belongs to a different pledge.'
                );

                return;
            }

            $amount = round((float) $this->input('amount'), 2);

            if (abs($amount - (float) $instalment->amount) > FundService::TOLERANCE) {
                $validator->errors()->add('instalmentId', sprintf(
                    'That payment is for PKR %s. A receipt settles an instalment only when it '
                    .'covers it exactly — record a part payment against the pledge instead, '
                    .'leaving the instalment unset.',
                    number_format((float) $instalment->amount, 2),
                ));
            }
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function columns(): array
    {
        return [
            'amount' => round((float) $this->input('amount'), 2),
            'received_on' => $this->input('receivedOn'),
            'method' => $this->input('method'),
            'pledge_id' => $this->input('pledgeId'),
            'instalment_id' => $this->input('instalmentId'),
            'reference' => $this->input('reference'),
            'notes' => $this->input('notes'),
        ];
    }
}
