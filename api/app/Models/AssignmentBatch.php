<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One commit of many awards, so a mistaken assignment can be undone as a unit.
 *
 * types.ts carries an awardIds array on this. It is not a column: it is exactly
 * the set of awards pointing here, and a second copy is how the two disagree.
 * Read it from the relation.
 *
 * Undo deletes this batch's awards but keeps the batch row, so the trail still
 * shows that an assignment happened and was taken back. That is what `undone`
 * is for, and nothing else in the schema is hard-deleted.
 *
 * assignment_mode, not mode: MODE is an Oracle reserved word.
 */
#[Fillable(['scholarship_id', 'actor', 'reason', 'assignment_mode', 'undone'])]
class AssignmentBatch extends Model
{
    use HasCanonicalUlids;

    protected function casts(): array
    {
        return ['undone' => 'boolean'];
    }

    public function scholarship(): BelongsTo
    {
        return $this->belongsTo(Scholarship::class);
    }

    public function awards(): HasMany
    {
        return $this->hasMany(Award::class, 'batch_id');
    }
}
