<?php

/**
 * The two logs.
 *
 * They sit side by side on purpose, and events.ts explains why: they answer
 * different questions and neither can do the other's job well.
 *
 *   audit_entries — what a person did, in English, for someone reading a
 *                   history. Prose, old/new values, a reason.
 *   domain_events — what happened, in a shape a query can count. Four kinds,
 *                   fixed fields, no prose.
 *
 * Counting scholars from the audit log means regexing sentences. Explaining a
 * change from the event log means guessing. Hence both.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_entries', function (Blueprint $table) {
            $table->ulid('id')->primary();

            /**
             * Polymorphic by design: one history, every entity in it, readable
             * in one query ordered by time.
             *
             * Not a Laravel morphTo relation with foreign keys, because an
             * audit row must outlive what it describes — an undone batch
             * deletes its awards, and the entry saying so has to survive that.
             * entity_id is therefore an untyped string.
             */
            $table->string('entity_type'); // Scholarship|Student|Award|Batch|Application|Criteria
            $table->string('entity_id');

            $table->string('action');

            // Free-shaped because they hold whatever field changed — a number,
            // a string, a whole coverage array. CLOB on 19c, with an IS JSON
            // constraint added below — see create_scholarships_tables.
            $table->json('old_value')->nullable();
            $table->json('new_value')->nullable();

            $table->text('reason')->nullable();

            // The role string today, a real person once auth lands.
            $table->string('actor');

            /**
             * In the prototype this id was `au-${audit.length + 1}`, which the
             * README flags as colliding after an undo: removing entries makes
             * the next id repeat one already used. A ULID cannot collide, and
             * because it sorts by generation time the primary key alone gives a
             * stable order for entries written in the same millisecond —
             * something occurred_at cannot do on its own.
             *
             * Called occurred_at, not `timestamp`. TIMESTAMP is an Oracle
             * keyword and a datatype name, so the column would have to be
             * quoted in every hand-written query for the rest of its life —
             * and `"TIMESTAMP" timestamp with time zone` is a line no DBA at
             * BNU should have to read twice.
             */
            $table->timestampTz('occurred_at');

            $table->index(['entity_type', 'entity_id']);
            $table->index('occurred_at');
        });

        Schema::create('domain_events', function (Blueprint $table) {
            $table->ulid('id')->primary();

            // award.granted | award.revoked | award.undone | application.decided
            $table->string('kind');
            $table->timestampTz('at');

            // The term the event belongs to, so reports can group by term
            // without deriving it from `at` at query time.
            $table->string('semester')->nullable();

            $table->string('student_reg_no')->nullable();
            $table->string('scholarship_id')->nullable();
            $table->string('award_id')->nullable();
            $table->string('application_id')->nullable();
            $table->string('batch_id')->nullable();

            // Kind-specific extras: the revocation cause, the decided outcome.
            $table->json('payload')->nullable();

            /**
             * No foreign keys, for the same reason as audit_entries: this is a
             * record of something that happened, and it has to remain true
             * after the rows it mentions are gone. aggregate.ts reads counts
             * from here rather than from the awards table precisely because the
             * awards table only knows the present.
             */
            $table->index(['kind', 'at']);
            $table->index('semester');
            $table->index('student_reg_no');
        });

        foreach ([
            'audit_entries' => ['old_value', 'new_value'],
            'domain_events' => ['payload'],
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
        Schema::dropIfExists('domain_events');
        Schema::dropIfExists('audit_entries');
    }
};
