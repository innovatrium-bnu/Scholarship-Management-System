<?php

declare(strict_types=1);

use App\Models\Award;
use App\Models\NeedApplication;
use App\Models\Scholarship;
use App\Models\Student;
use App\Persistence\Repositories\AwardRepository;
use App\Persistence\Repositories\ScholarshipRepository;
use App\Persistence\Repositories\StudentRepository;
use Database\Seeders\DemoSeeder;
use Database\Seeders\ReferenceSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The demo seeder against a real schema.
 *
 * DemoDataTest checks the generators in isolation and is fast. This runs the
 * whole thing — build, insert, read back — because the failures it is looking
 * for only exist once there is a database: a foreign key nothing satisfies, a
 * date Oracle will not convert, a CLOB that is not JSON, an award pointing at a
 * student who was filtered out two steps earlier.
 *
 * 300 students rather than 2,000. Every relationship this asserts holds at
 * either size, and the difference is twelve seconds a run.
 */
const DEMO_SIZE = 300;

beforeEach(function () {
    $this->seed(ReferenceSeeder::class);

    $seeder = app(DemoSeeder::class);
    $seeder->students = DEMO_SIZE;
    $seeder->run();
});

/* -- it landed ------------------------------------------------------------ */

it('writes a register, a catalogue, awards and a queue', function () {
    expect(Student::count())->toBe(DEMO_SIZE)
        ->and(Scholarship::count())->toBe(11)
        ->and(Award::count())->toBeGreaterThan(0)
        ->and(NeedApplication::count())->toBeGreaterThan(0);
});

it('gives every scholarship a distinct precedence, with no gaps', function () {
    // The frontend runs its own copy of the merge and takes the order it is
    // given. A duplicate or a gap here computes different money in the browser
    // from in the database, and neither side raises anything.
    $precedence = Scholarship::orderBy('precedence')->pluck('precedence')->all();

    expect($precedence)->toBe(range(0, count($precedence) - 1));
});

it('gives every scholarship a real ULID rather than a slug', function () {
    // The id column is CHAR(26). A shorter value inserts, comes back
    // blank-padded, and stops matching itself.
    foreach (Scholarship::pluck('id') as $id) {
        expect(strlen($id))->toBe(26)
            ->and($id)->toMatch('/^[0-9A-HJKMNP-TV-Z]{26}$/');
    }
});

/* -- nothing points at nothing --------------------------------------------- */

it('leaves no award, application or component pointing at a row that is not there', function () {
    $regNos = Student::pluck('reg_no')->all();
    $scholarshipIds = Scholarship::pluck('id')->all();
    $awardIds = Award::pluck('id')->all();

    $problems = [];

    foreach (Award::all() as $award) {
        if (! in_array($award->student_reg_no, $regNos, true)) {
            $problems[] = "award {$award->id} has no student";
        }

        if (! in_array($award->scholarship_id, $scholarshipIds, true)) {
            $problems[] = "award {$award->id} has no scholarship";
        }
    }

    foreach (NeedApplication::all() as $application) {
        if (! in_array($application->student_reg_no, $regNos, true)) {
            $problems[] = "application {$application->id} has no student";
        }
    }

    foreach (DB::table('award_components')->pluck('award_id') as $awardId) {
        if (! in_array($awardId, $awardIds, true)) {
            $problems[] = "component of missing award {$awardId}";
        }
    }

    expect($problems)->toBe([]);
});

it('gives every award at least one component', function () {
    // A coverage line is skipped when it does not apply to the student — a
    // hostel waiver for someone living at home. An award where every line was
    // skipped would be an award that pays nothing, shown as if it paid.
    $componentCounts = DB::table('award_components')
        ->select('award_id', DB::raw('count(*) as total'))
        ->groupBy('award_id')
        ->pluck('total', 'award_id');

    $empty = Award::pluck('id')->filter(fn ($id) => ! isset($componentCounts[$id]));

    expect($empty->all())->toBe([]);
});

it('gives every revoked award a revocation and every revocation a revoked award', function () {
    $revokedAwards = Award::where('status', 'Revoked')->pluck('id')->sort()->values()->all();
    $revocations = DB::table('revocations')->pluck('award_id')->sort()->values()->all();

    expect($revocations)->toBe($revokedAwards);
});

it('links every approval to the award it produced', function () {
    // The provenance chain the schema allows and seed.ts never filled in:
    // application, decision, award. An approval with no award is the demo
    // teaching that approving does not pay anybody.
    $problems = [];
    $awardIds = Award::pluck('id')->all();

    foreach (DB::table('application_decisions')->where('outcome', 'Approved')->get() as $decision) {
        if ($decision->award_id === null) {
            $problems[] = "approval {$decision->id} produced no award";
        } elseif (! in_array($decision->award_id, $awardIds, true)) {
            $problems[] = "approval {$decision->id} names a missing award";
        }
    }

    expect($problems)->toBe([]);
});

