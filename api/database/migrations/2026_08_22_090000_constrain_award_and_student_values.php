<?php

declare(strict_types=1);

use App\Domain\Support\EnrollmentStatus;
use App\Domain\Support\HouseholdOptions;
use App\Domain\Support\RevocationCause;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Puts the rules the application checks into the database as well.
 *
 * Three of these were validated nowhere and one only in PHP. Every one of them
 * is a closed set or an invariant that money depends on, and every one of them
 * was reachable with a single HTTP request:
 *
 *   - a student could hold the same scholarship twice, and the merge paid both,
 *     so a 50% scholarship paid 90%;
 *   - enrollment_status accepted any string;
 *   - revocations.cause accepted any string, and it is what the per-term
 *     gained/lost report groups by.
 *
 * Validation in the request layer is where a person gets a readable message.
 * A constraint here is what makes the rule true regardless of which endpoint,
 * seeder, artisan command or DBA session wrote the row — and, for the award
 * one, what makes it hold under two writers racing, where an application-level
 * check has already read stale rows by the time it decides.
 */
return new class extends Migration
{
    public function up(): void
    {
        /*
         * One active award per student per scholarship.
         *
         * A function-based unique index rather than a plain one, because the
         * rule only applies to Active rows: a student may hold a scholarship,
         * lose it, and be granted it again, and both rows have to coexist.
         *
         * Oracle does not index a row whose key expressions are all NULL, so
         * every Revoked row falls out of the index entirely and only the Active
         * ones are constrained. That is the standard Oracle spelling of a
         * partial index, and it is why the CASE appears twice rather than once
         * with a WHERE clause, which Oracle does not have.
         */
        DB::statement(
            "CREATE UNIQUE INDEX awards_one_active_per_scholarship
             ON awards (
                 CASE WHEN status = 'Active' THEN student_reg_no END,
                 CASE WHEN status = 'Active' THEN scholarship_id END
             )"
        );

        $this->constrainToSet('students', 'enrollment_status', EnrollmentStatus::ALL);
        $this->constrainToSet('revocations', 'cause', RevocationCause::ALL);
        $this->constrainToSet(
            'need_applications',
            'household_guardian_status',
            HouseholdOptions::GUARDIAN_STATUSES
        );
        $this->constrainToSet(
            'need_applications',
            'household_residence',
            HouseholdOptions::RESIDENCE_KINDS
        );
    }

    public function down(): void
    {
        DB::statement('DROP INDEX awards_one_active_per_scholarship');
        DB::statement('ALTER TABLE students DROP CONSTRAINT students_enrollment_status_check');
        DB::statement('ALTER TABLE revocations DROP CONSTRAINT revocations_cause_check');
        DB::statement(
            'ALTER TABLE need_applications
             DROP CONSTRAINT need_applications_household_guardian_status_check'
        );
        DB::statement(
            'ALTER TABLE need_applications
             DROP CONSTRAINT need_applications_household_residence_check'
        );
    }

    /**
     * A CHECK constraint naming every value the column may hold.
     *
     * Quoted by hand rather than bound, because a CHECK constraint is DDL and
     * carries no bind variables. The values come from a PHP constant, not from
     * input, and the escaping is here so that stays true if one ever contains
     * an apostrophe.
     *
     * @param  list<string>  $allowed
     */
    private function constrainToSet(string $table, string $column, array $allowed): void
    {
        $values = implode(', ', array_map(
            fn (string $value) => "'".str_replace("'", "''", $value)."'",
            $allowed
        ));

        DB::statement(
            "ALTER TABLE {$table}
             ADD CONSTRAINT {$table}_{$column}_check
             CHECK ({$column} IN ({$values}))"
        );
    }
};
