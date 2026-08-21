<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;

/**
 * Province -> city -> district, one row per district.
 *
 * The only reference table with a surrogate key, because the natural key is
 * all three columns together. The levels above district are recovered with a
 * DISTINCT rather than kept as their own tables.
 */
#[Table('geography')]
#[Fillable(['province', 'city', 'district'])]
class Geography extends Model
{
    public $timestamps = false;
}
