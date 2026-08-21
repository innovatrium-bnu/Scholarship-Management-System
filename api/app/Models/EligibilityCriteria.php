<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The thresholds the application filter applies, one row per scholarship.
 *
 * The scholarship is the key, so this model does not use HasUlids: the id is
 * not generated here, it is the scholarship's. Table name is stated because
 * Laravel would otherwise pluralise this to eligibility_criterias.
 *
 * auto_reject_on is the switch that decides how aggressive the filter is. A
 * criterion left out of that list still shows on the application as a flag for
 * the committee, but never rejects on its own — these are settings, not policy
 * carved into code.
 */
#[Table('eligibility_criteria')]
#[Fillable([
    'scholarship_id', 'max_monthly_income', 'min_credit_hours', 'min_attendance_pct',
    'required_documents', 'max_existing_coverage_pct', 'auto_reject_on',
])]
class EligibilityCriteria extends Model
{
    protected $primaryKey = 'scholarship_id';

    protected $keyType = 'string';

    public $incrementing = false;

    protected function casts(): array
    {
        return [
            'max_monthly_income' => 'float',
            'min_credit_hours' => 'integer',
            'min_attendance_pct' => 'float',
            'required_documents' => 'array',
            'max_existing_coverage_pct' => 'float',
            'auto_reject_on' => 'array',
        ];
    }

    public function scholarship(): BelongsTo
    {
        return $this->belongsTo(Scholarship::class);
    }

    public function cgpaThresholds(): HasMany
    {
        return $this->hasMany(CgpaThreshold::class, 'scholarship_id');
    }
}
