<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\FundService;
use App\Http\Actor;
use App\Http\Controllers\Controller;
use App\Http\Requests\DonationRequest;
use App\Http\Resources\DomainJson;
use App\Models\Award;
use App\Models\Donation;
use App\Models\Donor;
use App\Models\FundAllocation;
use App\Persistence\Repositories\DonorRepository;
use App\Persistence\Writers\FundWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Money arriving, being assigned to a student, and coming back.
 *
 * The summary endpoint answers the acceptance criterion about separating cash
 * from promises, and it does so by returning them as separate fields that are
 * never added together anywhere — not here, and not on the screen that renders
 * them.
 */
final class FundController extends Controller
{
    public function __construct(
        private readonly DonorRepository $donors,
        private readonly FundWriter $writer,
        private readonly FundService $funds = new FundService,
    ) {}

    /**
     * The headline figures, and the pledges coming up for renewal.
     *
     * Separate from /reports/summary on purpose. That endpoint counts movements
     * over a date range from the event log, because an award can end without
     * surviving as a row; these are balances as they stand right now, read from
     * the rows themselves. Serving both from one place would invite answering a
     * balance question from the event log, which double-counts a released
     * allocation.
     */
    public function summary(Request $request): JsonResponse
    {
        $pledges = $this->donors->pledges();
        $donations = $this->donors->donations();
        $today = now()->toDateString();

        $renewals = $this->funds->renewalsDue($pledges, $today);

        return response()->json(['data' => [
            // Cash the university holds.
            'received' => $this->funds->received($donations),
            'assigned' => $this->funds->assigned($donations),
            'unassigned' => $this->funds->unassigned($donations),

            // Money it has been promised. Never added to the three above.
            'receivable' => $this->funds->receivable($pledges, $donations),
            'overdue' => $this->funds->overdue($pledges, $donations, $today),

            'donorCount' => count($this->donors->all()),
            'renewalsDue' => DomainJson::encodeList($renewals),
            'asOf' => $today,
        ]]);
    }

    public function store(DonationRequest $request, Donor $donor): JsonResponse
    {
        if ($donor->status === 'Archived') {
            return response()->json([
                'message' => 'This donor is archived. Restore them before recording a receipt.',
            ], 409);
        }

        $pledgeId = $request->input('pledgeId');

        if ($pledgeId !== null && ! $donor->pledges()->whereKey($pledgeId)->exists()) {
            return response()->json([
                'message' => 'That pledge belongs to a different donor.',
            ], 409);
        }

        $donation = $this->writer->receive(
            $donor,
            $request->columns(),
            Actor::from($request),
            $request->input('reason'),
        );

        return response()->json(
            ['data' => DomainJson::encodeList($this->donors->donationsForDonors([$donor->id]))],
            201
        );
    }

    /**
     * Assign part of a receipt to an award.
     *
     * The balance check lives in the writer, inside the transaction and behind a
     * row lock, not in a form request — a validator reads state that another
     * transaction can change before the write lands, and cannot hold a lock
     * while it decides.
     */
    public function allocate(Request $request, Donation $donation): JsonResponse
    {
        $validated = $request->validate([
            'awardId' => ['required', 'string', Rule::exists('awards', 'id')],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999.99'],
            'reason' => ['required', 'string'],
        ]);

        $award = Award::query()->findOrFail($validated['awardId']);

        if ($award->status !== 'Active') {
            return response()->json([
                'message' => 'That award has been revoked. Donor money cannot be assigned to it.',
            ], 409);
        }

        $allocation = $this->writer->allocate(
            $donation,
            $award,
            round((float) $validated['amount'], 2),
            Actor::from($request),
            $validated['reason'],
        );

        if ($allocation === null) {
            $spent = (float) FundAllocation::query()
                ->where('donation_id', $donation->id)
                ->active()
                ->sum('amount');

            return response()->json([
                'message' => sprintf(
                    'This receipt has only PKR %s left to assign. Someone may have assigned '
                    .'part of it since this screen loaded.',
                    number_format(round($donation->amount - $spent, 2), 2),
                ),
            ], 409);
        }

        return response()->json(
            ['data' => DomainJson::encodeList($this->donors->donationsForDonors([$donation->donor_id]))],
            201
        );
    }

    public function release(Request $request, FundAllocation $allocation): JsonResponse
    {
        $validated = $request->validate(['reason' => ['required', 'string']]);

        if ($allocation->status !== 'Active') {
            return response()->json([
                'message' => 'That allocation has already been released.',
            ], 409);
        }

        $this->writer->release($allocation, Actor::from($request), $validated['reason']);

        return response()->json(
            ['data' => DomainJson::encodeList(
                $this->donors->donationsForDonors([$allocation->donation->donor_id])
            )]
        );
    }
}
