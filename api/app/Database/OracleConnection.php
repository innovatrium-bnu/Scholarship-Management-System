<?php

namespace App\Database;

use Yajra\Oci8\Oci8Connection;
use Yajra\Oci8\Schema\Grammars\OracleGrammar;
use Yajra\Oci8\Schema\OracleBuilder;

/**
 * The oracle connection, with our schema grammar and our preferences on it.
 *
 * Both corrections have to be made here because yajra/laravel-oci8 builds those
 * two collaborators itself, with `new`, and offers no seam to replace either:
 * getSchemaBuilder() constructs a fresh OracleBuilder per call, and that
 * builder's constructor constructs its own OraclePreferences. Nothing is
 * resolved out of the container, so the only place to intervene is the
 * connection that owns them.
 *
 * Keeping both here — rather than reaching in from AppServiceProvider, which is
 * where the grammar used to be applied — means a connection is correct however
 * it was built. That matters more than it sounds: Laravel rebuilds connections
 * on reconnect, and a fix applied once at resolve time would be a fix that
 * quietly stops being applied.
 */
class OracleConnection extends Oci8Connection
{
    /**
     * A schema builder whose preference handling is guarded.
     *
     * The builder is replaced wholesale on every call by the parent, so the
     * substitution has to happen on every call too. ctxDdlPreferences is a
     * public property on the package's builder, which is the whole reason this
     * can be done by assignment instead of by subclassing the builder.
     */
    public function getSchemaBuilder(): OracleBuilder
    {
        $builder = parent::getSchemaBuilder();

        $builder->ctxDdlPreferences = new OraclePreferences($this);

        return $builder;
    }

    /**
     * Our grammar, resolved the same lazy way the package resolves its own.
     *
     * @see OracleSchemaGrammar for what the four differences are and why.
     */
    protected function getDefaultSchemaGrammar(): OracleGrammar
    {
        return new OracleSchemaGrammar($this);
    }
}
