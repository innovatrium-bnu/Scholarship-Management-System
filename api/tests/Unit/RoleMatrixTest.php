<?php

declare(strict_types=1);

use App\Auth\RoleMatrix;

/**
 * The PHP matrix and roles.ts, checked against each other.
 *
 * There are now two copies of the permission model: roles.ts decides which
 * buttons a screen draws, App\Auth\RoleMatrix decides which requests the server
 * answers. Duplication is normally the thing to avoid, and the alternative was
 * considered and rejected — serving the matrix from the API would mean the
 * server asking the client what the client is allowed to do.
 *
 * So the duplication stays and this makes it safe. If the two ever disagree the
 * failure is silent and one-directional: a screen that hides a control the API
 * would have allowed is a confusing afternoon, and a screen that shows one the
 * API refuses is a bug report. Neither raises anything on its own.
 *
 * The same approach ReferenceDataTest already takes for the seed lists.
 *
 * No database and no application, so the path is derived rather than taken from
 * base_path(): a unit test has no booted app to ask.
 */
function rolesSource(): string
{
    $path = dirname(__DIR__, 3).'/src/lib/scholarship/roles.ts';

    if (! is_file($path)) {
        throw new RuntimeException("Expected the frontend role matrix at {$path}");
    }

    return file_get_contents($path);
}

/**
 * The MATRIX literal in roles.ts, parsed.
 *
 * @return array<string, list<string>>
 */
function typescriptMatrix(): array
{
    $source = rolesSource();

    $start = strpos($source, 'const MATRIX');
    $end = strpos($source, '};', $start);
    $block = substr($source, $start, $end - $start);

    $matrix = [];

    foreach (RoleMatrix::ROLES as $role) {
        /*
         * Anchored to the start of a line, which is not tidiness. Keys are
         * quoted only when they need to be — "Super Admin" is, Admin is not —
         * so an unanchored pattern for Admin matches inside "Super Admin": and
         * reads the wrong role's capability list. That failure is quiet, since
         * both sides parse and only the comparison disagrees.
         */
        $pattern = '/^\s*"?'.preg_quote($role, '/').'"?\s*:\s*\[(.*?)\]/ms';

        if (preg_match($pattern, $block, $found) !== 1) {
            continue;
        }

        preg_match_all('/"([a-z.]+)"/', $found[1], $capabilities);

        $matrix[$role] = $capabilities[1];
    }

    return $matrix;
}

it('parsed something, so the comparisons below are not vacuous', function () {
    $matrix = typescriptMatrix();

    expect($matrix)->toHaveCount(count(RoleMatrix::ROLES))
        ->and($matrix[RoleMatrix::SUPER_ADMIN])->toHaveCount(count(RoleMatrix::CAPABILITIES))
        ->and($matrix[RoleMatrix::REPORTING])->toHaveCount(1);
});

it('grants each role exactly what roles.ts grants it', function () {
    $problems = [];

    foreach (typescriptMatrix() as $role => $capabilities) {
        $mine = RoleMatrix::MATRIX[$role] ?? [];

        sort($capabilities);
        sort($mine);

        if ($capabilities !== $mine) {
            $problems[] = $role.': ts='.implode(',', $capabilities).' php='.implode(',', $mine);
        }
    }

    expect($problems)->toBe([]);
});

it('knows the same capabilities the Capability union declares', function () {
    preg_match_all('/\|\s*"([a-z.]+)"/', rolesSource(), $found);

    $declared = $found[1];
    $mine = RoleMatrix::CAPABILITIES;

    sort($declared);
    sort($mine);

    expect($declared)->toBe($mine);
});

it('answers can() the way roles.ts does', function () {
    // The separations that matter, stated rather than derived: Data Entry may
    // correct the record a decision rests on but may not make the decision or
    // move the money, Reporting changes nothing at all, and users.manage is
    // the one thing that separates Super Admin from Admin.
    expect(RoleMatrix::allows(RoleMatrix::DATA_ENTRY, RoleMatrix::STUDENTS_EDIT))->toBeTrue()
        ->and(RoleMatrix::allows(RoleMatrix::DATA_ENTRY, RoleMatrix::APPLICATIONS_DECIDE))->toBeFalse()
        ->and(RoleMatrix::allows(RoleMatrix::DATA_ENTRY, RoleMatrix::AWARDS_MANAGE))->toBeFalse()
        ->and(RoleMatrix::allows(RoleMatrix::DATA_ENTRY, RoleMatrix::CRITERIA_EDIT))->toBeFalse()
        ->and(RoleMatrix::allows(RoleMatrix::REPORTING, RoleMatrix::APPLICATIONS_READ))->toBeTrue()
        ->and(RoleMatrix::allows(RoleMatrix::REPORTING, RoleMatrix::STUDENTS_EDIT))->toBeFalse()
        ->and(RoleMatrix::allows(RoleMatrix::ADMIN, RoleMatrix::SCHOLARSHIPS_EDIT))->toBeTrue()
        ->and(RoleMatrix::allows(RoleMatrix::ADMIN, RoleMatrix::USERS_MANAGE))->toBeFalse()
        ->and(RoleMatrix::allows(RoleMatrix::SUPER_ADMIN, RoleMatrix::USERS_MANAGE))->toBeTrue();
});

it('grades the roles, so each one holds at least what the next one down holds', function () {
    // Super Admin > Admin > Data Entry > Reporting is the whole premise of the
    // set: they are ranked by privilege rather than split by department. A
    // capability given to a lower role and not to a higher one would break the
    // ranking silently, and every screen that reasons "this role can do less
    // than mine" with it.
    $problems = [];
    $ranked = RoleMatrix::ROLES;

    for ($i = 0; $i < count($ranked) - 1; $i++) {
        $higher = RoleMatrix::MATRIX[$ranked[$i]];
        $lower = RoleMatrix::MATRIX[$ranked[$i + 1]];

        foreach (array_diff($lower, $higher) as $capability) {
            $problems[] = "{$ranked[$i + 1]} holds {$capability} but {$ranked[$i]} does not";
        }
    }

    expect($problems)->toBe([]);
});

it('leaves the least privileged role holding the least', function () {
    // LEAST_PRIVILEGED is the default on the users.role column and the value an
    // unmapped legacy role migrates to. If it ever stopped being the smallest
    // set, both of those would start handing out privilege by default.
    $sizes = array_map(fn (array $c) => count($c), RoleMatrix::MATRIX);

    expect($sizes[RoleMatrix::LEAST_PRIVILEGED])->toBe(min($sizes));
});

it('denies everything to a role it does not recognise', function () {
    // roles.ts indexes MATRIX directly and would throw. Here the value arrives
    // from a column, so it has to fail closed rather than fall back to a
    // default set.
    foreach (RoleMatrix::CAPABILITIES as $capability) {
        expect(RoleMatrix::allows('Vice Chancellor', $capability))->toBeFalse()
            ->and(RoleMatrix::allows(null, $capability))->toBeFalse();
    }
});
