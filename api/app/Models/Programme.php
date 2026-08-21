<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A degree programme, belonging to a school.
 */
#[Fillable(['name', 'school', 'study_level'])]
class Programme extends Model
{
    protected $primaryKey = 'name';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class, 'school', 'name');
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'programme', 'name');
    }
}
