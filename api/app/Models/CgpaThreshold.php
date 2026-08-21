<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A minimum CGPA applying to one intake and every intake after it.
 *
 * Written this way because that is how the policy is written: "2.65 for Fall
 * 2024 and onwards, 2.50 for Fall 2023". minCgpaFor() picks the latest
 * threshold at or before the student's batch, resolving from_batch through
 * batches.sort_order rather than by label.
 */
#[Fillable(['scholarship_id', 'from_batch', 'min_cgpa'])]
class CgpaThreshold extends Model
{
    use HasCanonicalUlids;

    public $timestamps = false;

    protected function casts(): array
    {
        return ['min_cgpa' => 'float'];
    }

    public function criteria(): BelongsTo
    {
        return $this->belongsTo(EligibilityCriteria::class, 'scholarship_id');
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class, 'from_batch', 'label');
    }
}
