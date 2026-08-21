<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * An award paired with what it actually pays after the merge.
 *
 * Mirrors MergedAward in src/lib/scholarship/types.ts.
 *
 * Not readonly, unlike everything else in this namespace: MergeService walks
 * one fee head at a time across every award, appending to each award's list as
 * it goes, exactly as the TypeScript pushes into `m.components`. Rebuilding the
 * objects at the end instead would be tidier PHP and a less faithful port, and
 * fidelity is what the test suite is checking.
 */
final class MergedAward
{
    /** @param MergedComponent[] $components */
    public function __construct(
        public readonly Award $award,
        public readonly Scholarship $scholarship,
        public array $components = [],
    ) {}

    public function addComponent(MergedComponent $component): void
    {
        $this->components[] = $component;
    }
}
