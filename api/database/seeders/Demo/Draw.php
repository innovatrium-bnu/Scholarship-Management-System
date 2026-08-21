<?php

declare(strict_types=1);

namespace Database\Seeders\Demo;

/**
 * Variation without randomness.
 *
 * Every value the demo data varies by comes from here, and every one of them is
 * a pure function of a row index and a salt. Nothing calls rand(), mt_rand() or
 * fake(), for two reasons that both matter more than they sound.
 *
 * The first is that the same command has to produce the same database. A bug
 * reported against "the student on page 4 with two overlapping awards" is only
 * reproducible if page 4 holds the same student tomorrow, and a seeder that
 * rolls dice makes every screenshot, every reg number in a bug report and every
 * hand-written test fixture single-use.
 *
 * The second is that no real person may enter this repository. Data built by
 * arithmetic over two name lists cannot accidentally be a spreadsheet somebody
 * exported from the CMS, and a reviewer can see that from the code rather than
 * having to take it on trust. src/lib/scholarship/seed.ts made the same choice
 * and says so; this is that constraint carried into PHP.
 *
 * What is different here is the arithmetic. seed.ts varies by `(n + i) % 5 === 0`
 * and similar, which is honest at 112 rows and visibly striped at 2,000 — every
 * fifth student in reg-number order carrying the same flag is a pattern a
 * demonstrator notices.
 */
final class Draw
{
    /**
     * A number in [0, 1), decided entirely by $index and $salt.
     *
     * The salt is what makes two draws for the same student independent. Two
     * calls with the same salt return the same number, which is the point:
     * asking twice whether student 900 is out of station must not be able to
     * give two answers.
     *
     * md5 rather than crc32, and the reason is worth writing down because the
     * first version of this file used crc32 and looked fine.
     *
     * CRC is affine over GF(2). For a fixed suffix, crc32(prefix . suffix) is a
     * linear map of crc32(prefix) plus a constant that depends only on the
     * suffix — so for any two salts, crc32("a:{$i}") XOR crc32("b:{$i}") is the
     * same value for every $i of the same digit length. Two "independent" draws
     * were therefore locked together, four groups' worth across a 2,000-row run:
     * 2,000 students drew 236 distinct names out of a possible 1,936, and the
     * three components bell() averages moved as one, narrowing a CGPA range that
     * should have reached 4.00 to a maximum of 3.63.
     *
     * None of that raises anything. It looks like data. md5 has no such
     * structure, is stable across platforms and PHP versions, and at roughly
     * thirty calls per student costs a few milliseconds over the whole register.
     * The top 32 bits are taken because any 32 will do and these are the cheapest
     * to read.
     */
    public static function uniform(string $salt, int $index): float
    {
        return hexdec(substr(md5($salt.':'.$index), 0, 8)) / 0x100000000;
    }

    /**
     * A number in [0, 1), clustered around the middle.
     *
     * The mean of three independent uniforms — the Irwin-Hall distribution,
     * which at n = 3 is already close enough to a bell that a histogram of 2,000
     * CGPAs looks like a cohort rather than a rectangle. That matters for more
     * than looks: a uniform CGPA spread puts a twelfth of every cohort above
     * 3.7, so a demo of the Dean's list shows 160 students where a real one
     * shows a dozen, and every threshold in the criteria screen looks wrongly
     * calibrated.
     */
    public static function bell(string $salt, int $index): float
    {
        return (self::uniform($salt.'-a', $index)
            + self::uniform($salt.'-b', $index)
            + self::uniform($salt.'-c', $index)) / 3;
    }

    /** True with probability $probability, decided the same way. */
    public static function chance(string $salt, int $index, float $probability): bool
    {
        return self::uniform($salt, $index) < $probability;
    }

    /**
     * One item from a list, uniformly.
     *
     * @template T
     *
     * @param  list<T>  $items
     * @return T
     */
    public static function from(string $salt, int $index, array $items)
    {
        return $items[(int) (self::uniform($salt, $index) * count($items))];
    }

    /**
     * One key from a map of key => weight.
     *
     * Weights are relative, not percentages, so a table can be written the way
     * it reads best — 24 for Computer & IT against 6 for Education — and gain a
     * row later without every other number having to be adjusted to keep a sum
     * at 100.
     *
     * @param  array<string, int|float>  $weights
     */
    public static function weighted(string $salt, int $index, array $weights): string
    {
        $total = array_sum($weights);
        $point = self::uniform($salt, $index) * $total;
        $running = 0.0;

        foreach ($weights as $key => $weight) {
            $running += $weight;

            if ($point < $running) {
                return (string) $key;
            }
        }

        // Only reachable through floating-point drift on the last boundary.
        return (string) array_key_last($weights);
    }

    /**
     * Split $total into per-key counts in proportion to $weights.
     *
     * Used where a proportion has to be exact rather than approximate — the
     * batch sizes must add up to the number of students that was asked for, and
     * 2,000 independent weighted draws would land near the right shape and not
     * on it. The remainder goes to the largest group, where being one row out
     * is invisible.
     *
     * @param  array<string, int|float>  $weights
     * @return array<string, int>
     */
    public static function apportion(int $total, array $weights): array
    {
        $sum = array_sum($weights);
        $counts = [];

        foreach ($weights as $key => $weight) {
            $counts[$key] = (int) floor($total * $weight / $sum);
        }

        $largest = array_keys($weights, max($weights))[0];
        $counts[$largest] += $total - array_sum($counts);

        return $counts;
    }
}
