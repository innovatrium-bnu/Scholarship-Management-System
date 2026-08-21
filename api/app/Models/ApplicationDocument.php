<?php

namespace App\Models;

use App\Models\Concerns\HasCanonicalUlids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A document attached to an application. Metadata only.
 *
 * There is no file storage yet: file_name is a string and nothing is uploaded
 * anywhere. The column for the stored file is deliberately absent rather than
 * nullable, so nothing can half-work — when storage lands it arrives as its own
 * migration and its own decision about where files live.
 *
 * kind matches an entry in eligibility_criteria.required_documents.
 */
#[Fillable(['application_id', 'kind', 'file_name', 'uploaded_at', 'verified'])]
class ApplicationDocument extends Model
{
    use HasCanonicalUlids;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'uploaded_at' => 'datetime',
            'verified' => 'boolean',
        ];
    }

    public function application(): BelongsTo
    {
        return $this->belongsTo(NeedApplication::class, 'application_id');
    }
}
