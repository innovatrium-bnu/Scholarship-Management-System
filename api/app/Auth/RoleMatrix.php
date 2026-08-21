<?php

declare(strict_types=1);

namespace App\Auth;

/**
 * What each role is allowed to do. The enforcing half of roles.ts.
 *
 * The four roles are the ones BNU asked for, and they are graded by how much
 * damage a mistake does rather than by which office someone sits in:
 *
 *   Reporting    may look and nothing else.
 *   Data Entry   may correct a record, but may not decide who gets money.
 *   Admin        runs the scholarship cycle end to end.
 *   Super Admin  also administers the system itself.
 *
 * The list is open. More roles will be added as the university names them, and
 * nothing in this class or in roles.ts assumes there are exactly four —
 * allows() fails closed on a role it does not recognise, and the gates in
 * AppServiceProvider are registered from CAPABILITIES rather than written out.
 *
 * This is a second copy of a list that already exists in TypeScript, which is
 * normally the thing to avoid — the two are kept honest by RoleMatrixTest,
 * which parses roles.ts and fails if they disagree. The alternative, serving
 * the matrix from the API, would mean the server asking the client what the
 * client is allowed to do.
 */
final class RoleMatrix
{
    /* -- Capabilities, as roles.ts names them ---------------------------- */

    /** Open the review queue and read applications. */
    public const APPLICATIONS_READ = 'applications.read';

    /** Approve, reject, or hold an application. */
    public const APPLICATIONS_DECIDE = 'applications.decide';

    /** Edit a student's own record. */
    public const STUDENTS_EDIT = 'students.edit';

    /** Change the eligibility criteria the filter applies. */
    public const CRITERIA_EDIT = 'criteria.edit';

    /** Award or take back a scholarship by hand. */
    public const AWARDS_MANAGE = 'awards.manage';

    /** Create, change, or retire a scholarship. */
    public const SCHOLARSHIPS_EDIT = 'scholarships.edit';

    /**
     * Create accounts and set what role they hold.
     *
     * No route names this yet, because there is no user administration
     * endpoint. It is declared because it is the whole difference between
     * Super Admin and Admin, and because registering it now means the first
     * such endpoint is written against a gate that already exists rather than
     * with no gate at all.
     */
    public const USERS_MANAGE = 'users.manage';

    public const CAPABILITIES = [
        self::APPLICATIONS_READ,
        self::APPLICATIONS_DECIDE,
        self::STUDENTS_EDIT,
        self::CRITERIA_EDIT,
        self::AWARDS_MANAGE,
        self::SCHOLARSHIPS_EDIT,
        self::USERS_MANAGE,
    ];

    /* -- Roles ------------------------------------------------------------ */

    public const SUPER_ADMIN = 'Super Admin';

    public const ADMIN = 'Admin';

    public const DATA_ENTRY = 'Data Entry';

    public const REPORTING = 'Reporting';

    /** Most privileged first, matching ROLES in types.ts. */
    public const ROLES = [
        self::SUPER_ADMIN,
        self::ADMIN,
        self::DATA_ENTRY,
        self::REPORTING,
    ];

    /**
     * The least privileged role there is.
     *
     * Named rather than spelled out, because it is used in three places that
     * must agree: the default on the users.role column, the fallback in
     * Actor::from, and what an unmapped legacy role migrates to. Anywhere a
     * role has to be guessed, this is the guess.
     */
    public const LEAST_PRIVILEGED = self::REPORTING;

    /**
     * The MATRIX constant in roles.ts, capability for capability.
     *
     * @var array<string, list<string>>
     */
    public const MATRIX = [
        self::SUPER_ADMIN => [
            self::APPLICATIONS_READ,
            self::APPLICATIONS_DECIDE,
            self::STUDENTS_EDIT,
            self::CRITERIA_EDIT,
            self::AWARDS_MANAGE,
            self::SCHOLARSHIPS_EDIT,
            self::USERS_MANAGE,
        ],
        self::ADMIN => [
            self::APPLICATIONS_READ,
            self::APPLICATIONS_DECIDE,
            self::STUDENTS_EDIT,
            self::CRITERIA_EDIT,
            self::AWARDS_MANAGE,
            self::SCHOLARSHIPS_EDIT,
        ],
        /*
         * Data Entry keeps records straight and prepares applications for
         * review. It stops short of APPLICATIONS_DECIDE and AWARDS_MANAGE on
         * purpose: entering the numbers a decision rests on and making the
         * decision are the two halves that have to stay in different hands.
         */
        self::DATA_ENTRY => [
            self::APPLICATIONS_READ,
            self::STUDENTS_EDIT,
        ],
        /*
         * Read-only by construction. Every read route is gated on being signed
         * in, so this list is what Reporting may do beyond looking.
         */
        self::REPORTING => [
            self::APPLICATIONS_READ,
        ],
    ];

    /**
     * can() from roles.ts.
     *
     * An unrecognised role is denied everything rather than defaulting to
     * anything. roles.ts indexes MATRIX directly and would throw on one; here a
     * role could reach this from a column, and silently granting the default
     * set to a value nobody recognises is the wrong way to fail.
     */
    public static function allows(?string $role, string $capability): bool
    {
        return in_array($capability, self::MATRIX[$role] ?? [], true);
    }

    /**
     * Everything a role may do, for the client to render against.
     *
     * @return list<string>
     */
    public static function capabilitiesFor(?string $role): array
    {
        return self::MATRIX[$role] ?? [];
    }
}