it('agrees with itself about which applications were decided', function () {
    $decided = DB::table('application_decisions')->pluck('application_id')->sort()->values()->all();
    $settled = NeedApplication::whereIn('status', ['Approved', 'Rejected', 'On hold'])
        ->pluck('id')->sort()->values()->all();

    expect($decided)->toBe($settled);
});

/* -- what the screens will read -------------------------------------------- */

it('reads back through the repositories the API actually uses', function () {
    // The point of this one is the mappers. Every column written by the seeder
    // is read by a mapper into a domain object with typed constructor
    // arguments, so a null where the domain wants an int is a TypeError here
    // and a 500 in production.
    $scholarships = app(ScholarshipRepository::class)->all();
    $students = app(StudentRepository::class)->enrolled();
    $awards = app(AwardRepository::class)->allActive();

    expect($scholarships)->toHaveCount(11)
        ->and(count($students))->toBe(Student::where('enrollment_status', 'Enrolled')->count())
        ->and(count($awards))->toBe(Award::where('status', 'Active')->count());
});

it('hands numeric rule thresholds back as numbers', function () {
    // The defect that makes a 3.0 student come back Eligible. The column is
    // varchar2 because types.ts types the field `string | number`, and a
    // threshold left as the string "3.7" fails the is_numeric && ! is_string
    // test in passesAutomatic, so the CGPA comparison never runs.
    $withThresholds = [];

    foreach (app(ScholarshipRepository::class)->all() as $scholarship) {
        foreach ([...$scholarship->awardRules, ...$scholarship->retentionRules] as $rule) {
            if ($rule->threshold !== null) {
                $withThresholds[] = $rule->threshold;
            }
        }
    }

    expect($withThresholds)->not->toBeEmpty();

    foreach ($withThresholds as $threshold) {
        expect(is_string($threshold))->toBeFalse();
    }
});

it('grants awards only to students who are enrolled', function () {
    $notEnrolled = Student::where('enrollment_status', '!=', 'Enrolled')->pluck('reg_no');

    // The one exception is the archived bursary, whose holders have since
    // graduated. Its awards are all revoked, which is what archiving did.
    $live = Award::where('status', 'Active')->whereIn('student_reg_no', $notEnrolled)->count();

    expect($live)->toBe(0);
});

it('dates every award on the first day of a term', function () {
    // ReportService groups by semester and compares dates with strcmp. A date
    // that is not a term start sorts into the wrong bar without erroring.
    $problems = [];

    foreach (Award::all() as $award) {
        $date = $award->effective_from->format('Y-m-d');

        if (! preg_match('/^\d{4}-(02|09)-01$/', $date)) {
            $problems[] = "{$award->id} starts on {$date}";
        }
    }

    expect($problems)->toBe([]);
});

it('spreads grants across more than one term, and revokes in some of them', function () {
    // One date means one bar on the dashboard and five empty ones, which is
    // what seed.ts produced and the reason the counts there were hardcoded.
    //
    // Grants are asserted to spread and revocations only to happen: at 300
    // students there are few enough endings that they can land in one term, and
    // an assertion that only holds at 2,000 is an assertion that fails on a
    // Tuesday for reasons nobody wants to work out. The spread that matters is
    // the grants', because that is what the gained-per-term series is drawn from.
    $granted = DB::table('domain_events')->where('kind', 'award.granted')
        ->distinct()->pluck('semester');
    $revoked = DB::table('domain_events')->where('kind', 'award.revoked')->count();

    expect(count($granted))->toBeGreaterThan(2)
        ->and($revoked)->toBeGreaterThan(0);
});

it('writes an event and an audit line for everything that happened', function () {
    $grants = DB::table('domain_events')->where('kind', 'award.granted')->count();
    $revocations = DB::table('domain_events')->where('kind', 'award.revoked')->count();
    $decisions = DB::table('domain_events')->where('kind', 'application.decided')->count();

    expect($grants)->toBe(Award::count())
        ->and($revocations)->toBe(DB::table('revocations')->count())
        ->and($decisions)->toBe(DB::table('application_decisions')->count())
        ->and(DB::table('audit_entries')->count())
        ->toBe($grants + $revocations + $decisions);
});

/* -- the guards ------------------------------------------------------------- */

it('refuses to add to a register that already holds students', function () {
    $before = Student::count();

    $seeder = app(DemoSeeder::class);
    $seeder->students = DEMO_SIZE;
    $seeder->run();

    // No merge exists between generated students and real ones, so the second
    // run has to decline rather than double the register.
    expect(Student::count())->toBe($before);
});
