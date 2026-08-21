<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;

/**
 * A head of fee. Editable at runtime, except the four core ones.
 *
 * is_core marks Tuition, Hostel, Mess and Other — the four the merge engine
 * knows by name and which map to columns on students, so they cannot be
 * deleted. Other fee heads may exist and be covered by a scholarship; they
 * simply carry no per-student amount.
 */
#[Fillable(['name', 'is_core', 'sort_order'])]
class FeeHead extends Model
{
    protected $primaryKey = 'name';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'is_core' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
