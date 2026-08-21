<?php

declare(strict_types=1);

namespace App\Domain;

use App\Domain\Data\Award;
use App\Domain\Data\CoverageLine;
use App\Domain\Data\MergedAward;
use App\Domain\Data\MergedComponent;
use App\Domain\Data\Scholarship;
use App\Domain\Data\Student;

/**
 * The money engine. A port of src/lib/scholarship/merge.ts.
 *
 * When a student holds more than one scholarship, this decides who pays what.
 * The rules, in the order they apply to each fee head:
 *
 *  1. Pinned lines are honoured in full and consume the ceiling first. A
 *     pinned line is an amount somebody agreed by hand, so it outranks the
 *     precedence order rather than competing in it.
 *  2. Whatever percentage is left is the headroom. Non-pinned lines take from
 *     it in precedence order — the order the scholarships are handed to this
 *     function — until it runs out.
 *  3. Fixed-amount lines never contest the percentage ceiling and are always
 *     granted in full. They are a sum of rupees, not a share of a fee.
 *
 * This runs in two places: here, where it is authoritative and decides what is
 * written to the database, and in the browser, where the TypeScript original
 * draws coverage bars without a round trip. The two must agree to the rupee,
 * which is why this is a transliteration rather than a rewrite — same order of
 * operations, same float arithmetic, same rounding. MergeServiceTest mirrors
 * merge.test.ts case for case.
 */
final class MergeService
{
    /**
     * The fee a student is charged under one head.
     *
     * The four core heads map to columns; anything else falls back to
     * otherFee, exactly as the TypeScript switch does. That fallback is why a
     * fee head can be added at runtime without a schema change — it simply has
     * no per-student amount of its own.
     */
    public function feeOf(Student $student, string $feeHead): float
    {
        return match ($feeHead) {
            'Tuition' => $student->tuitionFee,
            'Hostel' => $student->hostelFee,
            'Mess' => $student->messFee,
            default => $student->otherFee,
        };
    }

    /**
     * Resolve a student's active awards into what each one actually pays.
     *
     * @param  Award[]  $activeAwards
     * @param  Scholarship[]  $scholarships  In precedence order: index 0 outranks index 1.
     * @return MergedAward[] In the same order as $activeAwards.
     */
    public function computeMerge(Student $student, array $activeAwards, array $scholarships): array
    {
        $scholarshipById = [];
        $precedence = [];
        foreach (array_values($scholarships) as $i => $scholarship) {
            $scholarshipById[$scholarship->id] = $scholarship;
            $precedence[$scholarship->id] = $i;
        }

        // An award whose scholarship is not in the list is dropped, not merged
        // against nothing. The TypeScript maps to null and filters.
        $merged = [];
        foreach ($activeAwards as $award) {
            $scholarship = $scholarshipById[$award->scholarshipId] ?? null;
            if ($scholarship === null) {
                continue;
            }
            $merged[] = new MergedAward($award, $scholarship);
        }

        foreach ($this->feeHeadsIn($activeAwards) as $head) {
            $this->mergeOneHead($merged, $head, $precedence);
        }

        return $merged;
    }

    /**
     * Every fee head touched by any of these awards, first-seen order.
     *
     * Order matters only for the order components end up in, but it matters
     * there: the TypeScript builds a Set by iterating awards then components,
     * and a test asserting on components[0] is asserting on this.
     *
     * @param  Award[]  $awards
     * @return string[]
     */
    private function feeHeadsIn(array $awards): array
    {
        $heads = [];
        foreach ($awards as $award) {
            foreach ($award->components as $component) {
                $heads[$component->feeHead] = true;
            }
        }

        return array_keys($heads);
    }

