<?php

declare(strict_types=1);

namespace App\Persistence\Writers;

use App\Models\AuditEntry;
use Illuminate\Support\Carbon;

/**
 * Appends to the human-readable history.
 *
 * The sibling of DomainEventRepository, and the two are written together on
 * every mutation: the event says what happened in a shape a query can count,
 * this says what a person did in a sentence someone can read. events.ts
 * explains why neither can do the other job.
 *
 * There is no Domain\Data class for an audit entry, and that is deliberate
 * rather than an omission — nothing in app/Domain reads the audit log. It is an
 * application concern, so it lives here and works with the model directly.
 *
 * Never opens a transaction. An audit row that survives a rolled-back change is
 * a lie about what happened, so this always joins the caller's transaction.
 */
final class AuditWriter
{
    /**
     * @param  array<string, mixed>|null  $oldValue
     * @param  array<string, mixed>|null  $newValue
     */
    public function record(
        string $entityType,
        string $entityId,
        string $action,
        string $actor,
        ?string $reason = null,
        ?array $oldValue = null,
        ?array $newValue = null,
        ?Carbon $at = null,
    ): AuditEntry {
        return AuditEntry::create([
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'action' => $action,
            'actor' => $actor,
            'reason' => $reason,
            'old_value' => $oldValue,
            'new_value' => $newValue,
            'occurred_at' => $at ?? now(),
        ]);
    }
}
