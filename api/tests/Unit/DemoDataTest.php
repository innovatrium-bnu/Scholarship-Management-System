<?php

declare(strict_types=1);

use Database\Seeders\Demo\Draw;
use Database\Seeders\Demo\Row;
use Database\Seeders\Demo\StudentGenerator;
use Database\Seeders\ReferenceSeeder;

/**
 * The demo generators, without a database.
 *
 * Two kinds of claim are tested here, and they fail in different ways.
 *
 * The first is agreement with ReferenceSeeder. Every school, programme, quota
 * and district the generator uses is a foreign key, so a value that disagrees
 * is ORA-02291 thirteen seconds into a seed — recoverable, but only after
 * reading a stack trace to find out which of thirty columns it was.
 *
 * The second is the quality of the variation, which fails silently and is the
 * reason this file exists at all. The first implementation of Draw used crc32,
 * whose affine structure locked supposedly independent draws together: 2,000
 * students drew 236 distinct names from a pool of 1,936, and the CGPA range
 * quietly lost both its tails. Nothing errored. The database looked full. The
 * assertions below are the ones that would have caught it.
 */

/** Generated once; every test here reads the same register. */
function demoStudents(): array
{
    static $students = null;

    return $students ??= (new StudentGenerator)->generate(2000);
}

/* -- agreement with the reference tables --------------------------------- */

it('names only schools the reference data has', function () {
    expect(array_diff(StudentGenerator::schools(), ReferenceSeeder::SCHOOLS))->toBe([]);
});

it('names only programmes the reference data has, under the right school', function () {
    $problems = [];

    foreach (StudentGenerator::programmes() as $school => $programmes) {
        foreach ($programmes as $programme) {
            if (! in_array($programme, ReferenceSeeder::PROGRAMMES[$school] ?? [], true)) {
                $problems[] = "{$programme} is not a programme of {$school}";
            }
        }
    }

    expect($problems)->toBe([]);
});

it('names only quotas the reference data has', function () {
    expect(array_diff(StudentGenerator::quotas(), ReferenceSeeder::QUOTAS))->toBe([]);
});

it('names only province, city and district triples the reference data has', function () {
    $known = [];

    foreach (ReferenceSeeder::GEOGRAPHY as $province => $cities) {
        foreach ($cities as $city => $districts) {
            foreach ($districts as $district) {
                $known[] = "{$province}|{$city}|{$district}";
            }
        }
    }

    expect(array_diff(StudentGenerator::geography(), $known))->toBe([]);
});

/* -- identity ------------------------------------------------------------- */

it('gives every student a registration number and an address of their own', function () {
    $students = demoStudents();

    expect(array_unique(array_column($students, 'reg_no')))->toHaveCount(count($students))
        ->and(array_unique(array_column($students, 'email')))->toHaveCount(count($students));
});

it('builds a registration number that says intake, programme and sequence', function () {
    foreach (array_slice(demoStudents(), 0, 200) as $student) {
        expect($student['reg_no'])->toMatch('/^[FS]\d{2}-[A-Z]{3,4}-\d{3}$/');
    }
});

/* -- the variation is actually varied ------------------------------------- */

it('draws names from the whole pool rather than a corner of it', function () {
    // The crc32 regression scored 236 here. Independent draws from 44 given
    // names and 44 family names over 2,000 students should reach four figures.
    $names = array_unique(array_column(demoStudents(), 'name'));

    expect(count($names))->toBeGreaterThan(1200);
});

it('keeps two draws for the same student independent of each other', function () {
    // The property crc32 does not have. For any two salts, the pairs drawn
    // across a run must not be collapsed onto a handful of combinations.
    $pairs = [];

    for ($i = 0; $i < 2000; $i++) {
        $pairs[] = ((int) (Draw::uniform('alpha', $i) * 20))
            .':'.((int) (Draw::uniform('beta', $i) * 20));
    }

    // 400 buckets, 2,000 draws: a fair pair reaches nearly all of them.
    expect(count(array_unique($pairs)))->toBeGreaterThan(350);
});

it('spreads CGPA across a range with both tails in it', function () {
    $cgpas = array_column(demoStudents(), 'cgpa');

    sort($cgpas);
    $median = $cgpas[intdiv(count($cgpas), 2)];

    expect(min($cgpas))->toBeLessThan(2.2)
        ->and(max($cgpas))->toBeGreaterThan(3.75)
        ->and($median)->toBeGreaterThan(2.6)
        ->and($median)->toBeLessThan(3.2);
});

it('leaves a top band small enough for a scholarship to be selective', function () {
    // The Dean's award is written for students above 3.5. If a tenth of the
    // register clears it the demo shows hundreds of them and the threshold
    // looks mis-set; if nobody does, the award has no holders.
    $eligible = count(array_filter(demoStudents(), fn (array $s) => $s['cgpa'] >= 3.5));

    expect($eligible)->toBeGreaterThan(15)->toBeLessThan(200);
});