    /**
     * Settle one fee head across every award that touches it.
     *
     * @param  MergedAward[]  $merged
     * @param  array<string,int>  $precedence
     */
    private function mergeOneHead(array $merged, string $head, array $precedence): void
    {
        $pinned = [];
        $nonPinned = [];

        foreach ($merged as $m) {
            $line = $m->award->componentFor($head);
            if ($line === null) {
                continue;
            }

            $entPct = 0.0;
            $entPKR = 0.0;
            if ($line->entitlementKind === CoverageLine::KIND_PERCENTAGE) {
                $entPct = $line->entitlementValue;
            } elseif ($line->entitlementKind === CoverageLine::KIND_FULL_WAIVER) {
                $entPct = 100.0;
            } else {
                $entPKR = $line->entitlementValue;
            }

            $entry = [
                'm' => $m,
                'entPct' => $entPct,
                'entPKR' => $entPKR,
                'kind' => $line->entitlementKind,
                'isOverridden' => $line->isOverridden,
                'overrideReason' => $line->overrideReason,
                'overrideAuthority' => $line->overrideAuthority,
            ];

            if ($line->isOverridden) {
                $pinned[] = $entry;
            } else {
                $nonPinned[] = $entry;
            }
        }

        // Headroom is what is left of 100% once the pinned lines have taken
        // their share. It can be exhausted but never goes negative.
        //
        // A scholarship marked mayExceedCeiling sits outside this accounting
        // altogether, so its pinned lines do not draw on the headroom either.
        // See the grant loop below for why.
        $pctHeadroom = 100.0;
        foreach ($pinned as $p) {
            if (! $p['m']->scholarship->mayExceedCeiling) {
                $pctHeadroom -= $p['entPct'];
            }
        }
        if ($pctHeadroom < 0) {
            $pctHeadroom = 0.0;
        }

        // Precedence ascending: index 0 is the highest priority. A scholarship
        // missing from the list sorts last, matching the TypeScript's ?? 99.
        usort($nonPinned, fn ($a, $b) => ($precedence[$a['m']->scholarship->id] ?? 99)
            <=> ($precedence[$b['m']->scholarship->id] ?? 99));

        foreach ($pinned as $p) {
            $p['m']->addComponent(new MergedComponent(
                feeHead: $head,
                entitlementPct: $p['entPct'],
                entitlementPKR: $p['entPKR'],
                appliedPct: $p['entPct'],
                appliedPKR: $p['entPKR'],
                mergeStatus: MergedComponent::STATUS_FULL,
                isOverridden: true,
                kind: $p['kind'],
                overrideReason: $p['overrideReason'],
                overrideAuthority: $p['overrideAuthority'],
            ));
        }

        foreach ($nonPinned as $e) {
            if ($e['kind'] === CoverageLine::KIND_FIXED_AMOUNT) {
                // A rupee amount is not a share of the fee, so it neither takes
                // from the headroom nor is limited by it.
                $e['m']->addComponent(new MergedComponent(
                    feeHead: $head,
                    entitlementPct: 0.0,
                    entitlementPKR: $e['entPKR'],
                    appliedPct: 0.0,
                    appliedPKR: $e['entPKR'],
                    mergeStatus: MergedComponent::STATUS_FULL,
                    isOverridden: false,
                    kind: $e['kind'],
                ));

                continue;
            }

            if ($e['m']->scholarship->mayExceedCeiling) {
                /*
                 * Donor agreement: this scholarship may take a fee head past
                 * 100%.
                 *
                 * Treated exactly as a fixed amount is -- it neither takes from
                 * the headroom nor is limited by it -- because that is what the
                 * exemption means. The alternative reading, "trim it last but
                 * still trim it", makes the flag do nothing whenever a
                 * higher-precedence award has already claimed the ceiling,
                 * which is the only situation it exists for: the seeder grants
                 * this award only to students who already hold the internal
                 * one.
                 */
                $e['m']->addComponent(new MergedComponent(
                    feeHead: $head,
                    entitlementPct: $e['entPct'],
                    entitlementPKR: 0.0,
                    appliedPct: $e['entPct'],
                    appliedPKR: 0.0,
                    mergeStatus: MergedComponent::STATUS_FULL,
                    isOverridden: false,
                    kind: $e['kind'],
                ));

                continue;
            }

            $granted = min($e['entPct'], $pctHeadroom);
            $pctHeadroom -= $granted;

            $status = MergedComponent::STATUS_FULL;
            if ($granted === 0.0) {
                $status = MergedComponent::STATUS_SUPPRESSED;
            } elseif ($granted < $e['entPct']) {
                $status = MergedComponent::STATUS_TRIMMED;
            }

            $e['m']->addComponent(new MergedComponent(
                feeHead: $head,
                entitlementPct: $e['entPct'],
                entitlementPKR: 0.0,
                appliedPct: $granted,
                appliedPKR: 0.0,
                mergeStatus: $status,
                isOverridden: false,
                kind: $e['kind'],
            ));
        }
    }

