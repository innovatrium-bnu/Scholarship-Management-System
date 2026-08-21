<?php

declare(strict_types=1);

/**
 * Builders for domain objects used by the ported unit tests.
 *
 * A direct port of src/lib/scholarship/test-factories.ts, including its
 * defaults — the TypeScript suite asserts against numbers derived from these,
 * so a "tidier" default here would silently change what the mirrored tests
 * prove.
 *
 * Each factory takes an array patch in place of the TypeScript `Partial<T>`,
 * spread into the constructor as named arguments. So a test states only the
 * fields it cares about, exactly as the original does.
 */

use App\Domain\Data\ApplicationDocument;
use App\Domain\Data\Award;
use App\Domain\Data\AwardComponent;
use App\Domain\Data\CgpaThreshold;
use App\Domain\Data\CoverageLine;
use App\Domain\Data\EligibilityCriteria;
use App\Domain\Data\HouseholdInfo;
use App\Domain\Data\NeedApplication;
use App\Domain\Data\Rule;
use App\Domain\Data\Scholarship;
use App\Domain\Data\Student;

function makeStudent(array $patch = []): Student
{
    return new Student(...array_merge([
        'regNo' => 'F23-0001',
        'name' => 'Test Student',
        'school' => 'School of Computer & IT',
        'programme' => 'BS Computer Science',
        'studyLevel' => 'Bachelors',
        'batch' => 'Fall 2023',
        'cgpa' => 3.5,
        'creditHours' => 16,
        'domicile' => 'Lahore',
        'isOutOfStation' => false,
        'tuitionFee' => 400000.0,
        'hostelFee' => 80000.0,
        'messFee' => 40000.0,
        'otherFee' => 20000.0,
        'province' => 'Punjab',
        'city' => 'Lahore',
        'district' => 'Model Town',
        'financialNeedVerified' => true,
        'personalStatementOk' => true,
        'hasSportsMedal' => true,
        'bfitMember' => true,
        'quota' => 'Merit',
        'gender' => 'Female',
        'dateOfBirth' => '2004-04-12',
        'fatherName' => 'Test Guardian',
        'email' => 'test.student@bnu.edu.pk',
        'phone' => '+92 300 0000000',
        'attendancePct' => 88.0,
        'admissionDate' => '2023-09-01',
        'enrollmentStatus' => 'Enrolled',
        'currentSemester' => 5,
        'creditsEarned' => 68,
    ], $patch));
}

function makeScholarship(array $patch = []): Scholarship
{
    return new Scholarship(...array_merge([
        'id' => 'sch-test',
        'name' => 'Test Scholarship',
        'description' => '',
        'studyLevel' => 'Both',
        'schools' => [],
        'programmes' => [],
        'batches' => [],
        'batchMode' => 'all',
        'semesterFrom' => 'Fall 2023',
        'reviewCycle' => 'Annual',
        'coverage' => [],
        'awardRules' => [],
        'retentionRules' => [],
        'maxDurationYears' => 4,
        'workStudyHoursPerMonth' => 0,
        'requiresReapplication' => false,
        'fundingSource' => 'Internal',
        'status' => 'Active',
        'effectiveFrom' => '2023-09-01',
    ], $patch));
}

function makeCoverage(array $patch = []): CoverageLine
{
    return new CoverageLine(...array_merge([
        'id' => 'cov-1',
        'feeHead' => 'Tuition',
        'benefitKind' => 'Percentage',
        'value' => 50.0,
    ], $patch));
}

function makeRule(array $patch = []): Rule
{
    return new Rule(...array_merge([
        'id' => 'rule-1',
        'kind' => 'Automatic',
    ], $patch));
}

/**
 * A single fee-head line on an award.
 *
 * `applied` defaults to the entitlement because that is what an unmerged award
 * carries; computeMerge is what recomputes it.
 */
function makeComponent(
    string $feeHead,
    string $entitlementKind,
    float $entitlementValue,
    array $patch = [],
): AwardComponent {
    return new AwardComponent(...array_merge([
        'feeHead' => $feeHead,
        'entitlement' => $entitlementValue,
        'entitlementKind' => $entitlementKind,
        'entitlementValue' => $entitlementValue,
        'applied' => $entitlementValue,
        'isOverridden' => false,
    ], $patch));
}

function makeHousehold(array $patch = []): HouseholdInfo
{
    return new HouseholdInfo(...array_merge([
        'monthlyIncome' => 60000.0,
        'earningMembers' => 1,
        'dependants' => 4,
        'siblingsAtBNU' => 0,
        'guardianOccupation' => 'Clerk',
        'guardianStatus' => 'Employed',
        'residence' => 'Rented',
        'monthlyRent' => 25000.0,
        'ownsVehicle' => false,
    ], $patch));
}

function makeApplication(array $patch = []): NeedApplication
{
    return new NeedApplication(...array_merge([
        'id' => 'app-test',
        'studentRegNo' => 'F23-0001',
        'scholarshipId' => 'sch-need',
        'semester' => 'Fall 2025',
        'submittedAt' => '2025-08-01T09:00:00.000Z',
        'household' => makeHousehold(),
        'statement' => 'Supporting statement.',
        'documents' => [
            new ApplicationDocument('d1', 'CNIC', 'cnic.pdf', '2025-08-01', true),
            new ApplicationDocument('d2', 'Income certificate', 'income.pdf', '2025-08-01', true),
        ],
        'requestedPct' => 50.0,
        'status' => 'Submitted',
    ], $patch));
}

function makeCriteria(array $patch = []): EligibilityCriteria
{
    return new EligibilityCriteria(...array_merge([
        'scholarshipId' => 'sch-need',
        'cgpaThresholds' => [
            new CgpaThreshold('c1', 'Fall 2023', 2.5),
            new CgpaThreshold('c2', 'Fall 2024', 2.65),
        ],
        'maxMonthlyIncome' => 150000.0,
        'minCreditHours' => 12,
        'minAttendancePct' => 75.0,
        'requiredDocuments' => ['CNIC', 'Income certificate'],
        'maxExistingCoveragePct' => 50.0,
        'autoRejectOn' => ['cgpa', 'income', 'creditHours', 'documents', 'duplicate'],
    ], $patch));
}

function makeAward(array $patch = []): Award
{
    return new Award(...array_merge([
        'id' => 'aw-test',
        'studentRegNo' => 'F23-0001',
        'scholarshipId' => 'sch-test',
        'status' => 'Active',
        'components' => [],
        'effectiveFrom' => '2023-09-01',
        'authorisedBy' => 'Registrar Office',
        'reasonCode' => 'Initial award',
    ], $patch));
}
