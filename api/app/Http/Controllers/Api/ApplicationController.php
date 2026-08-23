<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Support\HouseholdOptions;
use App\Http\Actor;
use App\Http\Controllers\Controller;
use App\Http\Resources\DomainJson;
use App\Models\Award;
use App\Models\NeedApplication;
use App\Persistence\ApplicationScreener;
use App\Persistence\Repositories\NeedApplicationRepository;
use App\Persistence\ScreenedApplication;
use App\Persistence\Writers\ApplicationWriter;
use App\Persistence\Writers\AuditWriter;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The need-based review queue.
 *
 * The screening now happens here rather than in the browser. useApplications.ts
 * computes it client-side today because there is nowhere else to compute it;
 * once Phase 10 points at this endpoint, the verdict a reviewer sees is the same
 * one the server would act on, which is the point of moving it.
 */
final class ApplicationController extends Controller
{
    public function __construct(
        private readonly ApplicationScreener $screener,
        private readonly NeedApplicationRepository $applications,
        private readonly ApplicationWriter $writer,
        private readonly AuditWriter $audit,
    ) {}

    /**
     * The whole queue, screened.
     *
     * Four queries regardless of size — see ApplicationScreener. Not paginated,
     * because the screening needs every live application to decide which ones
     * are duplicates of each other, and a page cannot answer that about rows it
     * cannot see.
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => array_map($this->present(...), $this->screener->screenQueue()),
        ]);
    }

    public function show(NeedApplication $application): JsonResponse
    {
        $screened = $this->screener->screenQueue();

        foreach ($screened as $entry) {
            if ($entry->application->id === $application->id) {
                return response()->json(['data' => $this->present($entry)]);
            }
        }

        // Reachable when the student or the criteria are missing, which is the
        // one case the screener skips rather than guesses at. The application
        // is still real, so it is returned unscreened rather than as a 404.
        return response()->json([
            'data' => [
                'application' => DomainJson::encode($this->applications->find($application->id)),
                'screening' => null,
            ],
        ]);
    }

    /**
     * Take in one application.
     *
     * Students do not log in here — this system is the Registrar Office's, and
     * applications reach it from the admission portal. store.tsx keeps the same
     * door open and says why: so the intake has one audited entry point rather
     * than being invented twice when that import is built.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'studentRegNo' => ['required', 'string', Rule::exists('students', 'reg_no')],
            'scholarshipId' => ['required', 'string', Rule::exists('scholarships', 'id')],
            'semester' => ['required', 'string', Rule::exists('semesters', 'label')],
            'submittedAt' => ['required', 'date'],
            'statement' => ['required', 'string'],
            'requestedPct' => ['required', 'numeric', 'min:0', 'max:100'],

            'household.monthlyIncome' => ['required', 'numeric', 'min:0'],
            'household.earningMembers' => ['required', 'integer', 'min:0'],
            'household.dependants' => ['required', 'integer', 'min:0'],
            'household.siblingsAtBNU' => ['required', 'integer', 'min:0'],
            'household.guardianOccupation' => ['required', 'string', 'max:255'],
            // Closed sets in types.ts, and the household declaration is the
            // evidence a need assessment rests on -- nothing downstream reads
            // these, so a typo would never surface on its own.
            'household.guardianStatus' => ['required', Rule::in(HouseholdOptions::GUARDIAN_STATUSES)],
            'household.residence' => ['required', Rule::in(HouseholdOptions::RESIDENCE_KINDS)],
            'household.monthlyRent' => ['sometimes', 'numeric', 'min:0'],
            'household.ownsVehicle' => ['sometimes', 'boolean'],

            'documents' => ['sometimes', 'array'],
            'documents.*.kind' => ['required', 'string', 'max:255'],
            'documents.*.fileName' => ['required', 'string', 'max:255'],
            'documents.*.uploadedAt' => ['required', 'date'],
            'documents.*.verified' => ['sometimes', 'boolean'],
        ]);

        $application = DB::transaction(function () use ($validated, $request) {
            $household = $validated['household'];

            $created = NeedApplication::create([
                'student_reg_no' => $validated['studentRegNo'],
                'scholarship_id' => $validated['scholarshipId'],
                'semester' => $validated['semester'],
                'submitted_at' => $validated['submittedAt'],
                'household_monthly_income' => $household['monthlyIncome'],
                'household_earning_members' => $household['earningMembers'],
                'household_dependants' => $household['dependants'],
                'household_siblings_at_bnu' => $household['siblingsAtBNU'],
                'household_guardian_occupation' => $household['guardianOccupation'],
                'household_guardian_status' => $household['guardianStatus'],
                'household_residence' => $household['residence'],
                'household_monthly_rent' => $household['monthlyRent'] ?? 0,
                'household_owns_vehicle' => $household['ownsVehicle'] ?? false,
                'statement' => $validated['statement'],
                'requested_pct' => $validated['requestedPct'],
                'status' => 'Submitted',
            ]);

            foreach ($validated['documents'] ?? [] as $document) {
                $created->documents()->create([
                    'kind' => $document['kind'],
                    'file_name' => $document['fileName'],
                    'uploaded_at' => $document['uploadedAt'],
                    'verified' => $document['verified'] ?? false,
                ]);
            }

            $this->audit->record(
                entityType: 'Application',
                entityId: $created->id,
                action: 'Application received for '.$validated['semester'],
                actor: Actor::from($request),
            );

            return $created;
        });

        return response()->json(['data' => DomainJson::encode(
            $this->applications->find($application->id)
        )], 201);
    }

    public function decide(Request $request, NeedApplication $application): JsonResponse
    {
        if ($application->decision !== null) {
            return response()->json([
                'message' => 'This application has already been decided. Reopen it first.',
            ], 409);
        }

        $validated = $request->validate([
            'outcome' => ['required', Rule::in(['Approved', 'Rejected', 'On hold'])],
            'reason' => ['required', 'string'],
            // Only meaningful on approval; defaults to what the student asked
            // for, which is what store.tsx does.
            'awardedPct' => ['nullable', 'numeric', 'min:0', 'max:100'],
            /*
             * `automatic` is deliberately not accepted from the client.
             *
             * It marks a decision the criteria filter made rather than a
             * person, and it is the column a report groups by to tell the two
             * apart. AGENTS.md states the filter sorts and never decides, so
             * nothing reaching this endpoint is ever automatic: every request
             * here is a person pressing a button. Taking the flag from the
             * caller let a client label its own decision as the machine's,
             * which is DEF-03 again -- an identity supplied by whoever benefits
             * from it.
             */
        ]);

        /*
         * Approving grants an award, and a student may hold each scholarship
         * once. A renewal filed while last year's award is still live would
         * otherwise create a second one, and the merge pays both -- a 50%
         * scholarship paying 90%, with the student page listing the same name
         * twice. Refused here so the message names the fix.
         */
        if ($validated['outcome'] === 'Approved' && $this->alreadyHolds($application)) {
            return response()->json([
                'message' => 'This student already holds an active award for this scholarship. '
                    .'Revoke it before approving a renewal.',
            ], 409);
        }

        try {
            $decision = $this->writer->decide(
                $application,
                $validated['outcome'],
                $validated['reason'],
                Actor::from($request),
                $validated['awardedPct'] ?? null,
            );
        } catch (QueryException $e) {
            /*
             * Two reviewers pressed Approve on the same row.
             *
             * The checks above read rows; a race decides between the read and
             * the write, and only the database can settle it. Both unique
             * constraints that can fire here -- one decision per application,
             * one active award per student per scholarship -- mean the same
             * thing the sequential path already answers with 409, so this
             * answers it the same way rather than surfacing ORA-00001 and the
             * schema names to whoever pressed second.
             */
            if (! $this->isUniqueViolation($e)) {
                throw $e;
            }

            return response()->json([
                'message' => 'This application has just been decided by someone else. Reload it.',
            ], 409);
        }

        return response()->json([
            'data' => [
                'outcome' => $decision->outcome,
                'by' => $decision->decided_by,
                'role' => $decision->role,
                'at' => $decision->at->toIso8601ZuluString('millisecond'),
                'reason' => $decision->reason,
                'automatic' => $decision->automatic,
                'awardedPct' => $decision->awarded_pct,
                'awardId' => $decision->award_id,
            ],
        ], 201);
    }

    public function reopen(Request $request, NeedApplication $application): JsonResponse
    {
        // Nothing to reopen. Answering 200 wrote "Reopened application" into
        // the audit trail for an application that had never been closed --
        // the same no-op-reports-success shape archive() and revoke() refuse.
        if ($application->decision === null) {
            return response()->json([
                'message' => 'This application has not been decided, so there is nothing to reopen.',
            ], 409);
        }

        $validated = $request->validate(['reason' => ['required', 'string']]);

        $this->writer->reopen($application, $validated['reason'], Actor::from($request));

        return response()->json(['data' => DomainJson::encode(
            $this->applications->find($application->id)
        )]);
    }

    /**
     * Reject a screened batch in one sitting.
     */
    public function rejectMany(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'summary' => ['required', 'string'],
            'entries' => ['required', 'array', 'min:1'],
            'entries.*.id' => ['required', 'string', Rule::exists('need_applications', 'id')],
            'entries.*.reason' => ['required', 'string'],
        ]);

        $rejected = $this->writer->rejectMany(
            $validated['entries'],
            $validated['summary'],
            Actor::from($request),
        );

        return response()->json(['rejected' => $rejected]);
    }

    /**
     * Does this application's student already hold this scholarship?
     *
     * Asked of the awards table rather than of the screening verdict, because
     * the verdict is about the application and this is about the money.
     */
    private function alreadyHolds(NeedApplication $application): bool
    {
        return Award::query()
            ->where('student_reg_no', $application->student_reg_no)
            ->where('scholarship_id', $application->scholarship_id)
            ->where('status', 'Active')
            ->exists();
    }

    /**
     * Whether a database error is a uniqueness collision.
     *
     * Laravel maps this to UniqueConstraintViolationException for the drivers
     * it ships. The Oracle driver does not, so the code is read from the
     * message as well -- ORA-00001 is the only unique-constraint error Oracle
     * raises, and matching on the number rather than on a constraint name keeps
     * this working if a constraint is ever renamed.
     */
    private function isUniqueViolation(QueryException $e): bool
    {
        return $e instanceof UniqueConstraintViolationException
            || str_contains($e->getMessage(), 'ORA-00001');
    }

    /**
     * @return array<string, mixed>
     */
    private function present(ScreenedApplication $entry): array
    {
        return [
            'application' => DomainJson::encode($entry->application),
            'student' => DomainJson::encode($entry->student),
            'existingCoveragePct' => $entry->existingCoveragePct,
            'screening' => DomainJson::encode($entry->screening),
        ];
    }
}
