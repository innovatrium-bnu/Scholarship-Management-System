<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Data\Donation;
use App\Domain\Data\DonorFunding;
use App\Domain\Data\Pledge as PledgeData;
use App\Domain\FundService;
use App\Http\Actor;
use App\Http\Controllers\Controller;
use App\Http\Requests\DonorRequest;
use App\Http\Requests\PledgeRequest;
use App\Http\Resources\DomainJson;
use App\Models\Donor;
use App\Models\Pledge;
use App\Persistence\Repositories\DonorRepository;
use App\Persistence\Writers\DonorWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Donors and what they have promised.
 *
 * The index returns donors, pledges and receipts as three lists rather than one
 * nested graph, and each donor's rollup alongside. That shape is deliberate: the
 * browser runs the same FundService arithmetic to keep the filter and its
 * totals in step, so it needs the raw collections, and the rollups are sent as
 * well so a screen that only wants headline figures need not fold anything.
 */
final class DonorController extends Controller
{
    public function __construct(
        private readonly DonorRepository $donors,
        private readonly DonorWriter $writer,
        private readonly FundService $funds = new FundService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $donors = $this->donors->all();
        $pledges = $this->donors->pledges();
        $donations = $this->donors->donations();

        $today = now()->toDateString();

        return response()->json(['data' => [
            'donors' => DomainJson::encodeList($donors),
            'pledges' => DomainJson::encodeList($pledges),
            'donations' => DomainJson::encodeList($donations),
            'funding' => DomainJson::encodeList(
                $this->rollups($donors, $pledges, $donations, $today)
            ),

            /*
             * The server's today, not the browser's.
             *
             * Every overdue and renewal answer is relative to a date, and a
             * client whose clock is a day out would compute a different set from
             * the same rows. One date, decided here, so both sides agree.
             */
            'asOf' => $today,
        ]]);
    }

    public function show(Donor $donor): JsonResponse
    {
        $profile = $this->donors->profile($donor->id);
        $today = now()->toDateString();

        return response()->json(['data' => [
            'donor' => DomainJson::encode($profile['donor']),
            'pledges' => DomainJson::encodeList($profile['pledges']),
            'donations' => DomainJson::encodeList($profile['donations']),
            'funding' => DomainJson::encode($this->funds->rollup(
                $profile['donor'],
                $profile['pledges'],
                $profile['donations'],
                $today,
            )),
            'asOf' => $today,
        ]]);
    }

    public function store(DonorRequest $request): JsonResponse
    {
        $donor = $this->writer->create(
            $request->columns() + ['status' => 'Active'],
            Actor::from($request),
            $request->input('reason'),
        );

        return response()->json(
            ['data' => DomainJson::encode($this->donors->find($donor->id))],
            201
        );
    }

    public function update(DonorRequest $request, Donor $donor): JsonResponse
    {
        $changed = $this->writer->update(
            $donor,
            $request->columns(),
            Actor::from($request),
            (string) $request->input('reason'),
        );

        // Nothing changed, so nothing was written and nothing is claimed. The
        // caller gets the record it already had.
        return response()->json(
            ['data' => DomainJson::encode($this->donors->find($donor->id))],
            $changed === null ? 200 : 200
        );
    }

    public function archive(Request $request, Donor $donor): JsonResponse
    {
        $validated = $request->validate(['reason' => ['required', 'string']]);

        if ($donor->status === 'Archived') {
            return response()->json([
                'message' => 'This donor is already archived.',
            ], 409);
        }

        /*
         * Refused while money is still owed.
         *
         * Archiving takes a donor out of the pickers, and their outstanding
         * instalments would go with them — quietly reducing the receivables
         * figure by an amount nobody wrote off. Cancel the pledge first, which
         * is a decision with a reason attached, or leave the donor active.
         */
        $outstanding = $this->funds->receivable(
            $this->donors->pledgesForDonors([$donor->id]),
            $this->donors->donationsForDonors([$donor->id]),
        );

        if ($this->funds->isPositive($outstanding)) {
            return response()->json([
                'message' => sprintf(
                    '%s still has PKR %s pledged and not received. Cancel the pledge first, '
                    .'or leave the donor active.',
                    $donor->name,
                    number_format($outstanding, 2),
                ),
            ], 409);
        }

        $this->writer->archive($donor, Actor::from($request), $validated['reason']);

        return response()->json(['data' => DomainJson::encode($this->donors->find($donor->id))]);
    }

