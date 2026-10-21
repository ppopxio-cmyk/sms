import { CourseRegistration } from '../models/Offering.js';
import { AttendanceSheet } from '../models/AttendanceSheet.js';
import { AttendanceRecord } from '../models/Records.js';
import { Assessment } from '../models/Assessment.js';
import { Result } from '../models/Records.js';
import { AppError } from '../utils/AppError.js';
import {
  ASSIGNMENT_POPULATE,
  STUDENT_POPULATE,
  assignmentDto,
  assignmentIdsForTeacher,
  dayKey,
  studentDto,
} from './teacherScope.service.js';

const OFFERING_POPULATE = { path: 'offering', populate: ASSIGNMENT_POPULATE };

export async function listTeacherStudents(teacherId, query) {
  const assignmentIds = await assignmentIdsForTeacher(teacherId);
  if (!assignmentIds.length) {
    return { students: [], pagination: { page: query.page, limit: query.limit, total: 0, pages: 1 } };
  }

  const offeringIds = query.assignmentId
    ? assignmentIds.filter((id) => String(id) === query.assignmentId)
    : assignmentIds;

  const rows = await CourseRegistration.find({
    offering: { $in: offeringIds },
    status: query.status === 'all'
      ? { $in: ['registered', 'dropped', 'withdrawn', 'completed', 'cancelled'] }
      : query.status === 'active'
        ? 'registered'
        : query.status,
  })
    .populate(STUDENT_POPULATE)
    .populate(OFFERING_POPULATE)
    .sort({ createdAt: -1 })
    .lean();

  const search = String(query.search || '').trim().toLowerCase();
  const grouped = new Map();

  for (const row of rows) {
    const student = row.student && typeof row.student === 'object' ? row.student : null;
    if (!student) continue;
    const dto = studentDto(student);
    const haystack = [dto.studentNumber, dto.name, dto.program, dto.batch].join(' ').toLowerCase();
    if (search && !haystack.includes(search)) continue;

    const key = String(student._id);
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        studentNumber: dto.studentNumber,
        name: dto.name,
        firstName: dto.firstName,
        middleName: dto.middleName,
        lastName: dto.lastName,
        sex: dto.sex,
        level: dto.level,
        program: dto.program,
        programCode: dto.programCode,
        batch: dto.batch,
        batchCode: dto.batchCode,
        studentStatus: dto.studentStatus,
        enrollmentStatus: dto.enrollmentStatus,
        email: dto.email,
        phone: dto.phone,
        classes: [],
      });
    }
    const offering = row.offering && typeof row.offering === 'object' ? row.offering : null;
    grouped.get(key).classes.push({
      registrationId: String(row._id),
      assignmentId: offering ? String(offering._id) : String(row.offering),
      courseCode: offering?.course?.code ?? '',
      courseTitle: offering?.course?.title ?? '',
      academicYear: offering?.academicYear?.label ?? '',
      term: offering?.term ?? '',
      level: offering?.level ?? null,
      registrationStatus: row.status,
    });
  }

  const students = [...grouped.values()];
  const total = students.length;
  const start = (query.page - 1) * query.limit;
  return {
    students: students.slice(start, start + query.limit),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function teacherStudentDetail(teacherId, studentId) {
  const assignmentIds = await assignmentIdsForTeacher(teacherId);
  if (!assignmentIds.length) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student was not found in your classes.');

  const rows = await CourseRegistration.find({ offering: { $in: assignmentIds }, student: studentId })
    .populate(STUDENT_POPULATE)
    .populate(OFFERING_POPULATE)
    .lean();

  const withStudent = rows.find((row) => row.student && typeof row.student === 'object');
  if (!withStudent) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student was not found in your classes.');

  const student = withStudent.student;
  const dto = studentDto(student);
  const activeRows = rows.filter((row) => row.status === 'registered');
  const offerings = rows
    .map((row) => row.offering)
    .filter((row) => row && typeof row === 'object');
  const offeringIds = offerings.map((row) => row._id);

  const [sheets, attendanceRecords, assessments, results] = await Promise.all([
    offeringIds.length
      ? AttendanceSheet.find({ offering: { $in: offeringIds } }).select('_id offering dateKey period status').lean()
      : [],
    offeringIds.length
      ? AttendanceRecord.find({ offering: { $in: offeringIds }, student: student._id }).lean()
      : [],
    offeringIds.length
      ? Assessment.find({ offering: { $in: offeringIds }, status: { $in: ['published', 'closed', 'submitted'] } }).lean()
      : [],
    offeringIds.length ? Result.find({ offering: { $in: offeringIds }, student: student._id }).lean() : [],
  ]);

  const sheetByKey = new Map(
    sheets.map((sheet) => [`${sheet.offering}:${sheet.dateKey}:${sheet.period}`, sheet]),
  );
  const resultByOffering = new Map(results.map((row) => [String(row.offering), row]));
  const attendance = attendanceRecords
    .map((record) => {
      const key = `${record.offering}:${dayKey(record.date)}:${record.period}`;
      return {
        id: String(record._id),
        assignmentId: String(record.offering),
        date: record.date,
        dateKey: dayKey(record.date),
        period: record.period,
        status: record.status,
        note: record.notes ?? '',
        sheetStatus: sheetByKey.get(key)?.status ?? null,
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const assessmentRows = assessments
    .map((assessment) => {
      const result = resultByOffering.get(String(assessment.offering));
      const component = (result?.components || []).find(
        (row) => String(row.name || '').trim().toLowerCase() === String(assessment.title || '').trim().toLowerCase(),
      );
      return {
        assessmentId: String(assessment._id),
        assignmentId: String(assessment.offering),
        title: assessment.title,
        type: assessment.type,
        maxScore: assessment.maxScore,
        status: assessment.status,
        score: component ? component.score : null,
        resultStatus: result?.status ?? null,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    student: dto,
    classes: rows
      .filter((row) => row.offering && typeof row.offering === 'object')
      .map((row) =>
        assignmentDto(row.offering, {
          registrationId: String(row._id),
          registrationStatus: row.status,
        }),
      ),
    attendance,
    results: assessmentRows,
    summary: {
      activeClasses: activeRows.length,
      attendanceSessions: attendance.length,
      present: attendance.filter((row) => row.status === 'present').length,
      absent: attendance.filter((row) => row.status === 'absent').length,
      late: attendance.filter((row) => row.status === 'late').length,
      excused: attendance.filter((row) => row.status === 'excused').length,
      marksEntered: assessmentRows.filter((row) => row.score !== null && row.score !== undefined).length,
    },
  };
}
