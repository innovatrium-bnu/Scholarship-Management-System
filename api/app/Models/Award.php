<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A scholarship granted to a student. This is where the money lives.
 *
 * batch_id is null for awards granted one at a time. It is nullOnDelete rather
 * than cascade on purpose: losing the batch row must never silently delete the
 * money.
 */
#[Fillable([
    'student_reg_no', 'scholarship_id', 'status', 'effective_from',
    'authorised_by', 'reason_code', 'batch_id', 'edited_by_hand', 'edit_reason',
])]
class Award extends Model
{
    use HasCanonicalUlids;

    protected function casts(): array
    {
        return [
            'effective_from' => 'date',
            'edited_by_hand' => 'boolean',
        ];
    }

    /**
     * The merge only ever sees active awards, and this is the hottest read in
     * the application. The composite index on student_reg_no and status exists
     * for exactly this scope.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'Active');
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class, 'student_reg_no', 'reg_no');
    }

    public function scholarship(): BelongsTo
    {
        return $this->belongsTo(Scholarship::class);
    }

    public function assignmentBatch(): BelongsTo
    {
        return $this->belongsTo(AssignmentBatch::class, 'batch_id');
    }

    public function components(): HasMany
    {
        return $this->hasMany(AwardComponent::class);
    }

    /** At most one; a row here means the award has ended. */
    public function revocation(): HasOne
    {
        return $this->hasOne(Revocation::class);
    }
}
