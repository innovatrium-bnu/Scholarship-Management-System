<?php

declare(strict_types=1);

namespace App\Persistence\Mappers;

use App\Domain\Data\DomainEvent;
use App\Models\DomainEvent as EventRecord;
use App\Persistence\DomainDate;

/**
 * An event row, as the domain wants it — and back again.
 *
 * This is the one mapper that maps both ways, because events are the one thing
 * the persistence layer writes on the domain's behalf rather than on a user's.
 *
 * The two shapes disagree on purpose. The domain's DomainEvent is flat: fifteen
 * optional fields, most of them meaningful for one kind of event only. The
 * table is not, because the columns you can index are the columns worth having
 * — kind, at, semester, and the four ids reports group by. Everything else goes
 * into payload, a CLOB with an IS JSON constraint.
 *
 * So the split is not arbitrary and should not drift: a field belongs in a
 * column when something queries or groups by it, and in the payload when it is
 * only ever read back with the row. Moving one from payload to a column later
 * is a migration; moving it the other way loses an index.
 */
final class DomainEventMapper
{
    public static function toDomain(EventRecord $record): DomainEvent
    {
        $payload = $record->payload ?? [];

        return new DomainEvent(
            kind: $record->kind,
            at: DomainDate::timestamp($record->at),
            actor: $payload['actor'] ?? '',
            awardId: $record->award_id,
            studentRegNo: $record->student_reg_no,
            scholarshipId: $record->scholarship_id,
            effectiveFrom: $payload['effectiveFrom'] ?? null,
            semester: $record->semester,
            batchId: $record->batch_id,
            timing: $payload['timing'] ?? null,
            cause: $payload['cause'] ?? null,
            reason: $payload['reason'] ?? null,
            applicationId: $record->application_id,
            outcome: $payload['outcome'] ?? null,
            automatic: $payload['automatic'] ?? null,
            donorId: $record->donor_id,
            amount: $record->amount_pkr,
            pledgeId: $payload['pledgeId'] ?? null,
            donationId: $payload['donationId'] ?? null,
            allocationId: $payload['allocationId'] ?? null,
        );
    }

    /**
     * @param  iterable<EventRecord>  $records
     * @return DomainEvent[]
     */
    public static function toDomainList(iterable $records): array
    {
        $events = [];

        foreach ($records as $record) {
            $events[] = self::toDomain($record);
        }

        return $events;
    }

    /**
     * The attributes a DomainEvent is stored as.
     *
     * Returned rather than written, so the caller decides which transaction
     * this belongs to. Granting an award and recording that it happened are one
     * atomic act, and a mapper that saved on its own would make that impossible
     * to express.
     *
     * Payload keys that are null are dropped rather than stored. A revocation
     * has no outcome and a decision has no cause, so keeping them would write
     * eleven nulls per row into a CLOB to say nothing at all.
     *
     * @return array<string, mixed>
     */
    public static function toAttributes(DomainEvent $event): array
    {
        $payload = array_filter([
            'actor' => $event->actor,
            'effectiveFrom' => $event->effectiveFrom,
            'timing' => $event->timing,
            'cause' => $event->cause,
            'reason' => $event->reason,
            'outcome' => $event->outcome,
            'automatic' => $event->automatic,
            'pledgeId' => $event->pledgeId,
            'donationId' => $event->donationId,
            'allocationId' => $event->allocationId,
        ], fn ($value) => $value !== null);

        return [
            'kind' => $event->kind,
            'at' => $event->at,
            'semester' => $event->semester,
            'student_reg_no' => $event->studentRegNo,
            'scholarship_id' => $event->scholarshipId,
            'donor_id' => $event->donorId,
            'amount_pkr' => $event->amount,
            'award_id' => $event->awardId,
            'application_id' => $event->applicationId,
            'batch_id' => $event->batchId,
            'payload' => $payload === [] ? null : $payload,
        ];
    }
}
