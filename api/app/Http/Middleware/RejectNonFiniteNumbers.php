<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Stops infinity and NaN at the door.
 *
 * JSON has no infinity. `1e400` is a number literal the specification allows to
 * be written and does not say how to represent, and PHP's json_decode resolves
 * it to the float INF rather than refusing it. Everything downstream then
 * behaves as though a number arrived.
 *
 * It does not survive contact with validation. `['numeric', 'max:4']` sends INF
 * to Brick\Math, which raises "Value "INF" does not represent a valid number" —
 * an uncaught exception inside the validator, so the caller gets a 500 naming a
 * vendor file for what is a malformed request. That is every numeric field with
 * a bound, which is most of them: cgpa, attendance, credit hours, requested
 * percentages, coverage values, income ceilings, thresholds.
 *
 * Fixing it field by field would mean remembering to, twenty times, and again
 * for the twenty-first. This rejects it once, at the boundary, for the same
 * reason ConvertEmptyStringsToNull sits there: it is a property of the encoding
 * rather than of any one endpoint.
 *
 * Registered on the api group only. The web routes take no JSON.
 */
final class RejectNonFiniteNumbers
{
    public function handle(Request $request, Closure $next): Response
    {
        $offending = $this->findNonFinite($request->json()->all());

        if ($offending !== null) {
            throw ValidationException::withMessages([
                $offending => 'The '.$offending.' must be a real number.',
            ]);
        }

        return $next($request);
    }

    /**
     * The dotted path of the first non-finite number, or null if there is none.
     *
     * Returns the path rather than a bare true so the error bag names the field
     * the way the rest of the API does — "picks.3.components.0.entitlement" —
     * and the client can put the message next to the input it belongs to.
     *
     * @param  array<array-key, mixed>  $data
     */
    private function findNonFinite(array $data, string $prefix = ''): ?string
    {
        foreach ($data as $key => $value) {
            $path = $prefix === '' ? (string) $key : $prefix.'.'.$key;

            if (is_array($value)) {
                $found = $this->findNonFinite($value, $path);

                if ($found !== null) {
                    return $found;
                }

                continue;
            }

            if (is_float($value) && ! is_finite($value)) {
                return $path;
            }
        }

        return null;
    }
}
