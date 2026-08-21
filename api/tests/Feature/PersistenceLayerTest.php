<?php

declare(strict_types=1);

use App\Domain\Data\CriterionCheck;
use App\Domain\Data\DomainEvent as DomainEventData;
use App\Domain\Data\Screening;
use App\Domain\EvaluationService;
use App\Models\DomainEvent;
use App\Models\Student;
use App\Persistence\ApplicationScreener;
use App\Persistence\ChunkedIn;
use App\Persistence\Mappers\DomainEventMapper;
use App\Persistence\Repositories\DomainEventRepository;
use App\Persistence\Repositories\ScholarshipRepository;
use App\Persistence\Repositories\StudentRepository;

/**
 * The persistence layer, where the mapping can be wrong without being broken.
 *
 * The domain services are already covered by 132 unit tests that never touch a
 * database. What those cannot catch is a value arriving in the wrong shape —
 * a number that became a string on the way through Oracle, a date rendered so
 * it no longer sorts. Both produce wrong answers rather than errors, so both
 * are tested here against a real schema.
 */
describe('a numeric threshold survives the round trip through varchar2', function () {
    it('comes back as a number, not the string it was stored as', function () {
        seedReferences();
        $record = aScholarshipRecord();
        $record->rules()->create([
            'rule_type' => 'award',
            'kind' => 'Automatic',
            'field' => 'cgpa',
            'operator' => '>=',
            'threshold' => '3.5',
        ]);

        $scholarship = (new ScholarshipRepository)->find($record->id);

        expect($scholarship->awardRules[0]->threshold)->toBe(3.5)
            ->and($scholarship->awardRules[0]->threshold)->not->toBeString();
    });

    it('still rejects a student below the floor, which is what the typing is for', function () {
        seedReferences();
        $record = aScholarshipRecord();
        // No description on purpose. EvaluationService falls back to scraping a
        // number out of the description when the threshold is not numeric, and
        // with no description to scrape it returns "passes" for everybody. So
        // this rule can only work if the threshold came back as a number.
        $record->rules()->create([
            'rule_type' => 'award',
            'kind' => 'Automatic',
            'field' => 'cgpa',
            'operator' => '>=',
            'threshold' => '3.5',
        ]);

        aStudent('F24-BSCS-001', 3.9);
        aStudent('F24-BSCS-002', 3.0);

        $scholarship = (new ScholarshipRepository)->find($record->id);
        $students = (new StudentRepository)->enrolled();

        $results = (new EvaluationService)->evaluate($scholarship, $students, []);

        $byRegNo = [];
        foreach ($results as $result) {
            $byRegNo[$result->student->regNo] = $result->status;
        }

        expect($byRegNo['F24-BSCS-001'])->toBe('Eligible')
            ->and($byRegNo['F24-BSCS-002'])->toBe('NotEligible');
    });

    it('leaves a genuinely textual threshold alone', function () {
        seedReferences();
        $record = aScholarshipRecord();
        $record->rules()->create([
            'rule_type' => 'award',
            'kind' => 'Automatic',
            'field' => 'quota',
            'operator' => '=',
            'threshold' => 'Open Merit',
        ]);

        $scholarship = (new ScholarshipRepository)->find($record->id);

        expect($scholarship->awardRules[0]->threshold)->toBe('Open Merit');
    });
});

describe('dates come back in the shape the domain sorts on', function () {
    it('renders a date column as an ISO date', function () {
        seedReferences();
        aStudent('F24-BSCS-003', 3.2);

        $student = (new StudentRepository)->find('F24-BSCS-003');

        // ReportService compares these with strcmp on the stated grounds that
        // ISO-8601 sorts lexicographically. That holds only while every
        // producer writes the same shape, so the shape is the test.
        expect($student->admissionDate)->toBe('2024-09-01')
            ->and($student->dateOfBirth)->toBe('2004-03-09');
    });

    it('renders a timestamptz the way JavaScript would, in UTC', function () {
        $event = (new DomainEventRepository)->record(new DomainEventData(
            kind: 'award.granted',
            at: '2026-08-13T09:00:00.000Z',
            actor: 'Registrar Office',
            awardId: 'aw-1',
            studentRegNo: 'F24-BSCS-001',
            effectiveFrom: '2026-09-01',
            semester: 'Fall 2026',
        ));

        $mapped = DomainEventMapper::toDomain($event->fresh());

        expect($mapped->at)->toBe('2026-08-13T09:00:00.000Z');
    });
});

describe('the event log round-trips through its payload', function () {
    it('puts queryable fields in columns and the rest in the payload', function () {
        $repository = new DomainEventRepository;

        $repository->record(new DomainEventData(
            kind: 'award.revoked',
            at: '2026-08-13T09:00:00.000Z',
            actor: 'Finance',
            awardId: 'aw-9',
            studentRegNo: 'F24-BSCS-001',
            scholarshipId: 'sch-1',
            effectiveFrom: '2026-09-01',
            semester: 'Fall 2026',
            timing: 'next',
            cause: 'Retention rules not met',
            reason: 'CGPA fell below the floor.',
        ));

        $row = DomainEvent::query()->firstOrFail();

        // Indexed facts are columns; everything else rides in the CLOB.
        expect($row->semester)->toBe('Fall 2026')
            ->and($row->student_reg_no)->toBe('F24-BSCS-001')
            ->and($row->payload)->toHaveKey('cause')
            ->and($row->payload)->toHaveKey('timing')
            ->and($row->payload)->not->toHaveKey('outcome');

        $events = $repository->all();

        expect($events)->toHaveCount(1)
            ->and($events[0]->cause)->toBe('Retention rules not met')
            ->and($events[0]->timing)->toBe('next')
            ->and($events[0]->actor)->toBe('Finance')
            ->and($events[0]->effectiveFrom)->toBe('2026-09-01')
            // Never set, and must not come back as anything but null.
            ->and($events[0]->outcome)->toBeNull();
    });
});

