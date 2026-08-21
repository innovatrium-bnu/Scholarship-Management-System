<?php

declare(strict_types=1);

namespace App\Persistence\Repositories;

use App\Domain\Data\DomainEvent;
use App\Models\DomainEvent as EventRecord;
use App\Persistence\Mappers\DomainEventMapper;

/**
 * The event log: read for reports, appended to for everything else.
 *
 * Append-only by design. There is no update and no delete here, and there
 * should not be — ReportService reads this instead of the awards table
 * precisely because the awards table only knows the present, and an event log
 * that can be rewritten is just a slower awards table.
 */
final class DomainEventRepository
{
    /**
     * The whole log, oldest first.
     *
     * ReportService takes the full array and filters it in memory, which is
     * what its TypeScript original does and is why it stays pure. That is fine
     * at this size and will not be forever; when it stops being fine, the fix
     * is a narrower read here rather than a query inside the service.
     *
     * @return DomainEvent[]
     */
    public function all(): array
    {
        return DomainEventMapper::toDomainList(
            EventRecord::query()->orderBy('at')->orderBy('id')->get()
        );
    }

    /**
     * @return DomainEvent[]
     */
    public function forSemester(string $semester): array
    {
        return DomainEventMapper::toDomainList(
            EventRecord::query()->forSemester($semester)->orderBy('at')->orderBy('id')->get()
        );
    }

    /**
     * Append one event.
     *
     * Deliberately does not open a transaction. Granting an award and recording
     * that it happened are one atomic act, so the caller owns the transaction
     * and this joins whichever one is already open.
     */
    public function record(DomainEvent $event): EventRecord
    {
        return EventRecord::create(DomainEventMapper::toAttributes($event));
    }

    /**
     * @param  DomainEvent[]  $events
     */
    public function recordMany(array $events): void
    {
        foreach ($events as $event) {
            $this->record($event);
        }
    }
}
