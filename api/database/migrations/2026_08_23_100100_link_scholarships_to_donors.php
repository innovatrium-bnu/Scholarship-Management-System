<?php

declare(strict_types=1);

/**
 * Turns the free-text donor_name into a real link.
 *
 * A scholarship has carried `funding_source` and a nullable `donor_name` since
 * the schema landed, and one row uses them: "Aslam Foundation" on Externally
 * Funded Need-Based. That string is the whole of what the system knew about
 * donors, and because it is a string, two scholarships funded by one
 * organisation were two unrelated values.
 *
 * This adds `donor_id` and backfills it, creating one donor per distinct name
 * already in the column.
 *
 * `donor_name` is deliberately kept rather than dropped. Four screens read it,
 * ScholarshipForm writes it, and it is what a scholarship created before this
 * module has. Keeping it as a display fallback means nothing downstream changes
 * on the day this runs; the mapper prefers the linked donor's name when there
 * is one. Dropping it would be a second migration once every caller reads
 * through the link, not a decision to take here.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('scholarships', function (Blueprint $table) {
            /*
             * Nullable, and it stays nullable.
             *
             * An internally funded scholarship has no donor, which is most of
             * them; and a donor-funded one created before its donor was
             * registered has a name and no id. Requiring the link would make
             * this migration fail on exactly the data it exists to migrate.
             *
             * Restrict on delete: a donor that funds a scholarship cannot be
             * deleted out from under it. Archiving is how a donor is retired.
             */
            $table->foreignUlid('donor_id')
                ->nullable()
                ->after('donor_name')
                ->constrained('donors')
                ->restrictOnDelete();
        });

        $this->backfill();
    }

    public function down(): void
    {
        Schema::table('scholarships', function (Blueprint $table) {
            $table->dropConstrainedForeignId('donor_id');
        });

        // The donors created by the backfill are deliberately left in place.
        // By the time this is rolled back they may have pledges and receipts
        // hanging off them, and dropping a column is not a reason to delete
        // money records.
    }

    /**
     * One donor per distinct donor_name already in the column.
     *
     * Matched on the name because the name is all there is to match on — that
     * is the deficiency being fixed. Names are compared exactly rather than
     * case-folded or trimmed: two spellings really are two donors as far as
     * this data can tell, and silently merging them here would be a guess
     * recorded as a fact. If the result needs merging, that is a person's
     * decision made afterwards through the interface.
     */
    private function backfill(): void
    {
        DB::transaction(function () {
            $names = DB::table('scholarships')
                ->whereNotNull('donor_name')
                ->distinct()
                ->orderBy('donor_name')
                ->pluck('donor_name');

            $at = now();

            foreach ($names as $name) {
                $existing = DB::table('donors')->where('name', $name)->value('id');

                $id = $existing ?? (string) Str::ulid();

                if ($existing === null) {
                    DB::table('donors')->insert([
                        'id' => $id,
                        'name' => $name,

                        // Every donor the old column holds is an organisation.
                        // Whoever registers the next one picks properly; this
                        // is the honest default for data that never recorded a
                        // kind, not an assertion about the donor.
                        'kind' => 'Organisation',
                        'status' => 'Active',
                        'created_at' => $at,
                        'updated_at' => $at,
                    ]);
                }

                DB::table('scholarships')
                    ->where('donor_name', $name)
                    ->update(['donor_id' => $id]);
            }
        });
    }
};
