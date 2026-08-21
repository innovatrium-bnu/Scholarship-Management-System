<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * What one award pays, per fee head.
 *
 * entitlement_value is what the scholarship promises; applied is what survives
 * the merge against the 100% ceiling. Both are stored rather than recomputed on
 * read, so a historical award still shows what was actually granted even after
 * precedence is reordered.
 *
 * A pinned component (is_overridden) is honoured first and consumes the ceiling
 * before anything else, which is how a hand-agreed amount survives a
 * scholarship that would otherwise outrank it.
 */
#[Fillable([
    'award_id', 'fee_head', 'entitlement_kind', 'entitlement_value',
    'entitlement', 'applied', 'is_overridden', 'override_reason', 'override_authority',
])]
class AwardComponent extends Model
{
    use HasCanonicalUlids;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'entitlement_value' => 'float',
            'entitlement' => 'float',
            'applied' => 'float',
            'is_overridden' => 'boolean',
        ];
    }

    public function award(): BelongsTo
    {
        return $this->belongsTo(Award::class);
    }

    public function feeHead(): BelongsTo
    {
        return $this->belongsTo(FeeHead::class, 'fee_head', 'name');
    }
}