it('produces the same register twice', function () {
    // The whole reason nothing here calls rand(). A bug reported against a
    // named student has to be reproducible from the same command tomorrow.
    //
    // Same size, not a prefix: the batch and school counts are apportioned from
    // the total, so a run of 200 is a differently shaped register from the first
    // 200 of a run of 2,000, and comparing the two would be asserting something
    // that is not true and should not be.
    $first = (new StudentGenerator)->generate(400);
    $second = (new StudentGenerator)->generate(400);

    expect($second)->toBe($first);
});

/* -- shapes the screens depend on ----------------------------------------- */

it('charges hostel and mess only to students who are not local', function () {
    $problems = [];

    foreach (demoStudents() as $student) {
        if ($student['hostel_fee'] > 0 && $student['domicile'] === 'Lahore') {
            $problems[] = $student['reg_no'].' is in Lahore and pays hostel';
        }

        if ($student['mess_fee'] > 0 && $student['hostel_fee'] === 0) {
            $problems[] = $student['reg_no'].' is on the meal plan without a room';
        }
    }

    expect($problems)->toBe([]);
});

it('gives both sides of the out-of-station split enough students to matter', function () {
    // The inclusion award's hostel line is conditional on not being domiciled
    // in Lahore. A register that was all one or all the other would make a
    // conditional line indistinguishable from an unconditional one.
    $withHostel = count(array_filter(demoStudents(), fn (array $s) => $s['hostel_fee'] > 0));

    expect($withHostel)->toBeGreaterThan(300)->toBeLessThan(1200);
});

it('registers credit hours only for students sitting the term', function () {
    $problems = [];

    foreach (demoStudents() as $student) {
        $sitting = $student['enrollment_status'] === 'Enrolled';

        if (! $sitting && $student['credit_hours'] > 0) {
            $problems[] = $student['reg_no'].' is '.$student['enrollment_status'].' with credit hours';
        }

        if ($sitting && $student['credit_hours'] < 12) {
            $problems[] = $student['reg_no'].' is enrolled below a full load';
        }
    }

    expect($problems)->toBe([]);
});

it('keeps every enrollment status represented', function () {
    $statuses = array_count_values(array_column(demoStudents(), 'enrollment_status'));

    foreach (['Enrolled', 'Graduated', 'On leave', 'Withdrawn'] as $status) {
        expect($statuses[$status] ?? 0)->toBeGreaterThan(0);
    }

    expect($statuses['Enrolled'])->toBeGreaterThan(1200);
});

it('records a gender for everyone and reaches the one the inclusion award needs', function () {
    $genders = array_count_values(array_column(demoStudents(), 'gender'));

    expect(array_keys($genders))->toEqualCanonicalizing(['Male', 'Female', 'Other'])
        ->and($genders['Other'])->toBeGreaterThan(0);
});

it('gives a father the same family name as the student', function () {
    $problems = [];

    foreach (array_slice(demoStudents(), 0, 400) as $student) {
        $family = substr($student['name'], (int) strrpos($student['name'], ' ') + 1);

        if (! str_ends_with($student['father_name'], $family)) {
            $problems[] = $student['name'].' / '.$student['father_name'];
        }
    }

    expect($problems)->toBe([]);
});

/* -- Oracle formatting ----------------------------------------------------- */

it('writes dates and timestamps in the formats the session expects', function () {
    $student = demoStudents()[0];

    // NLS_DATE_FORMAT and NLS_TIMESTAMP_FORMAT are both
    // 'YYYY-MM-DD HH24:MI:SS'; only the six timestampTz columns take an offset,
    // and handing one to a plain TIMESTAMP is ORA-01830.
    expect($student['date_of_birth'])->toMatch('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/')
        ->and($student['admission_date'])->toMatch('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/')
        ->and($student['created_at'])->toMatch('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/')
        ->and(Row::timestamp('2025-09-01', '09:00:00'))->toBe('2025-09-01 09:00:00 +00:00')
        ->and(Row::stamp('2025-09-01', '09:00:00'))->toBe('2025-09-01 09:00:00');
});

it('writes booleans as the numbers 19c stores them as', function () {
    $student = demoStudents()[0];

    foreach (['is_out_of_station', 'financial_need_verified', 'bfit_member'] as $column) {
        expect($student[$column])->toBeIn([0, 1]);
    }
});

it('apportions a total exactly, however the weights divide', function () {
    // Batch sizes have to add up to the number of students that was asked for.
    // 2,000 independent weighted draws would land near the right shape and not
    // on it, and the register would be 1,997 students on one run and 2,004 on
    // the next.
    foreach ([7, 100, 999, 2000, 5000] as $total) {
        $counts = Draw::apportion($total, ['a' => 12, 'b' => 7, 'c' => 81]);

        expect(array_sum($counts))->toBe($total);
    }
});
