<?php

/**
 * Give users a role.
 *
 * The prototype had no users at all — the role was picked from a dropdown in
 * the top bar and written into the audit log as a bare string. The capability
 * matrix in src/lib/scholarship/roles.ts is already built against these four
 * roles, so this column is the whole schema change auth needs: can() starts
 * reading a session instead of a picked value, and no screen changes.
 *
 * The role lives on the user rather than in a roles table because there are
 * exactly four, they are the shape of the office rather than of the software,
 * and the matrix that gives them meaning is code either way.
 */

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Registrar Office | Scholarship Committee | Finance | Admin
            $table->string('role')->default('Finance')->after('email');
            $table->index('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role']);
            $table->dropColumn('role');
        });
    }
};
