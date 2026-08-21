<?php

/**
 * Need-based applications, their documents, and the decision taken on them.
 *
 * Mirrors NeedApplication / HouseholdInfo / ApplicationDocument /
 * ApplicationDecision in src/lib/scholarship/types.ts.
 *
 * Students do not log in here. Applications reach this system from the
 * admission portal; this is the Registrar Office's review queue.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('need_applications', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('student_reg_no');
            $table->foreignUlid('scholarship_id')
                ->constrained('scholarships')
                ->restrictOnDelete();

            // The term the money is being asked for.
            $table->string('semester');
            $table->timestampTz('submitted_at');

            /**
             * What the student declares about the household paying the fee.
             *
             * Inlined with a household_ prefix rather than given its own table:
             * it is strictly one-to-one and always present, so a separate table
             * would be a join that can never return a different number of rows.
             */
            $table->decimal('household_monthly_income', 12, 2);
            $table->unsignedSmallInteger('household_earning_members');
            $table->unsignedSmallInteger('household_dependants');
            $table->unsignedSmallInteger('household_siblings_at_bnu');
            $table->string('household_guardian_occupation');
            // Employed | Self-employed | Retired | Unemployed | Deceased
            $table->string('household_guardian_status');
            // Owned | Rented | Family owned
            $table->string('household_residence');
            $table->decimal('household_monthly_rent', 12, 2)->default(0);
            $table->boolean('household_owns_vehicle')->default(false);

            $table->text('statement');

            // What the student asked for, as a percentage of tuition.
            $table->decimal('requested_pct', 5, 2);

            // Submitted | On hold | Approved | Rejected | Withdrawn
            $table->string('status')->default('Submitted');

            $table->timestamps();

            $table->foreign('student_reg_no')
                ->references('reg_no')->on('students')
                ->cascadeOnUpdate();

            // The review queue reads by status; duplicate detection looks for a
            // second application from one student to one scholarship in a term.
            $table->index('status');
            // Named explicitly: laravel-oci8 generates a microtime()-based
            // name for any index of three columns or more. See the note on
            // geography's unique key in create_reference_tables.
            $table->index(
                ['student_reg_no', 'scholarship_id', 'semester'],
                'need_applications_student_scholarship_semester_index'
            );
        });

        /**
         * A document attached to an application.
         *
         * Metadata only. There is no file storage yet: `file_name` is a string
         * and nothing is uploaded anywhere. The column for the stored file is
         * deliberately absent rather than nullable, so nothing can half-work —
         * when storage lands it arrives as its own migration and its own
         * decision about where files live.
         */
        Schema::create('application_documents', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('application_id')
                ->constrained('need_applications')
                ->cascadeOnDelete();

            // Matches an entry in eligibility_criteria.required_documents.
            $table->string('kind');
            $table->string('file_name');
            $table->timestampTz('uploaded_at');
            $table->boolean('verified')->default(false);

            $table->index('application_id');
        });

        /**
         * The decision on an application.
         *
         * One row at most, hence the unique key. It exists only once somebody
         * (or the filter) has decided — an undecided application simply has no
         * row here, which is what makes "still in the queue" a fact about the
         * data rather than a status string that can disagree with it.
         *
         * Approving creates the award in the same transaction, and `award_id`
         * is what ties the two together afterwards.
         */
        Schema::create('application_decisions', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('application_id')
                ->unique()
                ->constrained('need_applications')
                ->cascadeOnDelete();

            $table->string('outcome'); // Approved | Rejected | On hold
            // decided_by, not `by`: BY is an Oracle reserved word, and a
            // column named that can never appear unquoted in SQL again.
            $table->string('decided_by');
            $table->string('role');
            $table->timestampTz('at');
            $table->text('reason');

            // Set when the criteria filter rejected it rather than a person.
            $table->boolean('automatic')->default(false);

            // Tuition percentage granted. Only meaningful when approved.
            $table->decimal('awarded_pct', 5, 2)->nullable();

            // The award this application produced. Null on rejection, and set
            // null rather than cascading if that award is later undone — the
            // decision still happened.
            $table->foreignUlid('award_id')
                ->nullable()
                ->constrained('awards')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_decisions');
        Schema::dropIfExists('application_documents');
        Schema::dropIfExists('need_applications');
    }
};
