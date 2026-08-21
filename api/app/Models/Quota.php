<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An admission category. types.ts is explicit that this is a managed lookup
 * and never a hardcoded union, which is why it is a table at all.
 */
#[Fillable(['name'])]
class Quota extends Model
{
    protected $primaryKey = 'name';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    public function students(): HasMany
    {
        return $this->hasMany(Student::class, 'quota', 'name');
    }
}
