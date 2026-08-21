<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\EvaluationService;
use App\Http\Controllers\Controller;
use App\Http\Resources\DomainJson;
use App\Models\Scholarship;
use App\Persistence\Repositories\AwardRepository;
use App\Persistence\Repositories\ScholarshipRepository;
use App\Persistence\Repositories\StudentRepository;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Who qualifies for a scholarship, and why not.
 *
 * The read behind the assign screen. Four verdicts come back per student and
 * the distinction between two of them is the whole point: PendingVerification
 * means a human has not ticked something yet, NotEligible means a rule said no.
 * Collapsing them would turn administrative backlog into denied scholarships.
 */
final class EligibilityController extends Controller
{
    public function __construct(
        private readonly ScholarshipRepository $scholarships,
        private readonly StudentRepository $students,
        private readonly AwardRepository $awards,
        private readonly EvaluationService $evaluation = new EvaluationService,
    ) {}

    public function index(Request $request, Scholarship $scholarship): JsonResponse
    {
        $domain = $this->scholarships->find($scholarship->id);

        // Every enrolled student is the ranking population, always. A cohort
        // rank rule ranks against the whole cohort rather than against whoever
        // this run happens to be targeting — otherwise targeting one student
        // puts them in the top 1% of a population of one.
        $population = $this->students->enrolled();

        $targets = $request->filled('students')
            ? $this->students->findMany((array) $request->query('students'))
            : $population;

        $results = $this->evaluation->evaluate(
            $domain,
            $targets,
            $this->awards->activeForScholarship($scholarship->id),
            $population,
        );

        return response()->json(['data' => DomainJson::encodeList($results)]);
    }
}
