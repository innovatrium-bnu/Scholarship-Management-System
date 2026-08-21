<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditEntry;
use App\Persistence\DomainDate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The human-readable history.
 *
 * Ordered by id rather than by occurred_at. The ids are ULIDs, which sort by
 * generation time, so they break ties between entries written in the same
 * millisecond — which a batch assignment does routinely. occurred_at alone
 * cannot order those, and an audit trail that lists the same instant in an
 * arbitrary order is hard to read as a sequence of events.
 */
final class AuditController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = AuditEntry::query();

        if ($type = $request->query('entityType')) {
            $query->where('entity_type', $type);
        }

        if ($id = $request->query('entityId')) {
            $query->where('entity_id', $id);
        }

        $page = $query->orderByDesc('occurred_at')->orderByDesc('id')->paginate(
            perPage: min((int) $request->query('perPage', 50), 200)
        );

        return response()->json([
            'data' => array_map(fn (AuditEntry $entry) => [
                'id' => $entry->id,
                'entityType' => $entry->entity_type,
                'entityId' => $entry->entity_id,
                'action' => $entry->action,
                'actor' => $entry->actor,
                'reason' => $entry->reason,
                'oldValue' => $entry->old_value,
                'newValue' => $entry->new_value,
                'timestamp' => DomainDate::timestamp($entry->occurred_at),
            ], $page->items()),
            'meta' => [
                'total' => $page->total(),
                'perPage' => $page->perPage(),
                'currentPage' => $page->currentPage(),
                'lastPage' => $page->lastPage(),
            ],
        ]);
    }
}
