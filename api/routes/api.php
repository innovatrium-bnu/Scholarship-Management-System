<?php

use App\Auth\RoleMatrix;
use App\Http\Controllers\Api\ApplicationController;
use App\Http\Controllers\Api\AssignmentController;
use App\Http\Controllers\Api\AuditController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AwardController;
use App\Http\Controllers\Api\CriteriaController;
use App\Http\Controllers\Api\DonorController;
use App\Http\Controllers\Api\EligibilityController;
use App\Http\Controllers\Api\EventController;
use App\Http\Controllers\Api\FeeHeadController;
use App\Http\Controllers\Api\FundController;
use App\Http\Controllers\Api\ReferenceController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\ScholarshipController;
use App\Http\Controllers\Api\StudentController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| The API the SPA calls
|--------------------------------------------------------------------------
|
| One endpoint per operation in src/lib/scholarship/store.tsx, which is the
| specification: the frontend already implements every one of these flows
| against an in-memory context, and Phase 10 swaps that backing for these
| routes without changing a screen.
|
| Everything except login is behind auth:sanctum. Writes carry a `can:` gate
| naming a capability from src/lib/scholarship/roles.ts, which until now could
| only describe what a role may do. The gates are registered from
| App\Auth\RoleMatrix in AppServiceProvider.
|
| Reads are gated on authentication alone, with one exception: the application
| queue names applications.read explicitly. Every role happens to hold that
| capability, so today the two are equivalent — but roles.ts states it as a
| permission rather than assuming it, and a role added later that should not
| read applications would otherwise get in silently.
|
| Two ordering rules matter and are marked where they apply: a literal segment
| must be declared before the wildcard that would otherwise swallow it.
|
*/

/* -- Authentication ------------------------------------------------------- */

