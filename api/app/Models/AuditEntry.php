<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;

/**
 * What a person did, in English, for someone reading a history.
 *
 * Polymorphic by design but deliberately NOT a morphTo relation: an audit row
 * must outlive what it describes. An undone batch deletes its awards, and the
 * entry saying so has to survive that, so entity_id is an untyped string with
 * no foreign key and there is no relation method here to tempt otherwise.
 *
 * Called occurred_at, not timestamp: TIMESTAMP is an Oracle keyword and a
 * datatype name, so the column would need quoting in every hand-written query
 * for the rest of its life.
 *
 * The ULID matters here beyond collision-avoidance. The prototype numbered
 * these sequentially and repeated ids after an undo; a ULID also sorts by
 * generation time, which gives a stable order to entries written in the same
 * millisecond — something occurred_at alone cannot do.
 */
#[Fillable([
    'entity_type', 'entity_id', 'action', 'old_value', 'new_value',
    'reason', 'actor', 'occurred_at',
])]
class AuditEntry extends Model
{
    use HasCanonicalUlids;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'old_value' => 'array',
            'new_value' => 'array',
            'occurred_at' => 'datetime',
        ];
    }
}
