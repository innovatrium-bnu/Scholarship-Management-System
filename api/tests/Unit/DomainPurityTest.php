<?php

declare(strict_types=1);

/**
 * app/Domain stays pure. Enforced, not promised.
 *
 * The domain services are a transliteration of src/lib/scholarship — same order
 * of operations, same arithmetic — and that is what lets 132 unit tests mirror
 * the TypeScript suite case for case, and lets the browser compute the same
 * money as the server. Two things would end it, and both are one convenient
 * import away:
 *
 *   a query inside a service, which makes it untestable without a database and
 *   unportable back to the TypeScript it mirrors
 *
 *   a dependency on the persistence layer, which inverts the direction the
 *   whole phase depends on
 *
 * Nobody does this on purpose. It happens when a function needs one more fact
 * and the model is right there. So the rule is a test rather than a paragraph
 * in AGENTS.md, and it runs without a database because the domain does.
 *
 * Comments are stripped before scanning. Domain/Data/Student.php says of itself
 * that it is "a plain value object, not an Eloquent model" — exactly the right
 * sentiment, and a naive substring search reads it as a violation.
 */

/** @return array<string, string> path => code, comments removed */
function domainSources(): array
{
    // Derived rather than app_path(), because this test has no Laravel
    // application booted — which is the same reason the domain does not.
    $directory = new RecursiveDirectoryIterator(dirname(__DIR__, 2).'/app/Domain');
    $sources = [];

    foreach (new RecursiveIteratorIterator($directory) as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'php') {
            continue;
        }

        $sources[$file->getPathname()] = codeWithoutComments(
            file_get_contents($file->getPathname())
        );
    }

    return $sources;
}

function codeWithoutComments(string $source): string
{
    $code = '';

    foreach (token_get_all($source) as $token) {
        if (! is_array($token)) {
            $code .= $token;

            continue;
        }

        if ($token[0] === T_COMMENT || $token[0] === T_DOC_COMMENT) {
            continue;
        }

        $code .= $token[1];
    }

    return $code;
}

it('has domain sources to check, so this file is not vacuous', function () {
    // 6 services, 25 data classes, 6 support classes.
    expect(domainSources())->toHaveCount(37);
});

it('imports nothing from Laravel, Eloquent or the database', function () {
    $forbidden = ['Illuminate\\', 'Eloquent', 'DB::', 'Schema::'];

    $problems = [];

    foreach (domainSources() as $path => $code) {
        foreach ($forbidden as $needle) {
            if (str_contains($code, $needle)) {
                $problems[] = basename($path).' uses '.$needle;
            }
        }
    }

    expect($problems)->toBe([]);
});

it('does not depend on the layer that depends on it', function () {
    $problems = [];

    foreach (domainSources() as $path => $code) {
        if (str_contains($code, 'App\\Persistence') || str_contains($code, 'App\\Models')) {
            $problems[] = basename($path);
        }
    }

    expect($problems)->toBe([]);
});