    /**
     * Would adding this scholarship push any fee head past 100%?
     *
     * Deliberately naive: it sums raw entitlements and ignores precedence,
     * trimming and pinning entirely. That is the question the assignment screen
     * asks — "is there a conflict here worth warning about" — not "what will
     * the student actually receive", which is computeMerge's job. A breach
     * reported here is a prompt to look, not a refusal.
     *
     * Awards from a scholarship allowed to exceed the ceiling are left out of
     * the sum on both sides. Counting them would warn about a breach that is
     * the agreed arrangement rather than a conflict, and computeMerge does not
     * trim them, so the warning would describe something that never happens.
     *
     * @param  Award[]  $existingAwards
     * @param  Scholarship[]  $scholarships  Needed only to tell which existing
     *                                       awards carry the exemption; an
     *                                       empty list simply exempts none.
     * @return array<int, array{head: string, total: float}>
     */
    public function ceilingBreach(
        Scholarship $candidate,
        array $existingAwards,
        array $scholarships = [],
    ): array {
        $exempt = [];
        foreach ($scholarships as $scholarship) {
            if ($scholarship->mayExceedCeiling) {
                $exempt[$scholarship->id] = true;
            }
        }

        $totals = [];
        $bump = function (string $head, float $pct) use (&$totals): void {
            $totals[$head] = ($totals[$head] ?? 0.0) + $pct;
        };

        foreach ($existingAwards as $award) {
            if (isset($exempt[$award->scholarshipId])) {
                continue;
            }

            foreach ($award->components as $component) {
                if ($component->entitlementKind === CoverageLine::KIND_PERCENTAGE) {
                    $bump($component->feeHead, $component->entitlementValue);
                } elseif ($component->entitlementKind === CoverageLine::KIND_FULL_WAIVER) {
                    $bump($component->feeHead, 100.0);
                }
            }
        }

        if (! $candidate->mayExceedCeiling) {
            foreach ($candidate->coverage as $line) {
                if ($line->benefitKind === CoverageLine::KIND_PERCENTAGE) {
                    $bump($line->feeHead, $line->value);
                } elseif ($line->benefitKind === CoverageLine::KIND_FULL_WAIVER) {
                    $bump($line->feeHead, 100.0);
                }
            }
        }

        $breached = [];
        foreach ($totals as $head => $total) {
            if ($total > 100.0) {
                $breached[] = ['head' => (string) $head, 'total' => $total];
            }
        }

        return $breached;
    }

    /**
     * What the merged awards are worth to this student, in rupees.
     *
     * @param  MergedAward[]  $merged
     */
    public function waiverValuePKR(Student $student, array $merged): float
    {
        $total = 0.0;
        foreach ($merged as $m) {
            foreach ($m->components as $component) {
                $base = $this->feeOf($student, $component->feeHead);
                $total += ($component->appliedPct / 100) * $base + $component->appliedPKR;
            }
        }

        return $total;
    }
}
