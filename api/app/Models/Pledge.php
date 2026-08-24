<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A commitment, and the schedule it will arrive on.
 *
 * total_amount is stored beside the instalments rather than derived from them,
 * because it is what the donor actually signed. A schedule that does not sum to
 * it is a data error worth being able to catch, not a disagreement to paper
 * over by computing one from the other.
 *
 * renewal_notice_days is a column and not a constant because it is a policy
 * number, and because the variance is real — a government grant and a family
 * trust do not want the same lead time.
 */
#[Fillable([
    'donor_id', 'scholarship_id', 'reference', 'total_amount', 'term_years',
    'starts_on', 'ends_on', 'renewal_notice_days', 'status', 'notes',
])]
class Pledge extends Model
{
    use HasCanonicalUlids;

    protected function casts(): array
    {
        return [
            // Float, not decimal:2. decimal:2 returns strings, and the domain
            // services are typed float because they port TypeScript doubles.
            'total_amount' => 'float',
            'term_years' => 'integer',
            'starts_on' => 'date',
            'ends_on' => 'date',
            'renewal_notice_days' => 'integer',
        ];
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'Active');
    }

    public function donor(): BelongsTo
    {
        return $this->belongsTo(Donor::class);
    }

    /** Null when the pledge is unrestricted rather than earmarked. */
    public function scholarship(): BelongsTo
    {
        return $this->belongsTo(Scholarship::class);
    }

    public function instalments(): HasMany
    {
        return $this->hasMany(PledgeInstalment::class)->orderBy('sequence');
    }

    public function donations(): HasMany
    {
        return $this->hasMany(Donation::class);
    }
}
