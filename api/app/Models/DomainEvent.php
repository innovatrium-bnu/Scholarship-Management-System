<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;

/**
 * What happened, in a shape a query can count.
 *
 * The sibling of AuditEntry, and neither can do the other's job: counting
 * scholars from the audit log means regexing sentences, and explaining a change
 * from this log means guessing.
 *
 * No foreign keys and no relations, for the same reason as AuditEntry — this is
 * a record of something that happened and must stay true after the rows it
 * mentions are gone. ReportService reads counts from here rather than from the
 * awards table precisely because the awards table only knows the present.
 *
 * semester is stored rather than derived from `at`, so reports can group by
 * term without resolving a date to a term at query time.
 */
#[Fillable([
    'kind', 'at', 'semester', 'student_reg_no', 'scholarship_id', 'donor_id', 'amount_pkr',
    'award_id', 'application_id', 'batch_id', 'payload',
])]
class DomainEvent extends Model
{
    use HasCanonicalUlids;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'at' => 'datetime',
            // Float, never decimal:2 — decimal:2 returns strings.
            'amount_pkr' => 'float',
            'payload' => 'array',
        ];
    }

    public function scopeOfKind(Builder $query, string $kind): Builder
    {
        return $query->where('kind', $kind);
    }

    public function scopeForSemester(Builder $query, string $semester): Builder
    {
        return $query->where('semester', $semester);
    }
}
