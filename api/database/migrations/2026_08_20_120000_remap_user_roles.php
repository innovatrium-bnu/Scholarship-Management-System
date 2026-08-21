<?php

/**
 * The four roles BNU asked for, replacing the four the prototype invented.
 *
 * The prototype split by office — Registrar Office, Scholarship Committee,
 * Finance, Admin — because that is how the screens were described before there
 * were accounts. BNU named a different four, graded by privilege rather than by
 * department: Super Admin, Admin, Data Entry, Reporting.
 *
 * The remap below is not a rename. Two old roles collapse into one new one, and
 * one old role gains a capability, so the mapping is stated explicitly rather
 * than done with string replacement:
 *
 *   Admin                 -> Super Admin   it was already described as full
 *                                          access "including lookups and
 *                                          settings", which is now Super Admin
 *   Registrar Office      -> Admin         it held all six capabilities and
 *                                          ran the cycle; that is Admin
 *   Scholarship Committee -> Admin         nothing in the new set decides
 *                                          applications without also editing
 *                                          scholarships, so this widens. Named
 *                                          here so the widening is on the
 *                                          record rather than discovered later
 *   Finance               -> Reporting     read-only, unchanged in substance
 *   anything else         -> Reporting     fail closed
 *
 * The default moves from Finance to Reporting for the same reason it was
 * Finance: it is the least a role can hold, so a row inserted without one is
 * inserted with the least privilege rather than the most.
 */

use App\Auth\RoleMatrix;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Old role to new role.
     *
     * Every value on the right is in RoleMatrix::ROLES; RoleRemapTest checks
     * that, so a role renamed in the matrix cannot leave this map pointing at
     * one that no longer exists.
     */
    private const FORWARD = [
        'Admin' => RoleMatrix::SUPER_ADMIN,
        'Registrar Office' => RoleMatrix::ADMIN,
        'Scholarship Committee' => RoleMatrix::ADMIN,
        'Finance' => RoleMatrix::REPORTING,
    ];

    /**
     * New role back to old.
     *
     * Not the inverse of FORWARD, because FORWARD is not injective: two roles
     * map onto Admin and only one can come back. Registrar Office is the one
     * that returns, because it is the role that held the same six capabilities.
     */
    private const BACKWARD = [
        RoleMatrix::SUPER_ADMIN => 'Admin',
        RoleMatrix::ADMIN => 'Registrar Office',
        RoleMatrix::DATA_ENTRY => 'Registrar Office',
        RoleMatrix::REPORTING => 'Finance',
    ];

    public function up(): void
    {
        $this->remap(self::FORWARD, RoleMatrix::ROLES, RoleMatrix::LEAST_PRIVILEGED);
        $this->setDefault(RoleMatrix::LEAST_PRIVILEGED);
    }

    public function down(): void
    {
        $this->remap(self::BACKWARD, self::PROTOTYPE_ROLES, 'Finance');
        $this->setDefault('Finance');
    }

    /** The set down() has to leave the column in. */
    private const PROTOTYPE_ROLES = [
        'Registrar Office', 'Scholarship Committee', 'Finance', 'Admin',
    ];

    /**
     * Rewrite every role column, sending anything outside $permitted to
     * $fallback.
     *
     * Done as one UPDATE per distinct value rather than a CASE expression: the
     * set is four rows wide in practice, the statements read as the mapping
     * above reads, and the sweep at the end is what makes the result total —
     * after it runs, no users row holds a value outside the new set, whatever
     * was in the column before.
     *
     * @param  array<string, string>  $mapping
     * @param  list<string>  $permitted
     */
    private function remap(array $mapping, array $permitted, string $fallback): void
    {
        DB::transaction(function () use ($mapping, $permitted, $fallback) {
            foreach ($mapping as $from => $to) {
                DB::table('users')->where('role', $from)->update(['role' => $to]);
            }

            DB::table('users')
                ->whereNotIn('role', $permitted)
                ->update(['role' => $fallback]);
        });
    }

    /**
     * Move the column default.
     *
     * Raw DDL rather than ->change(), which on this stack would rewrite the
     * column definition through laravel-oci8's grammar and take the NOT NULL
     * and the index with it. MODIFY (col DEFAULT ...) changes the default and
     * nothing else, and is the only Oracle-specific line in this file.
     */
    private function setDefault(string $role): void
    {
        DB::statement("ALTER TABLE users MODIFY (role DEFAULT '{$role}')");
    }
};
