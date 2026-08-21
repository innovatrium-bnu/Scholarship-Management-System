<?php

/**
 * Guards the one duplication this migration knowingly accepts.
 *
 * The reference lists live twice: as TypeScript constants in
 * src/lib/scholarship/seed.ts, which eight frontend files still import, and as
 * PHP constants in ReferenceSeeder, which fills the database. Keeping both was
 * a deliberate choice — it is what lets those eight files stay untouched — but
 * a duplication nobody checks is a duplication that drifts.
 *
 * So these tests read seed.ts itself and compare. If someone adds a school on
 * one side only, this fails and names the school.
 */

use Database\Seeders\ReferenceSeeder;
use Illuminate\Support\Facades\DB;

// RefreshDatabase migrates but does not seed. Reference data is not fixture
// data — it is what the schema's foreign keys point at — so every test here
// needs it present.
beforeEach(fn () => $this->seed(ReferenceSeeder::class));

/**
 * Pull a `export const NAME = [ "a", "b" ] as const;` array out of seed.ts.
 *
 * A regex rather than a TypeScript parser: these are flat string arrays and
 * nothing more, and a parser would be a dependency earning its keep once.
 */
function tsStringArray(string $source, string $constName): array
{
    $pattern = '/export const '.preg_quote($constName, '/').'\s*=\s*\[(.*?)\]\s*as const;/s';

    expect(preg_match($pattern, $source, $m))
        ->toBe(1, "Could not find `export const $constName = [...]` in seed.ts. ".
                  'If it was renamed or reshaped, this test needs updating with it.');

    preg_match_all('/"((?:[^"\\\\]|\\\\.)*)"/', $m[1], $items);

    return array_map(fn ($s) => stripcslashes($s), $items[1]);
}

it('seeds the same schools as seed.ts', function () {
    $fromTs = tsStringArray(frontendSource('src/lib/scholarship/seed.ts'), 'SCHOOLS');

    expect(ReferenceSeeder::SCHOOLS)->toBe($fromTs);
    expect(DB::table('schools')->orderBy('sort_order')->pluck('name')->all())->toBe($fromTs);
});

it('seeds the same batches as seed.ts, in the same order', function () {
    $fromTs = tsStringArray(frontendSource('src/lib/scholarship/seed.ts'), 'BATCHES');

    expect(ReferenceSeeder::BATCHES)->toBe($fromTs);

    // Order is not cosmetic here. A scholarship with batchMode "onwards"
    // applies to its batch and every later one, so the sequence decides who is
    // eligible.
    expect(DB::table('batches')->orderBy('sort_order')->pluck('label')->all())->toBe($fromTs);
});

it('seeds the same semesters as seed.ts, in the same order', function () {
    $fromTs = tsStringArray(frontendSource('src/lib/scholarship/seed.ts'), 'SEMESTERS');

    expect(ReferenceSeeder::SEMESTERS)->toBe($fromTs);
    expect(DB::table('semesters')->orderBy('sort_order')->pluck('label')->all())->toBe($fromTs);
});

it('seeds the same quotas as seed.ts', function () {
    $fromTs = tsStringArray(frontendSource('src/lib/scholarship/seed.ts'), 'QUOTAS');

    expect(ReferenceSeeder::QUOTAS)->toBe($fromTs);
    expect(DB::table('quotas')->orderBy('name')->pluck('name')->all())
        ->toBe(collect($fromTs)->sort()->values()->all());
});

it('seeds the four core fee heads named in types.ts', function () {
    $types = frontendSource('src/lib/scholarship/types.ts');

    expect(preg_match('/CORE_FEE_HEADS[^=]*=\s*\[(.*?)\];/s', $types, $m))->toBe(1);
    preg_match_all('/"([^"]+)"/', $m[1], $items);

    expect(ReferenceSeeder::CORE_FEE_HEADS)->toBe($items[1]);

    // These four are the ones merge.ts feeOf() switches on by name, and they
    // map to the four fee columns on students. Nothing may delete them.
    expect(DB::table('fee_heads')->where('is_core', true)->orderBy('sort_order')->pluck('name')->all())
        ->toBe($items[1]);
});

it('derives a study level for every programme', function () {
    $programmes = DB::table('programmes')->get();

    expect($programmes)->toHaveCount(20);

    foreach ($programmes as $programme) {
        expect($programme->study_level)->toBeIn(['Bachelors', 'Masters']);

        // seed.ts:437 derives this from the programme name the same way. If a
        // future programme breaks the convention — a bachelors degree starting
        // with M — both sides are wrong together, and this is where it shows.
        $expected = str_starts_with($programme->name, 'M') ? 'Masters' : 'Bachelors';
        expect($programme->study_level)->toBe($expected, "for programme {$programme->name}");
    }
});

it('seeds every geography triple in seed.ts', function () {
    $source = frontendSource('src/lib/scholarship/seed.ts');

    // GEOGRAPHY is nested rather than flat, so count the leaf districts: every
    // quoted string inside a `City: [...]` list.
    expect(preg_match('/export const GEOGRAPHY[^=]*=\s*\{(.*?)\n\};/s', $source, $m))->toBe(1);
    preg_match_all('/\[([^\]]*)\]/s', $m[1], $lists);

    $districts = 0;
    foreach ($lists[1] as $list) {
        $districts += preg_match_all('/"[^"]+"/', $list);
    }

    expect(DB::table('geography')->count())->toBe($districts);
});

it('keeps every student-facing reference key usable as a foreign key', function () {
    // The schema points students at schools, programmes, batches and quotas by
    // name. Empty reference tables would make student inserts fail in a way
    // that looks like a bug in the importer rather than an unseeded database.
    foreach (['schools', 'programmes', 'batches', 'quotas', 'fee_heads', 'semesters'] as $table) {
        expect(DB::table($table)->count())->toBeGreaterThan(0, "$table is empty");
    }
});
