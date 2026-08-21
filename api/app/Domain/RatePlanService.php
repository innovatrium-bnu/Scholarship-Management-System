<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Data\CoverageLine;
use App\Domain\Data\RatePlan;
use App\Domain\Data\Scholarship;
use App\Domain\Support\JsNumber;

/**
 * Who in a batch is paid how much, before any of it is saved.
 * A port of src/lib/scholarship/rates.ts.
 *
 * A scholarship carries one set of terms — "50% of tuition" — and for most
 * awards that is exactly right. Need-based awards are the exception, and they
 * are why this exists: a committee reads twenty applications from one
 * scholarship and grants 75% to one family, 25% to the next, and hostel on top
 * for the two who moved cities. A RatePlan holds that whole afternoon as one
 * value.
 *
 * Nothing here touches the database. It turns a plan into the coverage one
 * student is awarded, and the caller hands that to MergeService like any other
 * coverage — so a hand-set rate travels the same path as a standard one and
 * cannot be treated differently by accident. The 100% ceiling still applies: a
 * rate set here is a claim, not a guarantee.
 */
final class RatePlanService
{
    /**
     * The rates the committee actually awards at.
     *
     * Five values rather than a free number box, because these are the ones
     * that appear in the minutes. Anything else is an exception and belongs on
     * the student's own record with a written reason.
     */
    public const AWARD_RATES = [25, 35, 50, 75, 100];

    /**
     * An explicit decision that a fee is not paid — distinct from no entry at
     * all, which means "follow the level above".
     */
    public const NOT_PAID = 0.0;

    /**
     * What the scholarship itself pays on a fee head, as a percentage.
     *
     * Null covers two situations that behave identically here: the scholarship
     * says nothing about this fee, or it pays a fixed sum in rupees. Neither is
     * a percentage, so neither has a standard rate to fall back to.
     */
    public function standardPctOf(Scholarship $scholarship, string $head): ?float
    {
        foreach ($scholarship->coverage as $line) {
            if ($line->feeHead !== $head) {
                continue;
            }
            if ($line->benefitKind === CoverageLine::KIND_FIXED_AMOUNT) {
                return null;
            }

            return $line->benefitKind === CoverageLine::KIND_FULL_WAIVER ? 100.0 : $line->value;
        }

        return null;
    }

    /**
     * Heads the scholarship pays as a fixed sum, which no percentage can express.
     *
     * @return array<string,bool>
     */
    private function fixedHeads(Scholarship $scholarship): array
    {
        $fixed = [];
        foreach ($scholarship->coverage as $line) {
            if ($line->benefitKind === CoverageLine::KIND_FIXED_AMOUNT) {
                $fixed[$line->feeHead] = true;
            }
        }

        return $fixed;
    }

    /**
     * The fee heads a batch may set a rate on, in display order.
     *
     * Everything the scholarship covers comes first, then every other fee the
     * institution charges. The second group is not padding: a scholarship
     * covering only tuition is still the right vehicle for a committee that has
     * decided to pay one student's hostel too.
     *
     * @param  string[]  $feeHeads
     * @return string[]
     */
    public function rateHeads(Scholarship $scholarship, array $feeHeads): array
    {
        $fixed = $this->fixedHeads($scholarship);
        $out = [];
        $seen = [];

        foreach ($scholarship->coverage as $line) {
            if (isset($fixed[$line->feeHead]) || isset($seen[$line->feeHead])) {
                continue;
            }
            $seen[$line->feeHead] = true;
            $out[] = $line->feeHead;
        }

        foreach ($feeHeads as $head) {
            if (isset($fixed[$head]) || isset($seen[$head])) {
                continue;
            }
            $seen[$head] = true;
            $out[] = $head;
        }

        return $out;
    }

    /** The rate everyone in the batch is paid, unless decided individually. */
    public function batchPct(Scholarship $scholarship, RatePlan $plan, string $head): float
    {
        if (array_key_exists($head, $plan->batch)) {
            return $plan->batch[$head];
        }

        return $this->standardPctOf($scholarship, $head) ?? self::NOT_PAID;
    }

