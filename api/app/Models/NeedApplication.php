<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A need-based application, and the household it declares.
 *
 * Students do not log in here — applications arrive from the admission portal
 * and this is the Registrar Office's review queue.
 *
 * The household fields are inlined with a household_ prefix rather than given
 * their own table: strictly one-to-one and always present, so a separate table
 * would be a join that can never return a different number of rows.
 */
#[Fillable([
    'student_reg_no', 'scholarship_id', 'semester', 'submitted_at',
    'household_monthly_income', 'household_earning_members', 'household_dependants',
    'household_siblings_at_bnu', 'household_guardian_occupation',
    'household_guardian_status', 'household_residence', 'household_monthly_rent',
    'household_owns_vehicle', 'statement', 'requested_pct', 'status',
])]
class NeedApplication extends Model
{
    use HasCanonicalUlids;

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
            'household_monthly_income' => 'float',
            'household_earning_members' => 'integer',
            'household_dependants' => 'integer',
            'household_siblings_at_bnu' => 'integer',
            'household_monthly_rent' => 'float',
            'household_owns_vehicle' => 'boolean',
            'requested_pct' => 'float',
        ];
    }

    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class, 'student_reg_no', 'reg_no');
    }

    public function scholarship(): BelongsTo
    {
        return $this->belongsTo(Scholarship::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(ApplicationDocument::class, 'application_id');
    }

    /**
     * At most one, and its absence is meaningful: an application with no
     * decision row is still in the queue. That is a fact about the data rather
     * than a status string that can disagree with it.
     */
    public function decision(): HasOne
    {
        return $this->hasOne(ApplicationDecision::class, 'application_id');
    }
}
