<?php

declare(strict_types=1);

namespace App\Persistence\Mappers;

use App\Domain\Data\Student;
use App\Models\Student as StudentRecord;
use App\Persistence\DomainDate;

/**
 * A students row, as the domain wants it.
 *
 * The model is aliased to StudentRecord here because both classes are called
 * Student and both names are right — see app/Models/README.md. Reading
 * `StudentRecord $record` and returning `Student` makes the direction of the
 * mapping obvious at a glance, which matters in a file whose entire job is that
 * direction.
 */
final class StudentMapper
{
    public static function toDomain(StudentRecord $record): Student
    {
        return new Student(
            regNo: $record->reg_no,
            name: $record->name,
            school: $record->school,
            programme: $record->programme,
            studyLevel: $record->study_level,
            batch: $record->batch,
            cgpa: $record->cgpa,
            creditHours: $record->credit_hours,
            domicile: $record->domicile,
            isOutOfStation: $record->is_out_of_station,
            tuitionFee: $record->tuition_fee,
            hostelFee: $record->hostel_fee,
            messFee: $record->mess_fee,
            otherFee: $record->other_fee,
            province: $record->province,
            city: $record->city,
            district: $record->district,
            financialNeedVerified: $record->financial_need_verified,
            personalStatementOk: $record->personal_statement_ok,
            hasSportsMedal: $record->has_sports_medal,
            bfitMember: $record->bfit_member,
            quota: $record->quota,
            gender: $record->gender,
            dateOfBirth: DomainDate::date($record->date_of_birth),
            fatherName: $record->father_name,
            email: $record->email,
            phone: $record->phone,
            attendancePct: $record->attendance_pct,
            admissionDate: DomainDate::date($record->admission_date),
            enrollmentStatus: $record->enrollment_status,
            currentSemester: $record->current_semester,
            creditsEarned: $record->credits_earned,
            photoUrl: $record->photo_url,
        );
    }

    /**
     * @param  iterable<StudentRecord>  $records
     * @return Student[]
     */
    public static function toDomainList(iterable $records): array
    {
        $students = [];

        foreach ($records as $record) {
            $students[] = self::toDomain($record);
        }

        return $students;
    }
}
