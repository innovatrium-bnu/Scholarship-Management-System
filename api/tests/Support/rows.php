<?php

declare(strict_types=1);

/**
 * Builders for database rows used by the feature tests.
 *
 * The sibling of factories.php, and deliberately separate from it: that file
 * builds domain value objects for the ported unit tests, which never touch a
 * database. These write actual rows, and every one of them needs a migrated
 * schema and the reference data its foreign keys point at.
 *
 * Shared rather than repeated per test file because Pest declares top-level
 * functions globally — two files defining seedReferences() is a fatal error,
 * not a shadowed definition.
 */

use App\Auth\RoleMatrix;
use App\Models\Batch;
use App\Models\EligibilityCriteria;
use App\Models\FeeHead;
use App\Models\NeedApplication;
use App\Models\Programme;
use App\Models\Quota;
use App\Models\Scholarship;
use App\Models\School;
use App\Models\Semester;
use App\Models\Student;
use App\Models\User;

/**
 * The lookups every other row needs a foreign key into.
 *
 * RefreshDatabase leaves an empty schema, so nothing can be written until these
 * exist. Kept minimal on purpose: enough to satisfy the constraints, not a
 * second copy of the seed.
 */
function seedReferences(): void
{
    School::create(['name' => 'School of Computer & IT']);
    Programme::create([
        'name' => 'BS Computer Science',
        'school' => 'School of Computer & IT',
        'study_level' => 'Bachelors',
    ]);
    Batch::create(['label' => 'Fall 2023', 'sort_order' => 1]);
    Batch::create(['label' => 'Fall 2024', 'sort_order' => 2]);
    Quota::create(['name' => 'Open Merit']);
    FeeHead::create(['name' => 'Tuition', 'is_core' => true]);
    FeeHead::create(['name' => 'Hostel', 'is_core' => true]);
    Semester::create([
        'label' => 'Spring 2026',
        'sort_order' => 1,
        'starts_on' => '2026-02-01',
        'ends_on' => '2026-06-30',
    ]);
    Semester::create([
        'label' => 'Fall 2026',
        'sort_order' => 2,
        'starts_on' => '2026-09-01',
        'ends_on' => '2026-12-31',
    ]);
}

function aStudent(string $regNo, float $cgpa = 3.4, string $batch = 'Fall 2024'): Student
{
    return Student::create([
        'reg_no' => $regNo,
        'name' => 'Test Student',
        'school' => 'School of Computer & IT',
        'programme' => 'BS Computer Science',
        'study_level' => 'Bachelors',
        'batch' => $batch,
        'cgpa' => $cgpa,
        'credit_hours' => 15,
        'domicile' => 'Punjab',
        'tuition_fee' => 200000,
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
    ]);
}

function aScholarshipRecord(int $precedence = 1, array $patch = []): Scholarship
{
    return Scholarship::create(array_merge([
        'name' => 'Merit Scholarship',
        'description' => 'For students who meet the CGPA floor.',
        'study_level' => 'Bachelors',
        'precedence' => $precedence,
        'batch_mode' => 'all',
        'semester_from' => 'Spring 2026',
        'review_cycle' => 'Every semester',
        'max_duration_years' => 4,
        'funding_source' => 'Internal',
        'effective_from' => '2026-01-01',
    ], $patch));
}

function anApplication(
    string $scholarshipId,
    string $regNo,
    string $submittedAt = '2026-01-10T09:00:00Z',
    string $status = 'Submitted',
): NeedApplication {
    return NeedApplication::create([
        'student_reg_no' => $regNo,
        'scholarship_id' => $scholarshipId,
        'semester' => 'Spring 2026',
        'submitted_at' => $submittedAt,
        'household_monthly_income' => 40000,
        'household_earning_members' => 1,
        'household_dependants' => 3,
        'household_siblings_at_bnu' => 0,
        'household_guardian_occupation' => 'Teacher',
        'household_guardian_status' => 'Employed',
        'household_residence' => 'Rented',
        'statement' => 'We need help with tuition.',
        'requested_pct' => 50,
        'status' => $status,
    ]);
}

function criteriaFor(string $scholarshipId, array $patch = []): EligibilityCriteria
{
    return EligibilityCriteria::create(array_merge([
        'scholarship_id' => $scholarshipId,
        'max_monthly_income' => 100000,
        'min_credit_hours' => 12,
        'min_attendance_pct' => 0,
        'required_documents' => [],
        'max_existing_coverage_pct' => 50,
        'auto_reject_on' => ['duplicate'],
    ], $patch));
}

/**
 * A user in one of the roles RoleMatrix knows.
 *
 * The default is Admin, which holds everything except users.manage — so a test
 * about something other than permissions does not have to think about them.
 * A test about permissions names its role, and the ones that matter most name
 * Data Entry and Reporting.
 */
function aUser(string $role = RoleMatrix::ADMIN, array $patch = []): User
{
    $user = User::create(array_merge([
        'name' => 'Test '.$role,
        'email' => str_replace([' ', '.'], '', mb_strtolower($role)).'@bnu.edu.pk',
        'password' => 'correct-horse-battery-staple',
    ], $patch));

    /*
     * Assigned after the fact, because role is deliberately not mass-assignable.
     *
     * User declares Fillable as name, email and password only. Adding role to
     * that list would make privilege the one field an attacker most wants to
     * set reachable by any future endpoint that fills a User from request data
     * — a registration form, an invite flow, a profile update. Granting a role
     * stays an explicit assignment, here and everywhere else.
     */
    $user->role = $role;
    $user->save();

    return $user;
}

/**
 * Act as a user in the given role, and return them.
 *
 * Uses the web guard by name. Sanctum falls through to it for a session
 * request, and naming it here keeps the helper honest about which guard the
 * cookie flow actually authenticates against.
 */
function actingAsRole(string $role = RoleMatrix::ADMIN): User
{
    $user = aUser($role);

    test()->actingAs($user, 'web');

    return $user;
}
