<?php

namespace App\Providers;

use App\Auth\RoleMatrix;
use App\Database\OracleConnection;
use App\Models\User;
use Illuminate\Database\Connection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->useOracleConnection();
        $this->registerCapabilityGates();
    }

    /**
     * Turn the role matrix into gates, one per capability.
     *
     * Gates rather than model policies, because the permission model is about
     * capabilities and not about rows. roles.ts asks "may this role decide
     * applications", never "may this role decide this particular application" —
     * the Scholarship Committee may decide every application or none. A policy
     * per model would have to invent a per-row question nobody is asking, and
     * would split one matrix across six classes.
     *
     * Registered from the matrix rather than written out, so a capability added
     * to RoleMatrix is enforceable the moment a route names it, and cannot be
     * half-added.
     */
    private function registerCapabilityGates(): void
    {
        foreach (RoleMatrix::CAPABILITIES as $capability) {
            Gate::define(
                $capability,
                fn (User $user) => RoleMatrix::allows($user->role, $capability)
            );
        }
    }

    /**
     * Make the oracle connection ours.
     *
     * Wraps yajra/laravel-oci8's own resolver rather than replacing it. That
     * resolver does more than build a connection — it opens the socket through
     * the package's connector and applies the NLS session variables, the schema
     * prefix and the edition — and reimplementing it here would mean
     * re-deriving all of that on every package upgrade.
     *
     * So the package still does the connecting, and we re-wrap what it hands
     * back. That is sound rather than clever, because of two properties of the
     * class being wrapped: every piece of state Oci8Connection holds is derived
     * in its constructor from $config, which we pass through untouched, and the
     * session variables are not held on the object at all — setSessionVars
     * issues ALTER SESSION against the PDO and keeps nothing. Re-wrapping the
     * same live PDO with the same config therefore reproduces the connection
     * exactly, minus nothing. The package's instance is discarded, not its
     * work; no second connection is opened.
     *
     * Runs in boot() rather than register() because the package registers its
     * resolver in register(), and there has to be something there to wrap.
     * Nothing here opens a connection: resolvers are called lazily, the first
     * time something actually asks for the oracle connection.
     */
    private function useOracleConnection(): void
    {
        $inner = Connection::getResolver('oracle');

        if ($inner === null) {
            return;
        }

        Connection::resolverFor('oracle', function (...$arguments) use ($inner) {
            $connection = $inner(...$arguments);

            return new OracleConnection(
                $connection->getPdo(),
                $connection->getDatabaseName(),
                $connection->getTablePrefix(),
                $connection->getConfig(),
            );
        });
    }
}
