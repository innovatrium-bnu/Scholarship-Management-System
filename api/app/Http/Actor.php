<?php

declare(strict_types=1);

namespace App\Http;

use App\Auth\RoleMatrix;
use Illuminate\Http\Request;

/**
 * Who is doing this.
 *
 * Now the authenticated user's role, which is what Phase 8 built this class to
 * become: every mutation already called Actor::from(), so authentication landed
 * in one file rather than in twenty controllers.
 *
 * The role still reaches the audit log as a bare string rather than a foreign
 * key to users, and that is deliberate. An audit row must stay readable after
 * the account that wrote it is gone — people leave the Registrar Office — and a
 * trail that goes blank when someone is deprovisioned is not a trail.
 *
 * The X-Role header the SPA sends today is now ignored. It described who the
 * user said they were; this describes who they are.
 */
final class Actor
{
    /** @deprecated Kept for the one call site left in tests; use RoleMatrix. */
    public const ROLES = RoleMatrix::ROLES;

    /**
     * What a write is attributed to when no person is behind it.
     *
     * Not a role. A seeder or an artisan command is not the Super Admin and is
     * not Reporting either, and naming one of them here would put a role in the
     * audit log that nobody held. 'System' is the truthful label, and it can
     * never collide with a role because RoleMatrix::allows() denies it
     * everything — so an audit row saying System is a row that was written
     * with no session, which is exactly what it means.
     */
    public const DEFAULT = 'System';

    /**
     * Every route that mutates is behind auth:sanctum, so there is a user.
     *
     * The fallback exists for the console — a seeder or an artisan command
     * calling a writer has no request and no session, and should not have to
     * fabricate one. It is not a way in: nothing unauthenticated reaches a
     * controller that calls this, and this value grants nothing.
     */
    public static function from(Request $request): string
    {
        $role = $request->user()?->role;

        return in_array($role, RoleMatrix::ROLES, true) ? $role : self::DEFAULT;
    }
}
