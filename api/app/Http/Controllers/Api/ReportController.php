<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\ReportService;
use App\Http\Controllers\Controller;
use App\Http\Resources\DomainJson;
use App\Models\Batch;
use App\Models\Semester;
use App\Persistence\Repositories\AwardRepository;
use App\Persistence\Repositories\DomainEventRepository;
use App\Persistence\Repositories\ScholarshipRepository;
use App\Persistence\Repositories\StudentRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The dashboard numbers.
 *
 * Counts come from the event log rather than from the awards table, and that is
 * deliberate: an award can end without surviving as a row at all, because
 * undoing a batch deletes its awards outright. The awards table only knows the
 * present, so "taken back this year" can only be answered by the log.
 *
 * Two of these were wrong when they were useMemo blocks in the dashboard route
 * — one counted revocations by the date the award started, the other silently
 * dropped a cohort by resolving a year to the first matching batch. Both are
 * fixed in ReportService and pinned by its tests; this endpoint just supplies
 * the rows.
 */
final class ReportController extends Controller
{
    public function __construct(
        private readonly DomainEventRepository $events,
        private readonly AwardRepository $awards,
        private readonly StudentRepository $students,
        private readonly ScholarshipRepository $scholarships,
        private readonly ReportService $reports = new ReportService,
    ) {}

    public function summary(Request $request): JsonResponse
    {
        $events = $this->events->all();
        $awards = $this->awards->allActive();
        $students = $this->students->enrolled();
        $scholarships = $this->scholarships->all();

        $batches = Batch::query()->orderBy('sort_order')->pluck('label')->all();
        $semesters = Semester::query()->orderBy('sort_order')->pluck('label')->all();

        $from = $request->query('from', date('Y').'-01-01');
        $to = $request->query('to', date('Y').'-12-31');

        $scholarRegNos = $this->reports->scholarRegNos($awards);

        // The intake years present in the batch labels, newest last, so the
        // chart has an x-axis without the caller inventing one.
        $years = array_values(array_unique(array_filter(array_map(
            fn (string $label) => preg_match('/([0-9]{4})/', $label, $m) ? $m[1] : null,
            $batches
        ))));

        return response()->json([
            'scholars' => count($scholarRegNos),
            'totalWaiverPKR' => $this->reports->totalWaiverPKR(
                $scholarRegNos, $students, $awards, $scholarships
            ),
            'grantedInRange' => count($this->reports->awardsGrantedBetween($events, $from, $to)),
            'revokedInRange' => count($this->reports->awardsRevokedBetween($events, $from, $to)),
            'bySemester' => $this->reports->grantedAndRevokedBySemester($events, $semesters),
            'byIntakeYear' => DomainJson::encode(
                $this->reports->scholarsByIntakeYear($awards, $students, $batches, $years)
            ),
            'range' => ['from' => $from, 'to' => $to],
        ]);
    }
}
