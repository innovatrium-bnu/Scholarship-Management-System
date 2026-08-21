<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;

/**
 * A term, e.g. "Spring 2026". Ordered by sort_order for the same reason
 * batches are.
 */
#[Fillable(['label', 'sort_order', 'starts_on', 'ends_on'])]
class Semester extends Model
{
    protected $primaryKey = 'label';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'starts_on' => 'date',
            'ends_on' => 'date',
        ];
    }
}
