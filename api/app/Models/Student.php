<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A student. The registration number is the key.
 *
 * It is the university's own identifier, it appears on every award and
 * application, and it is what a registrar types into the search box — a
 * surrogate id would be a second identity for the same person with no reader.
 *
 * Age is deliberately absent: it is derived from date_of_birth, and storing
 * both lets them drift with the stale one winning by accident.
 *
 * The four fee columns stay four columns rather than becoming a student_fees
 * table, because merge.ts switches on the four core head names literally and
 * the browser still runs that copy of the merge.
 */
#[Fillable([
    'reg_no', 'name', 'school', 'programme', 'study_level', 'batch',
    'cgpa', 'credit_hours', 'domicile', 'is_out_of_station',
    'tuition_fee', 'hostel_fee', 'mess_fee', 'other_fee',
    'province', 'city', 'district',
    'financial_need_verified', 'personal_statement_ok', 'has_sports_medal', 'bfit_member',
    'quota', 'gender', 'date_of_birth', 'father_name', 'email', 'phone',
    'attendance_pct', 'photo_url', 'admission_date', 'enrollment_status',
    'current_semester', 'credits_earned',
])]
class Student extends Model
{
    protected $primaryKey = 'reg_no';

    protected $keyType = 'string';

    public $incrementing = false;

    protected function casts(): array
    {
        return [
            'cgpa' => 'float',
            'credit_hours' => 'integer',
            'is_out_of_station' => 'boolean',
            'tuition_fee' => 'float',
            'hostel_fee' => 'float',
            'mess_fee' => 'float',
            'other_fee' => 'float',
            'financial_need_verified' => 'boolean',
            'personal_statement_ok' => 'boolean',
            'has_sports_medal' => 'boolean',
            'bfit_member' => 'boolean',
            'date_of_birth' => 'date',
            'attendance_pct' => 'float',
            'admission_date' => 'date',
            'current_semester' => 'integer',
            'credits_earned' => 'integer',
        ];
    }

    public function scopeEnrolled(Builder $query): Builder
    {
        return $query->where('enrollment_status', 'Enrolled');
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class, 'school', 'name');
    }

    public function programme(): BelongsTo
    {
        return $this->belongsTo(Programme::class, 'programme', 'name');
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class, 'batch', 'label');
    }

    public function quota(): BelongsTo
    {
        return $this->belongsTo(Quota::class, 'quota', 'name');
    }

    public function awards(): HasMany
    {
        return $this->hasMany(Award::class, 'student_reg_no', 'reg_no');
    }

    public function needApplications(): HasMany
    {
        return $this->hasMany(NeedApplication::class, 'student_reg_no', 'reg_no');
    }
}