    public function restore(Request $request, Donor $donor): JsonResponse
    {
        $validated = $request->validate(['reason' => ['required', 'string']]);

        if ($donor->status !== 'Archived') {
            return response()->json([
                'message' => 'This donor is not archived, so there is nothing to restore.',
            ], 409);
        }

        $this->writer->restore($donor, Actor::from($request), $validated['reason']);

        return response()->json(['data' => DomainJson::encode($this->donors->find($donor->id))]);
    }

    public function storePledge(PledgeRequest $request, Donor $donor): JsonResponse
    {
        if ($donor->status === 'Archived') {
            return response()->json([
                'message' => 'This donor is archived. Restore them before recording a new pledge.',
            ], 409);
        }

        $pledge = $this->writer->addPledge(
            $donor,
            $request->columns(),
            $request->instalments(),
            Actor::from($request),
            (string) $request->input('reason', 'Pledge recorded'),
        );

        return response()->json(
            ['data' => DomainJson::encodeList($this->donors->pledgesForDonors([$donor->id]))],
            201
        );
    }

    public function cancelPledge(Request $request, Pledge $pledge): JsonResponse
    {
        $validated = $request->validate(['reason' => ['required', 'string']]);

        if ($pledge->status !== 'Active') {
            return response()->json([
                'message' => 'This pledge is already '.mb_strtolower($pledge->status).'.',
            ], 409);
        }

        /*
         * The outstanding remainder on *this* pledge, before the status changes.
         *
         * It is what the event records, because "how much promised money
         * evaporated" is the question a report asks — and money already received
         * did not evaporate.
         *
         * Filtered to the one pledge, which it was not. Passing the donor's
         * whole book made cancelling a PKR 100,000 pledge record PKR 1,000,000
         * against a donor who still had a PKR 900,000 pledge running, in both
         * the audit sentence and the `amount_pkr` column — the column that
         * exists so write-offs can be summed.
         */
        $donorPledges = $this->donors->pledgesForDonors([$pledge->donor_id]);

        $outstanding = $this->funds->receivable(
            array_values(array_filter(
                $donorPledges,
                fn (PledgeData $candidate) => $candidate->id === $pledge->id,
            )),
            $this->donors->donationsForDonors([$pledge->donor_id]),
        );

        $this->writer->cancelPledge(
            $pledge,
            $outstanding,
            Actor::from($request),
            $validated['reason'],
        );

        return response()->json(
            ['data' => DomainJson::encodeList($this->donors->pledgesForDonors([$pledge->donor_id]))]
        );
    }

    /**
     * One rollup per donor, from the collections already loaded.
     *
     * Grouped in memory rather than by re-querying per donor. The whole module
     * is served whole, and a per-donor query here would be the N+1 the
     * persistence layer exists to prevent.
     *
     * @param  \App\Domain\Data\Donor[]  $donors
     * @param  PledgeData[]  $pledges
     * @param  Donation[]  $donations
     * @return DonorFunding[]
     */
    private function rollups(array $donors, array $pledges, array $donations, string $today): array
    {
        $pledgesBy = [];
        $donationsBy = [];

        foreach ($pledges as $pledge) {
            $pledgesBy[$pledge->donorId][] = $pledge;
        }

        foreach ($donations as $donation) {
            $donationsBy[$donation->donorId][] = $donation;
        }

        $rollups = [];

        foreach ($donors as $donor) {
            $rollups[] = $this->funds->rollup(
                $donor,
                $pledgesBy[$donor->id] ?? [],
                $donationsBy[$donor->id] ?? [],
                $today,
            );
        }

        return $rollups;
    }
}
