<?php

namespace App\Database;

use Yajra\Oci8\Schema\OraclePreferences as BasePreferences;

/**
 * One guard yajra/laravel-oci8 already wrote and then did not apply.
 *
 * Oracle Text ships its CTX_DDL machinery — and the ctx_user_preferences view
 * the package reads — under a CTXSYS schema that only exists if the option was
 * installed. It is absent on our XE image and, until BNU answers P4, unknown on
 * theirs. The package knows this: drop() and dropIfExists() both call
 * checkIfCtxsysIsEnabled() before touching preferences. dropAllTables() does
 * not, so it runs a PL/SQL loop over a view that is not there and raises
 * ORA-00942.
 *
 * The failure is worth describing because it does not look like a schema
 * problem. FreshCommand only calls db:wipe once a `migrations` table exists, so
 * the first migrate:fresh against a clean schema never reaches this code and
 * passes. Every run after it fails, and because RefreshDatabase wipes for the
 * whole suite, they fail together — every feature test at once, on a schema
 * that was fine a moment ago.
 *
 * Guarding here rather than overriding dropAllTables() keeps the override to
 * the one method that is wrong, and covers any other caller the package grows
 * later. Where CTXSYS does exist this class is a straight pass-through, so a
 * server with Oracle Text installed gets the package's intended behaviour.
 */
class OraclePreferences extends BasePreferences
{
    /**
     * Drop every full-text preference, if there can be any to drop.
     */
    public function dropAllPreferences(): void
    {
        if (! $this->checkIfCtxsysIsEnabled()) {
            return;
        }

        parent::dropAllPreferences();
    }
}
