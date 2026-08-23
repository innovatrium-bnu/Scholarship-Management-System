<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Actor;
use App\Http\Controllers\Controller;
use App\Http\Resources\DomainJson;
use App\Models\CgpaThreshold;
use App\Models\EligibilityCriteria;
use App\Models\Scholarship;
use App\Persistence\Mappers\EligibilityCriteriaMapper;
use App\Persistence\Writers\AuditWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The eligibility criteria for one scholarship.
 *
 * Settings rather than policy carved into code — settings.criteria.tsx edits
 * these at runtime. auto_reject_on is the important one: a criterion left off
 * that list still shows on an application as a flag for the committee to weigh,
 * it simply cannot reject on its own.
 */
final class CriteriaController extends Controller
{
    public function __construct(private readonly AuditWriter $audit) {}

    /**
     * Every scholarship's criteria.
     *
     * The review screens hold one list and look up the criteria for whichever
     * application they are showing, so asking per scholarship would be a
     * request per row of the queue. One row per scholarship makes this small.
     */
    public function index(): JsonResponse
    {
        $criteria = EligibilityCriteria::query()->with('cgpaThresholds')->get();

        return response()->json([
            'data' => DomainJson::encodeList(
                $criteria->map(EligibilityCriteriaMapper::toDomain(...))->all()
            ),
        ]);
    }

    public function show(Scholarship $scholarship): JsonResponse
    {
        $criteria = EligibilityCriteria::query()
            ->with('cgpaThresholds')
            ->find($scholarship->id);

        if ($criteria === null) {
            return response()->json(['data' => null]);
        }

        return response()->json(['data' => DomainJson::encode(
            EligibilityCriteriaMapper::toDomain($criteria)
        )]);
    }

    /**
     * Replace the criteria wholesale.
     *
     * PUT because the criteria screen edits every field at once and the CGPA
     * thresholds are a list, not a set of individually addressable rows —
     * removing one is expressed by sending the list without it.
     */
    public function update(Request $request, Scholarship $scholarship): JsonResponse
    {
        $validated = $request->validate([
            'maxMonthlyIncome' => ['required', 'numeric', 'min:0'],
            'minCreditHours' => ['required', 'integer', 'min:0'],
            'minAttendancePct' => ['required', 'numeric', 'min:0', 'max:100'],
            'requiredDocuments' => ['present', 'array'],
            'requiredDocuments.*' => ['string', 'max:255'],
            'maxExistingCoveragePct' => ['required', 'numeric', 'min:0', 'max:100'],
            'autoRejectOn' => ['present', 'array'],
            'autoRejectOn.*' => [Rule::in([
                'cgpa', 'income', 'creditHours', 'attendance',
                'documents', 'existingCoverage', 'duplicate',
            ])],
            'cgpaThresholds' => ['present', 'array'],
            // Same reasoning as coverage.*.feeHead in ScholarshipRequest:
            // cgpa_thresholds is UNIQUE(scholarship_id, from_batch), and two
            // rows for one intake reached Oracle as a raw ORA-00001 500.
            'cgpaThresholds.*.fromBatch' => [
                'required', 'string', 'distinct', Rule::exists('batches', 'label'),
            ],
            'cgpaThresholds.*.minCgpa' => ['required', 'numeric', 'min:0', 'max:4'],
        ]);

        $criteria = DB::transaction(function () use ($validated, $scholarship, $request) {
            $columns = [
                'max_monthly_income' => $validated['maxMonthlyIncome'],
                'min_credit_hours' => $validated['minCreditHours'],
                'min_attendance_pct' => $validated['minAttendancePct'],
                'required_documents' => $validated['requiredDocuments'],
                'max_existing_coverage_pct' => $validated['maxExistingCoveragePct'],
                'auto_reject_on' => $validated['autoRejectOn'],
            ];

            $existing = EligibilityCriteria::find($scholarship->id);
            $before = $existing?->only(array_keys($columns));

            $criteria = EligibilityCriteria::updateOrCreate(
                ['scholarship_id' => $scholarship->id],
                $columns,
            );

            // Replaced rather than diffed: the list is short, and matching
            // incoming rows to existing ones would need an identity the screen
            // does not send.
            CgpaThreshold::query()->where('scholarship_id', $scholarship->id)->delete();

            foreach ($validated['cgpaThresholds'] as $threshold) {
                CgpaThreshold::create([
                    'scholarship_id' => $scholarship->id,
                    'from_batch' => $threshold['fromBatch'],
                    'min_cgpa' => $threshold['minCgpa'],
                ]);
            }

            $this->audit->record(
                entityType: 'Criteria',
                entityId: $scholarship->id,
                action: 'Updated eligibility criteria',
                actor: Actor::from($request),
                reason: $request->input('reason'),
                oldValue: $before,
                newValue: $columns,
            );

            return $criteria;
        });

        return $this->show($scholarship);
    }
}
