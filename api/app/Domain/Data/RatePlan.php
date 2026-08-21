<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * One afternoon's decision about who in a batch is paid how much.
 *
 * Mirrors RatePlan in src/lib/scholarship/rates.ts.
 *
 * Two levels: what the batch pays by default, and every student who was
 * decided differently. A head absent from either level means "whatever the
 * level above decided" — which is why an explicit zero is meaningful and not
 * the same as no entry. Zero is a person having looked and said no; absence is
 * nobody having looked at all.
 *
 * Immutable, like the TypeScript original: every editing method returns a new
 * plan. A batch assignment screen holds one of these in state and replaces it
 * on each edit, so mutation would make the undo stack lie.
 */
final readonly class RatePlan
{
    public function __construct(
        /** @var array<string,float> Fee head => percent, for everyone in the batch. */
        public array $batch = [],
        /** @var array<string,array<string,float>> Reg no => fee head => percent. */
        public array $perStudent = [],
    ) {}

    public static function empty(): self
    {
        return new self;
    }
}
