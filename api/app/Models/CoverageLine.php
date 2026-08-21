<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * What a scholarship pays against one fee head.
 *
 * `value` is a percent for Percentage, PKR for Fixed amount, and ignored for
 * Full waiver — the dual meaning is types.ts's, not ours.
 */
#[Fillable(['scholarship_id', 'fee_head', 'benefit_kind', 'value', 'conditional_on'])]
class CoverageLine extends Model
{
    use HasCanonicalUlids;

    public $timestamps = false;

    protected function casts(): array
    {
        return ['value' => 'float'];
    }

    public function scholarship(): BelongsTo
    {
        return $this->belongsTo(Scholarship::class);
    }

    public function feeHead(): BelongsTo
    {
        return $this->belongsTo(FeeHead::class, 'fee_head', 'name');
    }
}
