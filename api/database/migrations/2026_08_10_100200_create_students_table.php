<?php

/**
 * Students. Mirrors the Student interface in src/lib/scholarship/types.ts.
 *
 * The registration number is the primary key rather than a surrogate id. It is
 * the university's own identifier, it appears on every award and application,
 * and it is what a registrar types into the search box — a synthetic key would
 * be a second identity for the same person with no reader.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('students', function (Blueprint $table) {
            $table->string('reg_no')->primary(); // e.g. F23-BSCS-001
            $table->string('name');
            $table->string('school');
            $table->string('programme');
            $table->string('study_level'); // Bachelors | Masters
            $table->string('batch');

            $table->decimal('cgpa', 4, 2);
            $table->unsignedSmallInteger('credit_hours');

            $table->string('domicile');
            $table->boolean('is_out_of_station')->default(false);

            /**
             * The four fee columns stay four columns.
             *
             * A student_fees table keyed by fee head would be tidier, but
             * merge.ts feeOf() switches on these four names literally, and the
             * TypeScript copy of the merge — which the browser still runs to
             * draw coverage bars — reads them as tuitionFee/hostelFee/messFee/
             * otherFee. Normalising here would mean changing the frontend,
             * which is the one thing this migration is not allowed to do.
             *
             * Fee heads beyond these four can still exist and be covered by a
             * scholarship; they simply have no per-student amount, which is
             * what feeOf()'s fallback to otherFee already encodes.
             */
            $table->decimal('tuition_fee', 12, 2)->default(0);
            $table->decimal('hostel_fee', 12, 2)->default(0);
            $table->decimal('mess_fee', 12, 2)->default(0);
            $table->decimal('other_fee', 12, 2)->default(0);

            $table->string('province');
            $table->string('city');
            $table->string('district');

            // Manual verification flags. These are what Rule kind "Manual"
            // checks, and what a committee member ticks by hand.
            $table->boolean('financial_need_verified')->default(false);
            $table->boolean('personal_statement_ok')->default(false);
            $table->boolean('has_sports_medal')->default(false);
            $table->boolean('bfit_member')->default(false);

            /* -- admissions record ------------------------------------------ */

            $table->string('quota');
            $table->string('gender'); // Male | Female | Other

            /**
             * Age is deliberately not stored. types.ts says why: it is derived
             * from this with ageOf(), and keeping both lets them drift apart
             * with the stale one winning by accident.
             */
            $table->date('date_of_birth');

            $table->string('father_name');
            $table->string('email');
            $table->string('phone');

            // Owned by the attendance system, read-only here.
            $table->decimal('attendance_pct', 5, 2)->default(0);

            $table->string('photo_url')->nullable();
            $table->date('admission_date');
            $table->string('enrollment_status'); // Enrolled | On leave | Graduated | Withdrawn
            $table->unsignedSmallInteger('current_semester');
            $table->unsignedSmallInteger('credits_earned')->default(0);

            $table->timestamps();

            $table->foreign('school')->references('name')->on('schools')->cascadeOnUpdate();
            $table->foreign('programme')->references('name')->on('programmes')->cascadeOnUpdate();
            $table->foreign('batch')->references('label')->on('batches')->cascadeOnUpdate();
            $table->foreign('quota')->references('name')->on('quotas')->cascadeOnUpdate();

            // evaluate() filters cohorts by these, and cohort-rank rules rank a
            // student against everyone sharing them.
            $table->index(['school', 'batch']);
            $table->index('batch');
            $table->index('enrollment_status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('students');
    }
};
