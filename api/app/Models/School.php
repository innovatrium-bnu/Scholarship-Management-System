<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A school of the university. The name is the key — see README.md here.
 */
#[Fillable(['name', 'sort_order'])]
class School extends Model
{
    protected $primaryKey = 'name';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }

    public function programmes(): HasMany
    {
        return $this->hasMany(Programme::class, 'school', 'name');
    }

    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'school', 'name');
    }
}
