<?php

declare(strict_types=1);

namespace App\Domain\Support;

/**
 * Render a number into a string the way JavaScript would.
 *
 * The ported modules build sentences that registrars read and that the
 * mirrored tests compare character for character — "50% of tuition", "CGPA
 * 3.49 is below the required 3.5". PHP and JavaScript disagree on the obvious
 * cast: both render 3.0 as "3", but PHP's float-to-string honours the
 * `precision` ini setting while JavaScript always emits the shortest form that
 * round-trips. Left to the default cast, a threshold of 3.5 could stringify
 * differently on a server with a different php.ini than on the developer's.
 */
final class JsNumber
{
    public static function text(string|int|float $value): string
    {
        if (is_string($value)) {
            return $value;
        }

        $float = (float) $value;

        // Whole numbers lose their decimal part, as String(3.0) === "3" does.
        if ($float === floor($float) && abs($float) < 1e15) {
            return (string) (int) $float;
        }

        return rtrim(rtrim(sprintf('%.10F', $float), '0'), '.');
    }
}
