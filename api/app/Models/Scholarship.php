<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A scholarship and its terms.
 *
 * Never versioned: when terms change you create a second scholarship scoped to
 * the newer batches, so this row has one set of terms for life. That is why
 * there is no version column and no history relation.
 *
 * schools/programmes/batches are JSON arrays of reference names rather than
 * pivot tables — the frontend round-trips them verbatim as string[], and
 * `batches` is a derived cache kept in step with batch_mode. They are CLOB with
 * an IS JSON constraint on 19c, and the array cast is what makes that
 * invisible here.
 */
#[Fillable([
    'name', 'description', 'study_level', 'precedence',
    'schools', 'programmes', 'batches', 'batch_mode', 'batch_from',
    'semester_from', 'semester_till', 'all_semesters', 'review_cycle',
    'max_duration_years', 'work_study_hours_per_month', 'requires_reapplication',
    'funding_source', 'donor_name', 'donor_id', 'quota_per_cohort',
    'status', 'effective_from', 'may_exceed_ceiling',
])]
class Scholarship extends Model
{
    use HasCanonicalUlids;

    protected function casts(): array
    {
        return [
            'precedence' => 'integer',
            'schools' => 'array',
            'programmes' => 'array',
            'batches' => 'array',
            'all_semesters' => 'boolean',
            'max_duration_years' => 'integer',
            'work_study_hours_per_month' => 'integer',
            'requires_reapplication' => 'boolean',
            'quota_per_cohort' => 'integer',
            'effective_from' => 'date',
            'may_exceed_ceiling' => 'boolean',
        ];
    }

    /**
     * Precedence order, which is not optional.
     *
     * Precedence decides which scholarship claims a fee head first. The
     * frontend runs its own copy of the merge to draw coverage bars, and it
     * takes the order it is given — so any endpoint that returns scholarships
     * without this scope computes different money from the server.
     */
    public function scopeInPrecedenceOrder(Builder $query): Builder
    {
        return $query->orderBy('precedence');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'Active');
    }

    /**
     * The donor funding this, once one has been registered.
     *
     * Nullable and stays that way: most scholarships are internally funded, and
     * a donor-funded one created before the donors module has a `donor_name`
     * and no id. `donor_name` remains the display fallback.
     */
    public function donor(): BelongsTo
    {
        return $this->belongsTo(Donor::class);
    }

    public function coverageLines(): HasMany
    {
        return $this->hasMany(CoverageLine::class);
    }

    public function rules(): HasMany
    {
        return $this->hasMany(ScholarshipRule::class);
    }

    /** One row at most; the criteria table is keyed by scholarship_id. */
    public function criteria(): HasOne
    {
        return $this->hasOne(EligibilityCriteria::class, 'scholarship_id');
    }

    public function awards(): HasMany
    {
        return $this->hasMany(Award::class);
    }

    public function needApplications(): HasMany
    {
        return $this->hasMany(NeedApplication::class);
    }

    public function assignmentBatches(): HasMany
    {
        return $this->hasMany(AssignmentBatch::class);
    }
}
