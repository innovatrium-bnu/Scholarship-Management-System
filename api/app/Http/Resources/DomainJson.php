<?php

declare(strict_types=1);

namespace App\Http\Resources;

/**
 * A domain value object, as the SPA already expects to receive it.
 *
 * The App\Domain\Data classes mirror src/lib/scholarship/types.ts field for
 * field — that was the point of writing them that way — so the JSON shape the
 * frontend wants is the shape those objects already have. This walks them
 * rather than restating every field in a resource class, which would be a
 * second copy of types.ts to keep in step with the first.
 *
 * The one transformation is dropping nulls, and it is not cosmetic. types.ts
 * declares its optional fields as `batchFrom?: string`, which in TypeScript
 * means `string | undefined` and not `string | null`. Emitting
 * `"batchFrom": null` would therefore fail to typecheck at every optional field
 * in the application the moment Phase 10 stops using the in-memory store. An
 * absent key is what `?` means, so an absent key is what this writes.
 *
 * Zero, false and the empty array are all kept. Only null is absence.
 */
final class DomainJson
{
    public static function encode(mixed $value): mixed
    {
        if (is_object($value)) {
            return self::object($value);
        }

        if (is_array($value)) {
            return array_map(self::encode(...), $value);
        }

        return $value;
    }

    /**
     * @param  object[]|array<int, mixed>  $values
     * @return array<int, mixed>
     */
    public static function encodeList(array $values): array
    {
        return array_values(array_map(self::encode(...), $values));
    }

    /**
     * @return array<string, mixed>
     */
    private static function object(object $value): array
    {
        $encoded = [];

        // get_object_vars() from outside the class returns public properties
        // only, which is exactly the domain's surface: every Data class
        // declares its fields as promoted public readonly properties.
        foreach (get_object_vars($value) as $key => $property) {
            if ($property === null) {
                continue;
            }

            $encoded[$key] = self::encode($property);
        }

        return $encoded;
    }
}
