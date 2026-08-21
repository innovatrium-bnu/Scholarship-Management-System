<?php

/**
 * Eligibility criteria: the thresholds the application filter applies.
 *
 * Mirrors EligibilityCriteria / CgpaThreshold in src/lib/scholarship/types.ts.
 *
 * These are settings, not policy carved into code — settings.criteria.tsx edits
 * them at runtime. `auto_reject_on` in particular is the switch that decides how
 * aggressive the filter is: a criterion left out of that list still shows on the
 * application as a flag for the committee, but never rejects on its own.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('eligibility_criteria', function (Blueprint $table) {
            // One row per scholarship, so the scholarship is the key.
            $table->foreignUlid('scholarship_id')
                ->primary()
                ->constrained('scholarships')
                ->cascadeOnDelete();

            $table->decimal('max_monthly_income', 12, 2);
            $table->unsignedSmallInteger('min_credit_hours');
            $table->decimal('min_attendance_pct', 5, 2);

            // Document kinds an application must carry. Free strings matched
            // against ApplicationDocument.kind, not a reference table: the
            // committee invents these as policy changes.
            //
            // CLOB on 19c, with an IS JSON constraint added below — see the
            // note in create_scholarships_tables.
            $table->json('required_documents')->default('[]');

            // Applying while already covered above this much tuition is
            // questionable, and can be made an automatic rejection.
            $table->decimal('max_existing_coverage_pct', 5, 2);

            // Which of the seven CriterionId values reject without a person
            // looking: cgpa, income, creditHours, attendance, documents,
            // existingCoverage, duplicate.
            $table->json('auto_reject_on')->default('[]');

            $table->timestamps();
        });

        /**
         * A minimum CGPA that applies to one intake and every intake after it,
         * until a later threshold takes over.
         *
         * Written this way because that is how the policy is written: "2.65 for
         * Fall 2024 and onwards, 2.50 for Fall 2023". minCgpaFor() picks the
         * latest threshold at or before the student's batch, which is why
         * from_batch resolves through batches.sort_order rather than by label.
         */
        Schema::create('cgpa_thresholds', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('scholarship_id')
                ->constrained('eligibility_criteria', 'scholarship_id')
                ->cascadeOnDelete();
            $table->string('from_batch');
            $table->decimal('min_cgpa', 4, 2);

            $table->foreign('from_batch')->references('label')->on('batches')->cascadeOnUpdate();
            $table->unique(['scholarship_id', 'from_batch']);
        });

        foreach (['required_documents', 'auto_reject_on'] as $column) {
            DB::statement(
                "ALTER TABLE eligibility_criteria
                 ADD CONSTRAINT eligibility_criteria_{$column}_is_json CHECK ({$column} IS JSON)"
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('cgpa_thresholds');
        Schema::dropIfExists('eligibility_criteria');
    }
};
