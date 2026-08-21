<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Batch;
use App\Models\FeeHead;
use App\Models\Geography;
use App\Models\Programme;
use App\Models\Quota;
use App\Models\School;
use App\Models\Semester;
use Illuminate\Http\JsonResponse;

/**
 * The lookups every screen needs, in one request.
 *
 * Shaped to match the constants in src/lib/scholarship/seed.ts exactly, because
 * that is what this replaces: eight files import SCHOOLS, PROGRAMMES, BATCHES,
 * SEMESTERS and GEOGRAPHY from there today. When Phase 10 points them here
 * instead, seed.ts loses the constants and ReferenceSeeder becomes the only
 * copy — which is the duplication ReferenceDataTest currently guards.
 *
 * So PROGRAMMES is keyed by school and GEOGRAPHY is nested province -> city ->
 * districts, matching the TypeScript rather than the tables. The tables are
 * flat because that is what a database wants; the nesting is rebuilt here.
 *
 * One request rather than seven, because no screen needs one of these alone and
 * the whole payload is a few kilobytes that changes about once a semester.
 */
final class ReferenceController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'schools' => School::query()->orderBy('sort_order')->orderBy('name')->pluck('name'),
            'programmes' => $this->programmesBySchool(),
            'batches' => Batch::query()->orderBy('sort_order')->pluck('label'),
            'semesters' => Semester::query()->orderBy('sort_order')->pluck('label'),
            'quotas' => Quota::query()->orderBy('name')->pluck('name'),
            'geography' => $this->geography(),
            'feeHeads' => FeeHead::query()->orderBy('sort_order')->orderBy('name')->pluck('name'),
        ]);
    }

    /**
     * @return array<string, list<string>>
     */
    private function programmesBySchool(): array
    {
        $bySchool = [];

        foreach (Programme::query()->orderBy('school')->orderBy('name')->get() as $programme) {
            $bySchool[$programme->school][] = $programme->name;
        }

        return $bySchool;
    }

    /**
     * Province -> city -> districts, rebuilt from the flat table.
     *
     * @return array<string, array<string, list<string>>>
     */
    private function geography(): array
    {
        $nested = [];

        $rows = Geography::query()
            ->orderBy('province')->orderBy('city')->orderBy('district')
            ->get();

        foreach ($rows as $row) {
            $nested[$row->province][$row->city][] = $row->district;
        }

        return $nested;
    }
}
