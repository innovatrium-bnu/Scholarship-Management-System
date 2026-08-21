<?php

/**
 * Assignment batches, awards, award components, and revocations.
 *
 * Mirrors AssignmentBatch / Award / AwardComponent / Revocation in
 * src/lib/scholarship/types.ts. This is where the money actually lives.
 *
 * `actor` is a plain string here, as it was in the prototype (the hardcoded
 * "Registrar"). It becomes a foreign key to users when authentication lands.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /**
         * One commit of many awards, so a mistaken assignment can be undone as
         * a unit rather than award by award.
         *
         * types.ts carries `awardIds: string[]` on this. That is not stored:
         * it is exactly the set of awards whose batch_id points here, and
         * keeping a second copy is how the two disagree. The API rebuilds the
         * array from the relation.
         */
        Schema::create('assignment_batches', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('scholarship_id')
                ->constrained('scholarships')
                ->restrictOnDelete();
            $table->string('actor');
            $table->text('reason');

            // Evaluate = the rules chose the students; Direct = a person did.
            //
            // assignment_mode rather than `mode`: MODE is an Oracle reserved
            // word, so a column called that can never appear unquoted in SQL
            // again — not in a report, not in a DBA's ad-hoc query. Eloquent
            // would have quoted it and hidden the problem until the first
            // person wrote SQL by hand.
            $table->string('assignment_mode');

            // Undo deletes this batch's awards but keeps the batch row, so the
            // audit trail still shows that an assignment happened and was
            // taken back. Nothing else in the schema is hard-deleted.
            $table->boolean('undone')->default(false);

            $table->timestamps();
            $table->index('scholarship_id');
        });

        Schema::create('awards', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->string('student_reg_no');
            $table->foreignUlid('scholarship_id')
                ->constrained('scholarships')
                ->restrictOnDelete();

            $table->string('status')->default('Active'); // Active | Revoked
            $table->date('effective_from');
            $table->string('authorised_by');
            $table->string('reason_code');

            // Null for awards granted one at a time rather than in a batch.
            // Set null on delete, not cascade: losing the batch row must never
            // silently delete the money.
            $table->foreignUlid('batch_id')
                ->nullable()
                ->constrained('assignment_batches')
                ->nullOnDelete();

            // Set when a person changed the amounts directly, rather than the
            // scholarship's rules producing them.
            $table->boolean('edited_by_hand')->default(false);
            $table->text('edit_reason')->nullable();

            $table->timestamps();

            $table->foreign('student_reg_no')
                ->references('reg_no')->on('students')
                ->cascadeOnUpdate();

            // computeMerge() loads every active award for one student, which is
            // the hottest read in the application.
            $table->index(['student_reg_no', 'status']);
            $table->index(['scholarship_id', 'status']);
            $table->index('batch_id');
        });

        /**
         * What one award pays, per fee head.
         *
         * `entitlement_value` is what the scholarship promises; `applied` is
         * what survives the merge against the 100% ceiling. Both are stored
         * rather than recomputed on read, so a historical award still shows the
         * amount that was actually granted even after precedence is reordered.
         */
        Schema::create('award_components', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('award_id')
                ->constrained('awards')
                ->cascadeOnDelete();
            $table->string('fee_head');

            $table->string('entitlement_kind'); // Percentage | Full waiver | Fixed amount
            $table->decimal('entitlement_value', 12, 2);
            $table->decimal('entitlement', 12, 2);

            // Percent (0-100) for percentage and full-waiver lines, PKR for
            // fixed-amount lines. types.ts documents the dual meaning.
            $table->decimal('applied', 12, 2);

            /**
             * A pinned line. Pinned components are honoured first and consume
             * the ceiling before anything else is considered, which is how a
             * hand-agreed amount survives a scholarship that would otherwise
             * outrank it.
             */
            $table->boolean('is_overridden')->default(false);
            $table->text('override_reason')->nullable();
            $table->string('override_authority')->nullable();

            $table->foreign('fee_head')->references('name')->on('fee_heads')->cascadeOnUpdate();
            $table->unique(['award_id', 'fee_head']);
        });

        /**
         * The record of an award ending.
         *
         * Its own table rather than six nullable columns on awards, for the
         * reason types.ts gives: it cannot then be half-filled. Either a row
         * exists and says when, why and on whose word, or the award is live.
         *
         * Before this existed the timing and effective date were interpolated
         * into an English audit sentence and nowhere else, which made "how many
         * students lost a scholarship last semester" unanswerable without
         * regexing prose. Hence `semester` as its own grouped column.
         */
        Schema::create('revocations', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignUlid('award_id')
                ->unique()
                ->constrained('awards')
                ->cascadeOnDelete();

            $table->timestampTz('at');              // when it was decided
            $table->date('effective_from');         // when the money stops
            $table->string('semester');             // effective_from as a term label
            $table->string('timing');               // immediate | next

            // Four causes because there are four code paths that end an award.
            $table->string('cause');
            $table->text('reason');
            // revoked_by, not `by`: BY is an Oracle reserved word. Same
            // reasoning as assignment_mode above.
            $table->string('revoked_by');

            $table->index('semester');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('revocations');
        Schema::dropIfExists('award_components');
        Schema::dropIfExists('awards');
        Schema::dropIfExists('assignment_batches');
    }
};