describe('whereIn survives a list Oracle would refuse', function () {
    it('loads more than 1000 students in one query', function () {
        seedReferences();

        // 1001 is the first count that raises ORA-01795, measured on this
        // database. 1200 puts it comfortably past the boundary.
        $regNos = [];
        for ($i = 1; $i <= 1200; $i++) {
            $regNos[] = sprintf('F24-BSCS-%04d', $i);
        }

        $rows = array_map(fn (string $regNo) => [
            'reg_no' => $regNo,
            'name' => 'Test Student',
            'school' => 'School of Computer & IT',
            'programme' => 'BS Computer Science',
            'study_level' => 'Bachelors',
            'batch' => 'Fall 2024',
            'cgpa' => 3.2,
            'credit_hours' => 15,
            'domicile' => 'Punjab',
            'province' => 'Punjab',
            'city' => 'Lahore',
            'district' => 'Lahore',
            'quota' => 'Open Merit',
            'gender' => 'Female',
            'date_of_birth' => '2004-03-09',
            'father_name' => 'Test Father',
            'email' => 'test@bnu.edu.pk',
            'phone' => '03001234567',
            'admission_date' => '2024-09-01',
            'enrollment_status' => 'Enrolled',
            'current_semester' => 3,
        ], $regNos);

        foreach (array_chunk($rows, 200) as $chunk) {
            Student::insert($chunk);
        }

        $students = (new StudentRepository)->findMany($regNos);

        expect($students)->toHaveCount(1200);
    });

    it('asks for nothing when given nothing, rather than for everything', function () {
        seedReferences();
        aStudent('F24-BSCS-500', 3.4);

        // whereIn([]) compiles to a contradiction. The failure worth guarding
        // against is the opposite: an empty filter that quietly returns the
        // whole table.
        expect((new StudentRepository)->findMany([]))->toBe([]);
    });

    it('is the helper doing it, not a coincidence', function () {
        expect(ChunkedIn::ORACLE_MAX_EXPRESSIONS)->toBe(1000);
    });
});

describe('the screener answers what the domain cannot ask', function () {
    /**
     * ScreeningService is pure and has no database, so duplicate detection and
     * existing coverage have to arrive as context. These check that the layer
     * computes them the way useApplications.ts does.
     */
    it('marks the later of two live applications as the duplicate', function () {
        seedReferences();
        $scholarship = aScholarshipRecord();
        criteriaFor($scholarship->id);
        aStudent('F24-BSCS-010', 3.4);

        $first = anApplication($scholarship->id, 'F24-BSCS-010', '2026-01-10T09:00:00Z');
        $second = anApplication($scholarship->id, 'F24-BSCS-010', '2026-02-10T09:00:00Z');

        $screened = app(ApplicationScreener::class)->screenQueue();

        $verdictById = [];
        foreach ($screened as $entry) {
            $verdictById[$entry->application->id] = $entry->screening;
        }

        $duplicateCheck = fn (string $id) => collect($verdictById[$id]->checks)
            ->firstWhere('id', 'duplicate')->outcome;

        // The one filed first survives; the later one is the duplicate. Order
        // is by submittedAt, not by whatever the database returned.
        expect($duplicateCheck($first->id))->toBe(CriterionCheck::PASS)
            ->and($duplicateCheck($second->id))->toBe(CriterionCheck::FAIL)
            // duplicate is in auto_reject_on, so it blocks rather than flags.
            ->and($verdictById[$second->id]->verdict)->toBe(Screening::FAILS);
    });

    it('does not count a withdrawn application as occupying the slot', function () {
        seedReferences();
        $scholarship = aScholarshipRecord();
        criteriaFor($scholarship->id);
        aStudent('F24-BSCS-011', 3.4);

        anApplication($scholarship->id, 'F24-BSCS-011', '2026-01-10T09:00:00Z', 'Withdrawn');
        $live = anApplication($scholarship->id, 'F24-BSCS-011', '2026-02-10T09:00:00Z');

        $screened = app(ApplicationScreener::class)->screenQueue();

        $entry = collect($screened)->first(fn ($e) => $e->application->id === $live->id);

        expect(collect($entry->screening->checks)->firstWhere('id', 'duplicate')->outcome)
            ->toBe(CriterionCheck::PASS);
    });

    it('reports no existing coverage when the student holds nothing', function () {
        seedReferences();
        $scholarship = aScholarshipRecord();
        criteriaFor($scholarship->id);
        aStudent('F24-BSCS-012', 3.4);
        anApplication($scholarship->id, 'F24-BSCS-012', '2026-01-10T09:00:00Z');

        $screened = app(ApplicationScreener::class)->screenQueue();

        expect($screened)->toHaveCount(1)
            ->and($screened[0]->existingCoveragePct)->toBe(0.0);
    });
});
