<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * The naming convention that separates a test schema from a real one.
     *
     * Oracle has no "test database" the way Postgres did — a schema is just a
     * user, and bnu and bnu_test are peers with identical privileges. Nothing
     * about the connection itself says which one is safe to wipe.
     */
    private const TEST_SCHEMA_SUFFIX = '_test';

    /**
     * Refuse to run if the suite is not pointed at a test schema.
     *
     * RefreshDatabase opens by dropping every table it can see, so the cost of
     * getting this wrong is the development data, silently, before a single
     * assertion runs. api/phpunit.xml forces DB_USERNAME to bnu_test, but a
     * real environment variable outranks it — which is exactly what setting
     * DB_* on the api service in docker-compose.yml would do, and why that
     * file says not to.
     *
     * Checked here rather than anywhere more elegant because this is the last
     * point that is still before the wipe: parent::setUp() creates the
     * application and then runs the trait's hooks, and the tables are gone by
     * the time it returns. Reads the environment directly for the same reason
     * — there is no application yet to ask.
     */
    protected function setUp(): void
    {
        // Every source, not the first one that answers. PHPUnit's force="true"
        // writes $_ENV and putenv() but leaves a real environment variable
        // sitting in $_SERVER, so the three can disagree about who we are about
        // to connect as. Rather than guess which one Laravel will read, treat
        // any disagreement as reason enough to stop.
        $names = array_unique(array_filter([
            $_SERVER['DB_USERNAME'] ?? null,
            $_ENV['DB_USERNAME'] ?? null,
            getenv('DB_USERNAME') ?: null,
        ], fn ($value) => is_string($value) && $value !== ''));

        $unsafe = array_filter(
            $names,
            fn ($name) => ! str_ends_with($name, self::TEST_SCHEMA_SUFFIX)
        );

        if ($names === [] || $unsafe !== []) {
            throw new RuntimeException(
                'Refusing to run tests as database user '.
                ($names === [] ? '(none set)' : '"'.implode('", "', $unsafe).'"').
                '. Feature tests drop every table in the schema they connect to, and only '.
                'a user whose name ends in "'.self::TEST_SCHEMA_SUFFIX.'" is assumed to be '.
                'one nobody minds losing. Check that DB_USERNAME is not set as a real '.
                'environment variable — api/phpunit.xml cannot reliably override one.'
            );
        }

        parent::setUp();
    }
}
