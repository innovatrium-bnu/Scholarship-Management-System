<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Support\Str;

/**
 * ULID primary keys in the canonical uppercase form.
 *
 * Laravel's HasUlids lowercases what it generates. The demo seeder does not —
 * it writes `(string) Str::ulid()`, which is Crockford base32 as the ULID
 * specification defines it, in uppercase. So a seeded row and a row the running
 * application created carried the same kind of identifier in two different
 * cases, and Oracle compares CHAR case-sensitively: an id was findable only in
 * the case it happened to be written in, and `GET /api/applications/{id}`
 * answered 200 for one spelling and 404 for the other.
 *
 * Nothing inside the application noticed, because ids are round-tripped
 * verbatim — you get back what you were given. It surfaces at the edges, which
 * is where identifiers are actually compared by hand: a report joined against
 * an export, a support query pasted from an email, the CMS interface described
 * in api-requirements.md. The handover already lists CHAR-column identifier
 * comparison as a trap this codebase has been caught by once.
 *
 * Uppercase rather than lowercase because that is what the specification says,
 * what Symfony's Ulid produces, and what the 800-odd rows already in the
 * database use. Lowercasing to match Laravel would mean rewriting them.
 *
 * A trait rather than a method on App\Models\Model, because trait methods take
 * precedence over inherited ones: an override on the base class would be
 * silently shadowed by HasUlids in every model that uses it, which is the
 * failure this fixes rather than a way to fix it.
 */
trait HasCanonicalUlids
{
    use HasUlids;

    public function newUniqueId(): string
    {
        return (string) Str::ulid();
    }
}
