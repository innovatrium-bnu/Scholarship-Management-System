<?php

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| Feature tests get a real Oracle schema, migrated fresh and rolled back per
| test. The schema is not portable — IS JSON check constraints, NUMBER(1)
| booleans, a deferrable unique constraint — so there is no in-memory shortcut
| to take here. They connect as bnu_test rather than bnu; api/phpunit.xml
| explains why that is the line that keeps a test run off the development data.
|
| Unit tests are left alone: the ported domain services (merge, evaluate,
| rates, screening) are pure functions over plain values, exactly as their
| TypeScript originals are. Giving them a database would be slower and would
| let a mistake hide behind one.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
*/

/**
 * Money and percentages, compared the way the TypeScript suite compares them.
 *
 * The domain modules were written in TypeScript, where every number is a
 * double. Reproducing their results in PHP means accepting the same rounding,
 * so equality on these values is "equal to the paisa", not bit-identical.
 */
expect()->extend('toEqualMoney', function (float $expected) {
    return $this->toEqualWithDelta($expected, 0.005);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
*/

/**
 * Read a source file from the React application.
 *
 * The TypeScript domain modules and their fixtures are the specification for
 * the PHP port, so a few tests read them directly rather than keeping a second
 * copy of values that would quietly drift.
 */
function frontendSource(string $relativePath): string
{
    $path = base_path('../'.$relativePath);

    if (! is_file($path)) {
        throw new RuntimeException("Expected frontend source at $relativePath");
    }

    return file_get_contents($path);
}
