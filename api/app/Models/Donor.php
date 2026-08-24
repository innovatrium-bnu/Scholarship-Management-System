<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Where the money comes from.
 *
 * Until this table existed a donor was a free-text donor_name on a scholarship,
 * so one organisation funding three scholarships was three unrelated strings.
 * The unique name on this table is what makes a donor one thing, and it is the
 * reason the module can answer what a donor still owes.
 *
 * Archived, never deleted: a donor whose money paid a student's fee is part of
 * that student's financial record.
 */
#[Fillable([
    'name', 'kind', 'contact_name', 'contact_email', 'contact_phone',
    'notes', 'status',
])]
class Donor extends Model
{
    use HasCanonicalUlids;

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'Active');
    }

    public function pledges(): HasMany
    {
        return $this->hasMany(Pledge::class);
    }

    public function donations(): HasMany
    {
        return $this->hasMany(Donation::class);
    }

    /** Scholarships this donor funds, once the link has been made. */
    public function scholarships(): HasMany
    {
        return $this->hasMany(Scholarship::class);
    }
}
