<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DomainJson;
use App\Persistence\Repositories\DomainEventRepository;
use Illuminate\Http\JsonResponse;

/**
 * The machine-readable log, for the dashboard to count from.
 *
 * events.ts explains why this sits beside the audit trail rather than replacing
 * it: counting scholars from prose means regexing sentences, and explaining a
 * change from this means guessing.
 *
 * The whole log, unpaginated. The dashboard filters it by date range and by
 * term in memory, exactly as its TypeScript original does, and slicing it into
 * pages here would mean answering "how many awards were revoked this year" from
 * one page of the answer.
 */
final class EventController extends Controller
{
    public function __construct(private readonly DomainEventRepository $events) {}

    public function index(): JsonResponse
    {
        return response()->json(['data' => DomainJson::encodeList($this->events->all())]);
    }
}