    /** The rate one student is paid on one head, after both levels of the plan. */
    public function studentPct(
        Scholarship $scholarship,
        RatePlan $plan,
        string $head,
        string $regNo,
    ): float {
        if (array_key_exists($head, $plan->perStudent[$regNo] ?? [])) {
            return $plan->perStudent[$regNo][$head];
        }

        return $this->batchPct($scholarship, $plan, $head);
    }

    /** The rate set for the whole batch, or null if it follows the scholarship. */
    public function batchRate(RatePlan $plan, string $head): ?float
    {
        return $plan->batch[$head] ?? null;
    }

    /** The rate set for this student alone, or null if they follow the batch. */
    public function studentRate(RatePlan $plan, string $regNo, string $head): ?float
    {
        return $plan->perStudent[$regNo][$head] ?? null;
    }

    public function hasOwnRates(RatePlan $plan, string $regNo): bool
    {
        return ($plan->perStudent[$regNo] ?? []) !== [];
    }

    /**
     * Which of these students were decided individually.
     *
     * @param  iterable<string>  $regNos
     * @return string[]
     */
    public function studentsWithOwnRates(RatePlan $plan, iterable $regNos): array
    {
        $out = [];
        foreach ($regNos as $regNo) {
            if ($this->hasOwnRates($plan, $regNo)) {
                $out[] = $regNo;
            }
        }

        return $out;
    }

    /**
     * True when any head has been moved off the scholarship's own rate.
     *
     * @param  string[]  $feeHeads
     */
    public function hasCustomBatchRates(
        Scholarship $scholarship,
        array $feeHeads,
        RatePlan $plan,
    ): bool {
        foreach ($this->rateHeads($scholarship, $feeHeads) as $head) {
            $set = $this->batchRate($plan, $head);
            if ($set !== null && $set !== ($this->standardPctOf($scholarship, $head) ?? self::NOT_PAID)) {
                return true;
            }
        }

        return false;
    }

    /* ------------------------------------------------------------- editing -- */

    /** Pass null to drop back to the scholarship's own rate. */
    public function setBatchRate(RatePlan $plan, string $head, ?float $pct): RatePlan
    {
        $batch = $plan->batch;
        if ($pct === null) {
            unset($batch[$head]);
        } else {
            $batch[$head] = $pct;
        }

        return new RatePlan($batch, $plan->perStudent);
    }

    /** Pass null to drop this student back to the batch rate. */
    public function setStudentRate(
        RatePlan $plan,
        string $regNo,
        string $head,
        ?float $pct,
    ): RatePlan {
        $own = $plan->perStudent[$regNo] ?? [];
        if ($pct === null) {
            unset($own[$head]);
        } else {
            $own[$head] = $pct;
        }

        $perStudent = $plan->perStudent;

        // An empty record and no record must not both exist, or "has this
        // student been decided individually" gets two different answers.
        if ($own === []) {
            unset($perStudent[$regNo]);
        } else {
            $perStudent[$regNo] = $own;
        }

        return new RatePlan($plan->batch, $perStudent);
    }

    public function clearStudentRates(RatePlan $plan, string $regNo): RatePlan
    {
        if (! isset($plan->perStudent[$regNo])) {
            return $plan;
        }

        $perStudent = $plan->perStudent;
        unset($perStudent[$regNo]);

        return new RatePlan($plan->batch, $perStudent);
    }

    public function clearAllStudentRates(RatePlan $plan): RatePlan
    {
        return new RatePlan($plan->batch, []);
    }

    /* ------------------------------------------------------------ resolving -- */

