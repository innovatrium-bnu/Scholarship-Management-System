<?php

/**
 * Reference data: the lookups the rest of the schema points at.
 *
 * These were hardcoded constants in src/lib/scholarship/seed.ts. They are
 * tables now so the Registrar Office can add a programme without a code
 * deploy, and so student and scholarship rows can be checked against them.
 *
 * The frontend still imports the constants from seed.ts for the moment — that
 * is deliberate, and it is what keeps the eight files importing SCHOOLS and
 * GEOGRAPHY untouched. Serving these from the API is a separate step.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Names are the primary keys throughout this file. They are what the
        // domain actually uses — a scholarship's scope is a list of school
        // names, and a student's `school` is a name — so surrogate integer keys
        // would mean joining on every comparison to recover the string the
        // logic wanted in the first place.
        Schema::create('schools', function (Blueprint $table) {
            $table->string('name')->primary();
            $table->unsignedSmallInteger('sort_order')->default(0);
        });

        Schema::create('programmes', function (Blueprint $table) {
            $table->string('name')->primary();
            $table->string('school');
            $table->string('study_level'); // Bachelors | Masters
            $table->foreign('school')->references('name')->on('schools')->cascadeOnUpdate();
        });

        // An intake, e.g. "Fall 2023". Ordering matters: batchMode "onwards"
        // means this batch and every later one, so the comparison is on
        // sort_order rather than on the label, which sorts alphabetically and
        // would put Fall before Spring.
        Schema::create('batches', function (Blueprint $table) {
            $table->string('label')->primary();
            $table->unsignedSmallInteger('sort_order');
        });

        // A term, e.g. "Spring 2026". Same ordering reasoning as batches.
        Schema::create('semesters', function (Blueprint $table) {
            $table->string('label')->primary();
            $table->unsignedSmallInteger('sort_order');
            $table->date('starts_on');
            $table->date('ends_on');
        });

        // Admission category. types.ts calls this out explicitly: "A managed
        // lookup, never a hardcoded union."
        Schema::create('quotas', function (Blueprint $table) {
            $table->string('name')->primary();
        });

        // Province -> city -> district, flattened. One row per district is
        // enough to drive the cascading filters, and the levels above are
        // recovered with a DISTINCT rather than kept as their own tables.
        Schema::create('geography', function (Blueprint $table) {
            $table->id();
            $table->string('province');
            $table->string('city');
            $table->string('district');

            // Named explicitly, and it has to be. Left to generate its own
            // name, laravel-oci8 abandons the readable scheme for any index of
            // three columns or more and builds one out of microtime() —
            // `geograph_comp_1786526101_1016`. That is a different name on
            // every run, so migrate:fresh never reproduces the same schema
            // twice and no down() could drop it by name. The 128-character
            // limit does not save us here; that branch never consults it.
            $table->unique(['province', 'city', 'district'], 'geography_province_city_district_uk');
            $table->index('province');
        });

        // Fee heads are editable at runtime — the store has addFeeHead and
        // deleteFeeHead. `is_core` marks the four the merge engine knows by
        // name (Tuition, Hostel, Mess, Other), which map to columns on
        // students and therefore cannot be deleted.
        Schema::create('fee_heads', function (Blueprint $table) {
            $table->string('name')->primary();
            $table->boolean('is_core')->default(false);
            $table->unsignedSmallInteger('sort_order')->default(0);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fee_heads');
        Schema::dropIfExists('geography');
        Schema::dropIfExists('quotas');
        Schema::dropIfExists('semesters');
        Schema::dropIfExists('batches');
        Schema::dropIfExists('programmes');
        Schema::dropIfExists('schools');
    }
};
