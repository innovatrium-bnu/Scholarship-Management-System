<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Support\RevocationCause;
use App\Http\Actor;
use App\Http\Controllers\Controller;
use App\Http\Resources\DomainJson;
use App\Http\Rules\TermOrDate;
use App\Models\Award;
use App\Persistence\Mappers\AwardMapper;
use App\Persistence\Repositories\AwardRepository;
use App\Persistence\Writers\AwardWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Awards: what is held, what it pays, and ending it.
 */
final class AwardController extends Controller
{
    public function __construct(
        private readonly AwardRepository $awards,
        private readonly AwardWriter $writer,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $awards = match (true) {
            $request->filled('student') => $this->awards->activeForStudent($request->query('student')),
            $request->filled('scholarship') => $this->awards->activeForScholarship($request->query('scholarship')),
            default => $this->awards->allActive(),
        };

        return response()->json(['data' => DomainJson::encodeList($awards)]);
    }

    /**
     * Replace an award components by hand.
     *
     * Marks the award edited, which is what stops a later recomputation from
     * quietly overwriting an amount somebody agreed.
     */
    public function updateComponents(Request $request, Award $award): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string'],
            'components' => ['required', 'array', 'min:1'],
            'components.*.feeHead' => ['required', 'string', Rule::exists('fee_heads', 'name')],
            'components.*.entitlementKind' => ['required', Rule::in(['Percentage', 'Full waiver', 'Fixed amount'])],
            'components.*.entitlementValue' => ['required', 'numeric', 'min:0'],
            'components.*.entitlement' => ['required', 'numeric', 'min:0'],
            'components.*.applied' => ['required', 'numeric', 'min:0'],
            'components.*.isOverridden' => ['sometimes', 'boolean'],
            'components.*.overrideReason' => ['nullable', 'string'],
            'components.*.overrideAuthority' => ['nullable', 'string', 'max:255'],
        ]);

        $components = array_map(fn (array $component) => [
            'fee_head' => $component['feeHead'],
            'entitlement_kind' => $component['entitlementKind'],
            'entitlement_value' => $component['entitlementValue'],
            'entitlement' => $component['entitlement'],
            'applied' => $component['applied'],
            'is_overridden' => $component['isOverridden'] ?? false,
            'override_reason' => $component['overrideReason'] ?? null,
            'override_authority' => $component['overrideAuthority'] ?? null,
        ], $validated['components']);

        $updated = $this->writer->editComponents(
            $award,
            $components,
            $validated['reason'],
            Actor::from($request),
        );

        return response()->json(['data' => DomainJson::encode(AwardMapper::toDomain($updated))]);
    }

    /**
     * Revoke an award.
     *
     * effective takes either an ISO date or a term label, because one screen
     * offers a date picker and another a list of terms. The writer normalises
     * both, and the row ends up carrying each.
     */
    public function revoke(Request $request, Award $award): JsonResponse
    {
        if ($award->status !== 'Active') {
            return response()->json(['message' => 'This award is not active.'], 409);
        }

        $validated = $request->validate([
            // Either a term label or a date; the writer normalises both.
            // Unvalidated, a non-date reached Carbon and raised a 500.
            'effective' => ['required', 'string', new TermOrDate],
            'timing' => ['required', Rule::in(['immediate', 'next'])],
            // A closed set, not free text: this is what the per-term
            // gained/lost report groups by, so a cause outside it lands in a
            // bucket nothing counts.
            'cause' => ['required', Rule::in(RevocationCause::ALL)],
            'reason' => ['required', 'string'],
        ]);

        /*
         * Who revoked this is the signed-in user, and only that.
         *
         * The endpoint used to accept a `by` field and write it straight to
         * revocations.revoked_by. A client could therefore sign somebody else's
         * name to the ending of an award while the audit trail recorded the
         * real actor -- two records of one event, disagreeing, with the
         * forgeable one being the financial record. The field is no longer
         * read; extra keys in the payload are ignored, so an un-updated client
         * keeps working.
         */
        $revocation = $this->writer->revoke(
            $award,
            $validated['effective'],
            $validated['timing'],
            $validated['cause'],
            $validated['reason'],
            Actor::from($request),
        );

        return response()->json([
            'data' => [
                'awardId' => $award->id,
                'at' => $revocation->at->toIso8601ZuluString('millisecond'),
                'effectiveFrom' => $revocation->effective_from->format('Y-m-d'),
                'semester' => $revocation->semester,
                'timing' => $revocation->timing,
                'cause' => $revocation->cause,
                'reason' => $revocation->reason,
                'by' => $revocation->revoked_by,
            ],
        ], 201);
    }
}
