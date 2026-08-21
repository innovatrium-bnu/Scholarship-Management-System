<?php

declare(strict_types=1);

use App\Domain\Support\EnrollmentStatus;

/**
 * The PHP status list and the TypeScript union, checked against each other.
 *
 * A third copy of a list that already exists in TypeScript, and the third time
 * this project has accepted that trade: RoleMatrix mirrors roles.ts, and
 * ReferenceSeeder mirrors the seed constants. The reasoning is the same each
 * time — the alternative is the server asking the client which values are
 * valid — and so is the safeguard. This parses types.ts and fails if they drift.
 *
 * Drift here would be quiet and expensive. If the frontend gained a fifth
 * status the backend did not know, the API would reject a value its own screens
 * offer; if the backend gained one the frontend did not, a stored row would
 * render as an unknown state. Neither raises anything on its own.
 */
function typesSource(): string
{
    $path = dirname(__DIR__, 3).'/src/lib/scholarship/types.ts';

    if (! is_file($path)) {
        throw new RuntimeException("Expected the frontend types at {$path}");
    }

    return file_get_contents($path);
}

/**
 * The EnrollmentStatus union in types.ts, parsed.
 *
 * @return list<string>
 */
function typescriptStatuses(): array
{
    $source = typesSource();

    $matched = preg_match(
        '/export type EnrollmentStatus\s*=\s*([^;]+);/',
        $source,
        $found
    );

    if ($matched !== 1) {
        throw new RuntimeException('Could not find the EnrollmentStatus union in types.ts');
    }

    preg_match_all('/"([^"]+)"/', $found[1], $values);

    return $values[1];
}

it('parsed something, so the comparison below is not vacuous', function () {
    expect(typescriptStatuses())->toHaveCount(4);
});

it('knows exactly the statuses types.ts declares', function () {
    $declared = typescriptStatuses();
    $mine = EnrollmentStatus::ALL;

    sort($declared);
    sort($mine);

    expect($declared)->toBe($mine);
});

it('treats only Enrolled as studying', function () {
    // The question the rest of the system asks, and the reason the list is
    // constrained at all: awards are granted only to students who are studying.
    expect(EnrollmentStatus::isStudying(EnrollmentStatus::ENROLLED))->toBeTrue();

    foreach ([EnrollmentStatus::ON_LEAVE, EnrollmentStatus::GRADUATED, EnrollmentStatus::WITHDRAWN] as $status) {
        expect(EnrollmentStatus::isStudying($status))->toBeFalse();
    }
});

it('fails closed on a status it does not recognise', function () {
    // Including the value that reached the column before the rule existed.
    expect(EnrollmentStatus::isStudying('Abducted by aliens'))->toBeFalse()
        ->and(EnrollmentStatus::isStudying('enrolled'))->toBeFalse()
        ->and(EnrollmentStatus::isStudying(null))->toBeFalse()
        ->and(EnrollmentStatus::isStudying(''))->toBeFalse();
});