// The only unauthenticated route. Clients call GET /sanctum/csrf-cookie first;
// Sanctum registers that one itself.
//
// Rate limited, because it is the one door that opens without a session and it
// had no limit at all: twenty-five wrong passwords in a row all answered 422
// and never 429.
//
// The limit lives in the controller rather than as `throttle:` middleware here,
// and that difference matters on this deployment. Route middleware counts every
// request, successful ones included, so a shared campus IP -- BNU NATs its
// traffic -- would burn its allowance on staff signing in correctly at nine
// o'clock and lock out the office. Counting only failures is the behaviour
// wanted: an honest user never consumes the budget.
Route::post('auth/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);

    /* -- Reference data --------------------------------------------------- */

    Route::get('reference', [ReferenceController::class, 'index']);

    // Fee heads define the vocabulary coverage is written in, so editing them
    // is the same permission as editing a scholarship.
    Route::post('fee-heads', [FeeHeadController::class, 'store'])
        ->middleware('can:'.RoleMatrix::SCHOLARSHIPS_EDIT);
    Route::delete('fee-heads/{name}', [FeeHeadController::class, 'destroy'])
        ->middleware('can:'.RoleMatrix::SCHOLARSHIPS_EDIT);

    /* -- Scholarships ----------------------------------------------------- */

    Route::get('scholarships', [ScholarshipController::class, 'index']);

    Route::post('scholarships', [ScholarshipController::class, 'store'])
        ->middleware('can:'.RoleMatrix::SCHOLARSHIPS_EDIT);

    // Before {scholarship}, or "precedence" is read as an id.
    Route::put('scholarships/precedence', [ScholarshipController::class, 'reorder'])
        ->middleware('can:'.RoleMatrix::SCHOLARSHIPS_EDIT);

    Route::get('scholarships/{scholarship}', [ScholarshipController::class, 'show']);

    Route::patch('scholarships/{scholarship}', [ScholarshipController::class, 'update'])
        ->middleware('can:'.RoleMatrix::SCHOLARSHIPS_EDIT);
    Route::post('scholarships/{scholarship}/archive', [ScholarshipController::class, 'archive'])
        ->middleware('can:'.RoleMatrix::SCHOLARSHIPS_EDIT);
    Route::post('scholarships/{scholarship}/restore', [ScholarshipController::class, 'restore'])
        ->middleware('can:'.RoleMatrix::SCHOLARSHIPS_EDIT);

    Route::get('scholarships/{scholarship}/criteria', [CriteriaController::class, 'show']);

    // The Scholarship Committee judges applications against these thresholds
    // and deliberately cannot edit them.
    Route::put('scholarships/{scholarship}/criteria', [CriteriaController::class, 'update'])
        ->middleware('can:'.RoleMatrix::CRITERIA_EDIT);

    Route::get('scholarships/{scholarship}/eligibility', [EligibilityController::class, 'index']);

    // Every scholarship's criteria in one request; the review queue needs the
    // lot rather than one at a time.
    Route::get('criteria', [CriteriaController::class, 'index']);

    /* -- Assignment ------------------------------------------------------- */

    Route::get('assignments', [AssignmentController::class, 'index']);

    Route::post('scholarships/{scholarship}/assignments', [AssignmentController::class, 'store'])
        ->middleware('can:'.RoleMatrix::AWARDS_MANAGE);
    Route::delete('assignments/{batch}', [AssignmentController::class, 'destroy'])
        ->middleware('can:'.RoleMatrix::AWARDS_MANAGE);

    /* -- Students --------------------------------------------------------- */

    Route::get('students', [StudentController::class, 'index']);
    Route::get('students/{student}', [StudentController::class, 'show']);
    Route::get('students/{student}/coverage', [StudentController::class, 'coverage']);

    Route::patch('students/{student}', [StudentController::class, 'update'])
        ->middleware('can:'.RoleMatrix::STUDENTS_EDIT);

    /* -- Awards ----------------------------------------------------------- */

    Route::get('awards', [AwardController::class, 'index']);

    Route::patch('awards/{award}/components', [AwardController::class, 'updateComponents'])
        ->middleware('can:'.RoleMatrix::AWARDS_MANAGE);
    Route::post('awards/{award}/revoke', [AwardController::class, 'revoke'])
        ->middleware('can:'.RoleMatrix::AWARDS_MANAGE);

    /* -- Need-based applications ------------------------------------------ */

    Route::get('applications', [ApplicationController::class, 'index'])
        ->middleware('can:'.RoleMatrix::APPLICATIONS_READ);

    // Intake, from the admission portal rather than from a student.
    Route::post('applications', [ApplicationController::class, 'store'])
        ->middleware('can:'.RoleMatrix::APPLICATIONS_DECIDE);

    // Before {application}, for the same reason as precedence above.
    Route::post('applications/reject', [ApplicationController::class, 'rejectMany'])
        ->middleware('can:'.RoleMatrix::APPLICATIONS_DECIDE);

    Route::get('applications/{application}', [ApplicationController::class, 'show'])
        ->middleware('can:'.RoleMatrix::APPLICATIONS_READ);

    Route::post('applications/{application}/decision', [ApplicationController::class, 'decide'])
        ->middleware('can:'.RoleMatrix::APPLICATIONS_DECIDE);
    Route::post('applications/{application}/reopen', [ApplicationController::class, 'reopen'])
        ->middleware('can:'.RoleMatrix::APPLICATIONS_DECIDE);

    /* -- Donors and funds -------------------------------------------------- */

    /*
     * Reads name donors.read explicitly rather than resting on auth:sanctum.
     * Every role holds it today, so the two are equivalent — but donor finances
     * are the likeliest thing a role added later is scoped out of, and the
     * applications queue already sets this precedent for the same reason.
     */
    Route::get('donors', [DonorController::class, 'index'])
        ->middleware('can:'.RoleMatrix::DONORS_READ);

    // Before {donor}, or "summary" is read as an id.
    Route::get('funds/summary', [FundController::class, 'summary'])
        ->middleware('can:'.RoleMatrix::DONORS_READ);

    Route::post('donors', [DonorController::class, 'store'])
        ->middleware('can:'.RoleMatrix::DONORS_MANAGE);

    Route::get('donors/{donor}', [DonorController::class, 'show'])
        ->middleware('can:'.RoleMatrix::DONORS_READ);

    Route::patch('donors/{donor}', [DonorController::class, 'update'])
        ->middleware('can:'.RoleMatrix::DONORS_MANAGE);
    Route::post('donors/{donor}/archive', [DonorController::class, 'archive'])
        ->middleware('can:'.RoleMatrix::DONORS_MANAGE);
    Route::post('donors/{donor}/restore', [DonorController::class, 'restore'])
        ->middleware('can:'.RoleMatrix::DONORS_MANAGE);

    Route::post('donors/{donor}/pledges', [DonorController::class, 'storePledge'])
        ->middleware('can:'.RoleMatrix::DONORS_MANAGE);
    Route::post('pledges/{pledge}/cancel', [DonorController::class, 'cancelPledge'])
        ->middleware('can:'.RoleMatrix::DONORS_MANAGE);

    Route::post('donors/{donor}/donations', [FundController::class, 'store'])
        ->middleware('can:'.RoleMatrix::DONORS_MANAGE);

    Route::post('donations/{donation}/allocations', [FundController::class, 'allocate'])
        ->middleware('can:'.RoleMatrix::DONORS_MANAGE);

    /*
     * POST, not DELETE. Releasing is not a deletion — the row survives with a
     * reason and the name of whoever released it — and it carries a body, which
     * DELETE has nowhere good to put.
     */
    Route::post('allocations/{allocation}/release', [FundController::class, 'release'])
        ->middleware('can:'.RoleMatrix::DONORS_MANAGE);

    /* -- Reporting and history -------------------------------------------- */

    Route::get('reports/summary', [ReportController::class, 'summary']);
    Route::get('audit', [AuditController::class, 'index']);

    // The countable log the dashboard reads, whole and unpaginated.
    Route::get('events', [EventController::class, 'index']);
});
