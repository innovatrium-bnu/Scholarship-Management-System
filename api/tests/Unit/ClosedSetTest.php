<?php

declare(strict_types=1);

use App\Domain\Support\HouseholdOptions;
use App\Domain\Support\RevocationCause;

/**
 * The remaining PHP copies of TypeScript unions, checked against the original.
 *
 * EnrollmentStatusTest does this for the fourth. Same trade and same safeguard:
 * the server states what is valid rather than asking the client, and a test
 * parses types.ts so the two cannot drift in silence. Drift would be quiet in
 * both directions — the API rejecting a value its own screens offer, or a
 * stored row rendering as an unknown state.
 *
 * All three were validated as ['required', 'string', 'max:255'] and accepted
 * anything. The revocation cause is the expensive one: it is the column the
 * per-term gained/lost report groups by, so a value outside the set is funding
 * that stopped for a reason nothing counts.
 */

/**
 * Pull a quoted union out of types.ts.
 *
 * Two shapes to cope with, because the two unions are declared differently:
 * RevocationCause is a named `export type`, while guardianStatus and residence
 * are inline property types on the HouseholdInfo interface.
 *
 * @return list<string>
 */
function unionValues(string $pattern, string $what): array
{
    // The path by hand rather than frontendSource(), which needs base_path()
    // and so needs the application booted. This is a unit test and does not
    // boot it -- the same reason EnrollmentStatusTest resolves its own path.
    $path = dirname(__DIR__, 3).'/src/lib/scholarship/types.ts';

    if (! is_file($path)) {
        throw new RuntimeException("Expected the frontend types at {$path}");
    }

    $source = file_get_contents($path);

    if (preg_match($pattern, $source, $found) !== 1) {
        throw new RuntimeException("Could not find {$what} in types.ts");
    }

    preg_match_all('/"([^"]+)"/', $found[1], $values);

    return $values[1];
}

it('parsed all three unions, so the comparisons below are not vacuous', function () {
    expect(typescriptCauses())->toHaveCount(4)
        ->and(typescriptGuardianStatuses())->toHaveCount(5)
        ->and(typescriptResidences())->toHaveCount(3);
});

/** @return list<string> */
function typescriptCauses(): array
{
    return unionValues(
        '/export type RevocationCause\s*=\s*([^;]+);/',
        'the RevocationCause union'
    );
}

/** @return list<string> */
function typescriptGuardianStatuses(): array
{
    return unionValues('/\n\s*guardianStatus:\s*([^;]+);/', 'HouseholdInfo.guardianStatus');
}

/** @return list<string> */
function typescriptResidences(): array
{
    return unionValues('/\n\s*residence:\s*([^;]+);/', 'HouseholdInfo.residence');
}

it('knows exactly the revocation causes types.ts declares', function () {
    $declared = typescriptCauses();
    $mine = RevocationCause::ALL;

    sort($declared);
    sort($mine);

    expect($declared)->toBe($mine);
});

it('knows exactly the guardian statuses types.ts declares', function () {
    $declared = typescriptGuardianStatuses();
    $mine = HouseholdOptions::GUARDIAN_STATUSES;

    sort($declared);
    sort($mine);

    expect($declared)->toBe($mine);
});

it('knows exactly the residence kinds types.ts declares', function () {
    $declared = typescriptResidences();
    $mine = HouseholdOptions::RESIDENCE_KINDS;

    sort($declared);
    sort($mine);

    expect($declared)->toBe($mine);
});

it('names the two causes the writers actually record', function () {
    // Revoking by hand and archiving a scholarship are the only two paths that
    // write a revocation row today. The other two are declared because types.ts
    // declares them, and the lists must match.
    expect(RevocationCause::ALL)->toContain(RevocationCause::BY_HAND)
        ->and(RevocationCause::ALL)->toContain(RevocationCause::SCHOLARSHIP_ARCHIVED);
});
