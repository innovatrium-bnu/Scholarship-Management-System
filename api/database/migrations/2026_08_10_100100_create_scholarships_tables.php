<?php

/**
 * Scholarships, and the two child collections that make up their terms.
 *
 * Mirrors the Scholarship / CoverageLine / Rule interfaces in
 * src/lib/scholarship/types.ts.
 *
 * A scholarship is never versioned. types.ts explains why: when terms change
 * you create a second scholarship pointed at the newer batches, so each one has
 * exactly one set of terms for life. That is why there is no `version` column
 * and no history table here — the history is the list of scholarships.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scholarships', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('name');
            $table->text('description');
            $table->string('study_level');   // Bachelors | Masters | Both

            /**
             * Precedence: which scholarship gets the fee first when two
             * overlap.
             *
             * In the prototype this was the array index in `scholarships[]` —
             * merge.ts built its priority map from `.map((s, i) => [s.id, i])`.
             * An array has no index in SQL, so it becomes a real column, and
             * every endpoint returning scholarships must ORDER BY it or the
             * frontend's display copy of the merge silently computes different
             * money from the server's.
             */
            $table->integer('precedence');

            /**
             * Scope. Which students this scholarship can reach.
             *
             * These are JSON arrays of reference names rather than join
             * tables. Three reasons: the frontend round-trips them verbatim as
             * string[], `batches` is explicitly a derived cache that
             * resolveBatches() keeps in step with batch_mode, and at this size
             * no query benefits from the join. The cost is no foreign key on
             * the contents — renaming a school will not cascade in here.
             *
             * On 19c these compile to CLOB. Oracle did not get a native JSON
             * column type until 21c, and json() on an older server_version is
             * how laravel-oci8 spells that. The IS JSON constraints added
             * after this table is created are what stop a CLOB called
             * `schools` from holding something that is not JSON at all.
             */
            $table->json('schools')->default('[]');
            $table->json('programmes')->default('[]');
            $table->json('batches')->default('[]');
            $table->string('batch_mode');            // all | list | onwards
            $table->string('batch_from')->nullable(); // only when mode is "onwards"

            $table->string('semester_from');
            $table->string('semester_till')->nullable();
            $table->boolean('all_semesters')->default(false);
            $table->string('review_cycle');          // Every semester | Annual

            $table->unsignedSmallInteger('max_duration_years');
            $table->unsignedSmallInteger('work_study_hours_per_month')->default(0);
            $table->boolean('requires_reapplication')->default(false);

            $table->string('funding_source');        // Internal | Donor
            $table->string('donor_name')->nullable();
            $table->unsignedInteger('quota_per_cohort')->nullable();

            // Archived, never deleted. Archiving optionally revokes the awards
            // that hang off it, which is why restore is a real operation.
            $table->string('status')->default('Active'); // Active | Archived
            $table->date('effective_from');

            // Lets this scholarship push a student past the 100% fee ceiling.
            $table->boolean('may_exceed_ceiling')->default(false);

            $table->timestamps();
            $table->index('status');
        });

        /**
         * Reordering precedence rewrites several rows at once, and any order of
         * UPDATEs passes through a state where two rows share a value. A plain
         * UNIQUE index rejects that halfway through; DEFERRABLE INITIALLY
         * DEFERRED checks once at COMMIT instead, so the constraint still holds
         * for anyone reading while the reorder is free to be messy inside its
         * transaction.
         */
        DB::statement(
            'ALTER TABLE scholarships
             ADD CONSTRAINT scholarships_precedence_unique
             UNIQUE (precedence) DEFERRABLE INITIALLY DEFERRED'
        );

        // What the scholarship pays, per fee head.
        Schema::create('coverage_lines', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('scholarship_id')
                ->constrained('scholarships')
                ->cascadeOnDelete();
            $table->string('fee_head');
            $table->string('benefit_kind'); // Percentage | Full waiver | Fixed amount

            // Percent (0-100) for Percentage, PKR for Fixed amount, ignored for
            // Full waiver. decimal rather than float: this is money, and the
            // PHP port has to reproduce the TypeScript results to the rupee.
            $table->decimal('value', 12, 2);

            $table->string('conditional_on')->nullable();
            $table->foreign('fee_head')->references('name')->on('fee_heads')->cascadeOnUpdate();
            $table->unique(['scholarship_id', 'fee_head']);
        });

        /**
         * Award rules (who qualifies) and retention rules (who keeps it).
         *
         * One table with a `rule_type` discriminator rather than two identical
         * tables, because Rule is one shape in types.ts and evaluate() applies
         * the same four kinds to both collections.
         */
        Schema::create('scholarship_rules', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('scholarship_id')
                ->constrained('scholarships')
                ->cascadeOnDelete();
            $table->string('rule_type');  // award | retention
            $table->string('kind');       // Automatic | Manual | Calculated score | Cohort rank

            // Automatic rules: a field/operator/threshold triple, e.g. cgpa >= 3.5.
            $table->string('field')->nullable();
            $table->string('operator')->nullable();
            // Thresholds are numeric or textual depending on the field, which
            // is why types.ts types this `string | number`.
            $table->string('threshold')->nullable();

            $table->text('description')->nullable();
            // Calculated score: field name -> weight. CLOB on 19c, as above.
            $table->json('weights')->nullable();
            // Cohort rank: "top N percent of the cohort".
            $table->decimal('percentile', 5, 2)->nullable();

            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->index(['scholarship_id', 'rule_type']);
        });

        /**
         * Make the CLOBs prove they are JSON.
         *
         * Postgres refused to store a malformed jsonb value; a CLOB will hold
         * anything at all, and the failure would surface much later as a
         * json_decode() returning null somewhere far from the write. IS JSON
         * puts the check back where it was, at the column.
         *
         * Oracle allows a check constraint on a LOB column only in this exact
         * form, which is also why it is the whole of what these constraints
         * say. Nullable columns are unaffected: IS JSON does not return FALSE
         * for NULL, so a constraint like this never rejects one.
         *
         * Lax rather than IS JSON (STRICT). Strict would also reject JSON that
         * Oracle tolerates but json_decode() would not — unquoted keys, say —
         * which is a real gap, but nothing except Laravel's json_encode()
         * writes these columns, and its output is always strictly valid.
         */
        foreach ([
            'scholarships' => ['schools', 'programmes', 'batches'],
            'scholarship_rules' => ['weights'],
        ] as $table => $columns) {
            foreach ($columns as $column) {
                DB::statement(
                    "ALTER TABLE {$table}
                     ADD CONSTRAINT {$table}_{$column}_is_json CHECK ({$column} IS JSON)"
                );
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('scholarship_rules');
        Schema::dropIfExists('coverage_lines');
        Schema::dropIfExists('scholarships');
    }
};
