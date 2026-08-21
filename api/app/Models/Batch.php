<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An intake, e.g. "Fall 2023".
 *
 * Order by sort_order, never by label. "Fall" sorts before "Spring"
 * alphabetically, which is the wrong answer for every batchMode "onwards"
 * comparison — the migration says the same thing at the column.
 */
#[Fillable(['label', 'sort_order'])]
class Batch extends Model
{
    protected $primaryKey = 'label';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'batch', 'label');
    }
}
