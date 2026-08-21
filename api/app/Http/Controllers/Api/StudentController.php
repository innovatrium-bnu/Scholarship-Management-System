<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Domain\Support\EnrollmentStatus;
use App\Http\Actor;
use App\Http\Controllers\Controller;
use App\Http\Resources\DomainJson;
use App\Models\Student;
use App\Persistence\CoverageReader;
use App\Persistence\Mappers\StudentMapper;
use App\Persistence\Writers\AuditWriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Students: the register, one record, and what that record is being paid.
 */
final class StudentController extends Controller
{
    public function __construct(
        private readonly CoverageReader $coverage,
        private readonly AuditWriter $audit,
    ) {}

    /**
     * The register, filtered and paginated.
     *
     * Paginated because this is the one list that grows without bound —
     * AGENTS.md sizes it at 5,000 — and the students screen is a search box
     * over it rather than a page anybody scrolls to the end of.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Student::query();

        if ($search = $request->query('search')) {
            $query->where(function ($scoped) use ($search) {
                $scoped->where('reg_no', 'like', '%'.$search.'%')
                    ->orWhere('name', 'like', '%'.$search.'%')
                    ->orWhere('email', 'like', '%'.$search.'%');
            });
        }

        foreach (['batch', 'school', 'programme', 'quota', 'enrollment_status'] as $filter) {
            if ($value = $request->query($filter)) {
                $query->where($filter, $value);
            }
        }

        $page = $query->orderBy('reg_no')->paginate(
            perPage: min((int) $request->query('perPage', 50), 200)
        );

        return response()->json([
            'data' => DomainJson::encodeList(StudentMapper::toDomainList($page->items())),
            'meta' => [
                'total' => $page->total(),
                'perPage' => $page->perPage(),
                'currentPage' => $page->currentPage(),
                'lastPage' => $page->lastPage(),
            ],
        ]);
    }

    public function show(Student $student): JsonResponse
    {
        return response()->json(['data' => DomainJson::encode(StudentMapper::toDomain($student))]);
    }

    /**
     * Patch a student, logging every changed field separately.
     *
     * store.tsx explains why one entry per field rather than one object diff:
     * admissions data is argued over, and appeals and corrections all ask "what
     * did this field say before, and who changed it".
     */
    public function update(Request $request, Student $student): JsonResponse
    {
        /*
         * camelCase on the wire, like every other endpoint here.
         *
         * types.ts is camelCase and the SPA round-trips these objects verbatim,
         * so an endpoint taking snake_case would be the one place a caller has
         * to know what the columns are called.
         */
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255'],
            'phone' => ['sometimes', 'string', 'max:255'],
            'cgpa' => ['sometimes', 'numeric', 'min:0', 'max:4'],
            'creditHours' => ['sometimes', 'integer', 'min:0'],
            'attendancePct' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            // A closed set, not a free string. Before this rule an
            // arbitrary value was accepted and stored, leaving the row in
            // no status at all: absent from every filter, counted in no
            // report, and invisible to the enrolled check that gates an
            // award.
            'enrollmentStatus' => ['sometimes', Rule::in(EnrollmentStatus::ALL)],
            'financialNeedVerified' => ['sometimes', 'boolean'],
            'personalStatementOk' => ['sometimes', 'boolean'],
            'hasSportsMedal' => ['sometimes', 'boolean'],
            'bfitMember' => ['sometimes', 'boolean'],
            'currentSemester' => ['sometimes', 'integer', 'min:1'],
            'creditsEarned' => ['sometimes', 'integer', 'min:0'],
            'photoUrl' => ['nullable', 'string', 'max:255'],
            'reason' => ['required', 'string'],
        ]);

        $reason = $validated['reason'];
        unset($validated['reason']);

        $columns = [
            'name' => 'name',
            'email' => 'email',
            'phone' => 'phone',
            'cgpa' => 'cgpa',
            'creditHours' => 'credit_hours',
            'attendancePct' => 'attendance_pct',
            'enrollmentStatus' => 'enrollment_status',
            'financialNeedVerified' => 'financial_need_verified',
            'personalStatementOk' => 'personal_statement_ok',
            'hasSportsMedal' => 'has_sports_medal',
            'bfitMember' => 'bfit_member',
            'currentSemester' => 'current_semester',
            'creditsEarned' => 'credits_earned',
            'photoUrl' => 'photo_url',
        ];

        $validated = collect($validated)
            ->mapWithKeys(fn ($value, $key) => [$columns[$key] => $value])
            ->all();

        DB::transaction(function () use ($student, $validated, $reason, $request) {
            $actor = Actor::from($request);

            /*
             * fill() then getDirty(), rather than comparing field by field.
             *
             * The comparison used to be `$student->{$field} == $value`, and
             * loose equality does not mean what it looks like here. PHP
             * compares two numeric-looking strings as numbers, so changing a
             * phone number from "03001234567" to "3001234567" — a dropped
             * leading zero, which is how a Pakistani mobile number is usually
             * mistyped — read as unchanged. The audit entry was skipped and the
             * update below wrote the new value anyway, so the column changed
             * and the trail did not. An audit log that claims to be complete
             * and is not is worse than one with a visible gap.
             *
             * Eloquent already answers this question correctly and is cast
             * aware, which hand-rolled comparison here could not be: it
             * compares floats within an epsilon, casts booleans and integers
             * before comparing, and falls back to strcmp for numeric strings —
             * which is exactly the leading-zero case. Asking the model is both
             * shorter and right.
             */
            $student->fill($validated);

            foreach ($student->getDirty() as $field => $value) {
                $this->audit->record(
                    entityType: 'Student',
                    entityId: $student->reg_no,
                    action: 'Changed '.$field,
                    actor: $actor,
                    reason: $reason,
                    oldValue: [$field => $student->getOriginal($field)],
                    newValue: [$field => $value],
                );
            }

            $student->save();
        });

        return $this->show($student->fresh());
    }

    /**
     * The merged coverage for one student.
     */
    public function coverage(Student $student): JsonResponse
    {
        return response()->json([
            'data' => DomainJson::encodeList($this->coverage->forStudent($student->reg_no)),
            'waiverValuePKR' => $this->coverage->waiverValueFor($student->reg_no),
        ]);
    }
}