    /**
     * The coverage one student is actually awarded.
     *
     * Returns ordinary CoverageLines on purpose: everything downstream — award
     * components, the merge, the ceiling arithmetic — already speaks that
     * language.
     *
     * A head resolving to zero is dropped rather than emitted as a 0% line, so
     * an award never carries a component that pays nothing.
     *
     * @param  string[]  $feeHeads
     * @return CoverageLine[]
     */
    public function resolveCoverage(
        Scholarship $scholarship,
        array $feeHeads,
        RatePlan $plan,
        string $regNo,
    ): array {
        $fixed = $this->fixedHeads($scholarship);
        $out = [];
        $done = [];

        foreach ($scholarship->coverage as $line) {
            if ($line->benefitKind === CoverageLine::KIND_FIXED_AMOUNT) {
                // Passed through untouched: a sum in rupees is not a share of a
                // fee, so no rate can express it.
                $out[] = $line;
                $done[$line->feeHead] = true;

                continue;
            }

            if (isset($fixed[$line->feeHead]) || isset($done[$line->feeHead])) {
                continue;
            }
            $done[$line->feeHead] = true;

            $pct = $this->studentPct($scholarship, $plan, $line->feeHead, $regNo);
            if ($pct <= 0) {
                continue;
            }

            // Left untouched when it lands on the scholarship's own rate, so a
            // "Full waiver" line stays a full waiver rather than being
            // rewritten as 100% and reading like someone typed it.
            $out[] = $pct === $this->standardPctOf($scholarship, $line->feeHead)
                ? $line
                : new CoverageLine(
                    id: $line->id,
                    feeHead: $line->feeHead,
                    benefitKind: CoverageLine::KIND_PERCENTAGE,
                    value: $pct,
                    conditionalOn: $line->conditionalOn,
                );
        }

        foreach ($feeHeads as $head) {
            if (isset($fixed[$head]) || isset($done[$head])) {
                continue;
            }

            $pct = $this->studentPct($scholarship, $plan, $head, $regNo);
            if ($pct <= 0) {
                continue;
            }

            $out[] = new CoverageLine(
                id: "rate-$head",
                feeHead: $head,
                benefitKind: CoverageLine::KIND_PERCENTAGE,
                value: $pct,
            );
        }

        return $out;
    }

    /**
     * What a resolved coverage list pays on one fee head, as a percentage.
     *
     * @param  CoverageLine[]  $coverage
     */
    public function pctOfHead(array $coverage, string $head): float
    {
        $total = 0.0;
        foreach ($coverage as $line) {
            if ($line->feeHead !== $head) {
                continue;
            }
            if ($line->benefitKind === CoverageLine::KIND_FULL_WAIVER) {
                $total += 100.0;
            } elseif ($line->benefitKind === CoverageLine::KIND_PERCENTAGE) {
                $total += $line->value;
            }
        }

        return $total;
    }

    /**
     * The plan as one English clause, for the reason recorded on the batch.
     *
     * A summary, and nothing counts it. Every rate it mentions is already a
     * number on an award component, which is where a report reads it from. The
     * sentence exists so somebody opening the audit log in two years can see at
     * a glance that this batch was not paid at the standard rate.
     *
     * @param  string[]  $feeHeads
     * @param  iterable<string>  $regNos
     */
    public function describeRatePlan(
        Scholarship $scholarship,
        array $feeHeads,
        RatePlan $plan,
        iterable $regNos,
    ): string {
        $parts = [];
        foreach ($this->rateHeads($scholarship, $feeHeads) as $head) {
            $set = $this->batchRate($plan, $head);
            $standard = $this->standardPctOf($scholarship, $head) ?? self::NOT_PAID;
            if ($set === null || $set === $standard) {
                continue;
            }

            $parts[] = $set === self::NOT_PAID
                ? 'no '.mb_strtolower($head)
                : JsNumber::text($set).'% of '.mb_strtolower($head);
        }

        $clauses = [];
        if ($parts !== []) {
            $clauses[] = 'awarded at '.$this->joinWords($parts).' by decision';
        }

        $individual = count($this->studentsWithOwnRates($plan, $regNos));
        if ($individual > 0) {
            $clauses[] = $individual.' student'.($individual === 1 ? '' : 's').' set individually';
        }

        return implode(' · ', $clauses);
    }

    /** @param string[] $items */
    private function joinWords(array $items): string
    {
        if (count($items) <= 1) {
            return $items[0] ?? '';
        }

        $last = array_pop($items);

        return implode(', ', $items).' and '.$last;
    }
}
