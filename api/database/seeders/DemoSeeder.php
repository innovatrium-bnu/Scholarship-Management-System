<?php

namespace Database\Seeders;

use Database\Seeders\Demo\ApplicationGenerator;
use Database\Seeders\Demo\AwardGenerator;
use Database\Seeders\Demo\DonorGenerator;
use Database\Seeders\Demo\Row;
use Database\Seeders\Demo\ScholarshipCatalogue;
use Database\Seeders\Demo\StudentGenerator;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * A database somebody can look at.
 *
 * Reference data and four accounts make the application start. They do not make
 * it show anything: before this seeder, signing in led to a dashboard with no
 * scholarships, a register with no students and a review queue with no
 * applications. Every screen rendered its empty state correctly, which is not
 * the same as working.
 *
 * This is the demo set DatabaseSeeder has named as missing since the schema
 * landed. It generates roughly 2,000 students, eleven scholarships, six hundred
 * awards and four hundred applications, all of it by arithmetic — see
 * Demo\Draw for why none of it may come from anywhere else.
 *
 * ## Two guards, and why each is where it is
 *
 * It refuses to run in production. Not because someone would type the command
 * on purpose, but because `db:seed` with no arguments runs DatabaseSeeder, and
 * the day this is added there is a real chance of two thousand invented students
 * landing in a register the university is using.
 *
 * It refuses to run over an existing register. There is no sensible merge
 * between generated students and real ones, and a seeder that inserted anyway
 * would produce a register nobody could separate again. Set DEMO_REPLACE=1 to
 * clear the demo tables first; that is deliberately a thing you have to type,
 * and an environment variable rather than a command flag because db:seed's
 * signature is Laravel's and asking Command::option() for one it does not
 * declare throws.
 *
 * ## Why the whole thing is one transaction
 *
 * Every table here has a foreign key into another one, and the generators build
 * rows referring to each other before any of them is written. A partial insert
 * is not a smaller demo database — it is awards pointing at students that were
 * never created. Either all of it lands or none of it does.
 */
class DemoSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * How many students, unless DEMO_STUDENTS says otherwise.
     *
     * 2,000 is what BNU asked for. AGENTS.md sizes the real register at 5,000,
     * so this is the same order of magnitude and exercises the same paths — in
     * particular the ORA-01795 limit on IN lists, which every repository taking
     * a list of ids routes through ChunkedIn to survive.
     *
     * Configurable because DemoSeederTest runs the whole pipeline and has no
     * reason to spend the time on two thousand of them.
     */
    public const STUDENTS = 2000;

    /**
     * How many students this run should generate, if anything has said.
     *
     * A property rather than only an environment variable because a test that
     * wants 200 has to be able to say so without reaching for putenv and
     * hoping Laravel's env repository has not cached the old value. Set it and
     * call run(); leave it alone and DEMO_STUDENTS decides, then the constant.
     */
    public ?int $students = null;

    /**
     * Cleared, in this order, when DEMO_REPLACE is set.
     *
     * Children before parents. Nothing here is a reference table: schools,
     * programmes, batches, semesters, quotas, geography and fee heads are what
     * the application needs to function at all, and re-seeding a demo must not
     * take them out from under the scholarships that point at them.
     *
     * users is absent for the same reason — an account somebody is signed in
     * with is not demo data.
     */
    private const DEMO_TABLES = [
        'application_decisions',
        'application_documents',
        'need_applications',
        // Before awards and before donations: fund_allocations points at both.
        'fund_allocations',
        'revocations',
        'award_components',
        'awards',
        'assignment_batches',
        // Receipts before the pledges and donors they point at.
        'donations',
        'pledge_instalments',
        'pledges',
        'cgpa_thresholds',
        'eligibility_criteria',
        'scholarship_rules',
        'coverage_lines',
        'scholarships',
        // After scholarships, which carry a donor_id.
        'donors',
        'students',
        'domain_events',
        'audit_entries',
    ];

    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->error('  DemoSeeder refuses to run in production.');

            return;
        }

        if (! $this->clearOrRefuse()) {
            return;
        }

        $students = (new StudentGenerator)->generate($this->howMany());

        $catalogue = new ScholarshipCatalogue;
        $scholarshipTables = $catalogue->build();
        $ids = $catalogue->ids();

        $awardGenerator = new AwardGenerator($ids);
        $awardTables = $awardGenerator->build($students);

        $applicationTables = (new ApplicationGenerator(
            $ids[ScholarshipCatalogue::NEED],
            $awardGenerator->currentTermNeedAwards(),
        ))->build($students);

        /*
         * Donors come last because they allocate against awards that already
         * exist, and they hand back the scholarship links rather than reaching
         * into rows another generator owns.
         *
         * The link migration backfills a donor per distinct donor_name already
         * in the scholarships table, which is right for a real database and does
         * nothing here: migrations run before seeders, so there is no
         * scholarship yet to read a name from.
         */
        $donorGenerator = new DonorGenerator($ids, $awardTables['awards']);
        $donorTables = $donorGenerator->build();

        $links = $donorGenerator->scholarshipLinks();

        foreach ($scholarshipTables['scholarships'] as $index => $scholarship) {
            if (isset($links[$scholarship['id']])) {
                $scholarshipTables['scholarships'][$index]['donor_id'] = $links[$scholarship['id']];
            }
        }

        /*
         * Merged rather than written in three passes, because domain_events and
         * audit_entries are appended to by both the award and application
         * generators. Two inserts into one table is not wrong, but one list per
         * table keeps the write order below readable as what it is: parents,
         * then children, then the log.
         */
        $tables = ['students' => $students] + $scholarshipTables;

        foreach ([$awardTables, $applicationTables, $donorTables] as $group) {
            foreach ($group as $table => $rows) {
                $tables[$table] = array_merge($tables[$table] ?? [], $rows);
            }
        }

        DB::transaction(function () use ($tables) {
            foreach ($this->writeOrder($tables) as $table => $rows) {
                if ($rows !== []) {
                    Row::insert($table, $rows);
                }
            }
        });

        $this->report($tables);
    }

    /** How many students to generate: the caller, then the environment, then 2,000. */
    private function howMany(): int
    {
        return $this->students ?? (int) (env('DEMO_STUDENTS') ?: self::STUDENTS);
    }

    /**
     * The order the tables can actually be written in.
     *
     * Derived from DEMO_TABLES reversed — that list is a valid delete order, so
     * reversing it is a valid insert order, and keeping one list means a table
     * added later cannot be cleared but not written, or the other way round.
     *
     * @param  array<string, list<array<string, mixed>>>  $tables
     * @return array<string, list<array<string, mixed>>>
     */
    private function writeOrder(array $tables): array
    {
        $ordered = [];

        foreach (array_reverse(self::DEMO_TABLES) as $table) {
            if (isset($tables[$table])) {
                $ordered[$table] = $tables[$table];
            }
        }

        return $ordered;
    }

    /**
     * Make room, or say why not.
     *
     * Truncation would be faster and is not used: `students` is the parent of
     * awards and applications, and TRUNCATE against a referenced table raises
     * ORA-02266 rather than cascading. Deleting in child-first order is the
     * thing that actually works here.
     */
    private function clearOrRefuse(): bool
    {
        $existing = DB::table('students')->count();

        if ($existing === 0) {
            return true;
        }

        if (! filter_var(env('DEMO_REPLACE', false), FILTER_VALIDATE_BOOL)) {
            $this->command?->warn(
                "  The register already holds {$existing} students. DemoSeeder will not add to it."
            );
            $this->command?->line(
                '  Re-run with DEMO_REPLACE=1 to clear the demo tables first, or use migrate:fresh --seed.'
            );

            return false;
        }

        DB::transaction(function () {
            foreach (self::DEMO_TABLES as $table) {
                DB::table($table)->delete();
            }
        });

        return true;
    }

    /**
     * Say what landed.
     *
     * Worth the lines: the counts are the only thing that distinguishes a
     * seeder that ran from a seeder that ran and produced almost nothing
     * because a filter was one comparison off.
     *
     * @param  array<string, list<array<string, mixed>>>  $tables
     */
    private function report(array $tables): void
    {
        foreach ($tables as $table => $rows) {
            $this->command?->line(sprintf('  %-24s %6d', $table, count($rows)));
        }
    }
}
