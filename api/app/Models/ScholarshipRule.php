<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An award rule (who qualifies) or a retention rule (who keeps it).
 *
 * One table with a rule_type discriminator, because Rule is one shape in
 * types.ts and evaluate() applies the same four kinds to both collections.
 *
 * `threshold` stays a string. types.ts types it `string | number` because what
 * it means depends on `field`, and casting it here would decide that question
 * in the wrong place.
 */
#[Fillable([
    'scholarship_id', 'rule_type', 'kind', 'field', 'operator', 'threshold',
    'description', 'weights', 'percentile', 'sort_order',
])]
class ScholarshipRule extends Model
{
    use HasCanonicalUlids;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'weights' => 'array',
            'percentile' => 'float',
            'sort_order' => 'integer',
        ];
    }

    public function scopeAward(Builder $query): Builder
    {
        return $query->where('rule_type', 'award');
    }

    public function scopeRetention(Builder $query): Builder
    {
        return $query->where('rule_type', 'retention');
    }

    public function scholarship(): BelongsTo
    {
        return $this->belongsTo(Scholarship::class);
    }
}
