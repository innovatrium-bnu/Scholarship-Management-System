<?php

namespace App\Database;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Fluent;
use Yajra\Oci8\Schema\Grammars\OracleGrammar;

/**
 * Four corrections to how yajra/laravel-oci8 compiles our schema.
 *
 * Everything else about that package's grammar is right for Oracle 19c and is
 * left alone — including the decisions that look surprising, like json columns
 * compiling to CLOB (19c has no native JSON type) and ulid() compiling to
 * char(26).
 *
 * Registered in AppServiceProvider by wrapping the package's own connection
 * resolver, so the package keeps ownership of session variables and the schema
 * prefix and this class only replaces the grammar.
 */
class OracleSchemaGrammar extends OracleGrammar
{
    /**
     * Booleans become number(1) rather than the package's char(1).
     *
     * Two reasons, and the second is the one that would actually bite.
     *
     * Oracle treats the empty string as NULL. A char(1) flag therefore has
     * three states — '1', '0' and NULL-that-was-'' — and the third arrives
     * silently, because nothing rejects it and a NOT NULL column can still be
     * handed '' by any code path that passes an empty string. number(1) cannot
     * represent that mistake at all: '' cast to a number is an error, not a
     * quiet NULL.
     *
     * And Laravel binds booleans as integers. Against a char(1) column Oracle
     * has to convert one side of every comparison, and it converts the column,
     * which is exactly the shape that stops an index being used. None of these
     * 15 columns is indexed today, but the ones on students are obvious
     * candidates the moment someone reports on them.
     */
    protected function typeBoolean(Fluent $column): string
    {
        return 'number(1)';
    }

    /**
     * varchar2 lengths are counted in characters, not bytes.
     *
     * Oracle's default is BYTE semantics, so a plain varchar2(255) on an
     * AL32UTF8 database holds 255 bytes — as few as 63 characters of Urdu,
     * which is up to 4 bytes each. Student names carry Urdu and Punjabi, so
     * the byte default would truncate real names on insert.
     *
     * Stated per column rather than by setting NLS_LENGTH_SEMANTICS on the
     * session: the length semantics of a column are fixed when it is created,
     * so a session variable makes the schema depend on who happened to run the
     * migration. Writing it into the DDL makes it a property of the table.
     *
     * Ceiling to know about: varchar2 tops out at 4000 bytes unless the
     * database is set to extended string sizes, so the longest column this can
     * express is 1000 characters, not 4000. Nothing here is above 255.
     */
    protected function typeString(Fluent $column): string
    {
        return "varchar2({$column->length} char)";
    }

    /**
     * Numeric and boolean defaults are emitted unquoted.
     *
     * Laravel quotes every default, which leaves `number(1) default '0'` —
     * legal, because Oracle converts it implicitly, but it stores the default
     * as a character literal that is converted on every insert that omits the
     * column. Strings still get quoted; only genuine numbers stop being
     * written as text.
     */
    protected function getDefaultValue($value)
    {
        if (is_bool($value)) {
            return (string) (int) $value;
        }

        if (is_int($value) || is_float($value)) {
            return (string) $value;
        }

        return parent::getDefaultValue($value);
    }

    /**
     * ON DELETE RESTRICT is dropped, because Oracle has no such clause.
     *
     * Oracle's referential actions are CASCADE and SET NULL and nothing else.
     * There is no RESTRICT and no NO ACTION keyword: that behaviour is the
     * default, and the way to ask for it is to write no ON DELETE clause at
     * all. `restrictOnDelete()` therefore compiles to ORA-00905 rather than to
     * a weaker constraint, which is the good failure mode — but only once a
     * server sees it, and 8 of these 13 foreign keys are `cascadeOnDelete()`
     * and compile fine, so the migrations look portable until they run.
     *
     * Removing the clause changes nothing about what the database enforces.
     * The migrations keep saying `restrictOnDelete()` because that is the
     * intent — deleting a referenced row must fail — and this is the one
     * dialect where stating it is a syntax error.
     *
     * ON UPDATE needs no equivalent handling: Oracle has no updatable-key
     * clause either, and the package already drops it silently.
     */
    protected function addForeignKeys(Blueprint $blueprint): string
    {
        foreach ($this->getCommandsByName($blueprint, 'foreign') as $foreign) {
            $this->dropUnsupportedOnDelete($foreign);
        }

        return parent::addForeignKeys($blueprint);
    }

    /**
     * The same, for foreign keys added to a table that already exists.
     *
     * The package compiles the two cases with two separate copies of the
     * clause-building code, so both need the correction. Nothing in this
     * schema takes this path today — every foreign key is declared inside its
     * `Schema::create` — but a later migration adding one to a live table
     * would otherwise hit exactly the error this class just removed.
     */
    public function compileForeign(Blueprint $blueprint, Fluent $command): ?string
    {
        $this->dropUnsupportedOnDelete($command);

        return parent::compileForeign($blueprint, $command);
    }

    /**
     * Null out an ON DELETE that Oracle cannot express, leaving its default.
     */
    protected function dropUnsupportedOnDelete(Fluent $command): void
    {
        if (in_array(strtolower((string) $command->onDelete), ['restrict', 'no action'], true)) {
            $command->onDelete = null;
        }
    }
}
