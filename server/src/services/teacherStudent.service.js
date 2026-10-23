import { Student } from '../models/Student.js';
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
  readAssignmentIdsForTeacher,
  dayKey,
  studentDto,
} from './teacherScope.service.js';
import { activeProgramIdsForTeacher } from './teacherAccess.service.js';
import { ownFilter, searchFilter } from './registrar.helpers.js';

const OFFERING_POPULATE = { path: 'offering', populate: ASSIGNMENT_POPULATE };
const emptyPage = (query) => ({
  students: [],
  pagination: { page: query.page, limit: query.limit, total: 0, pages: 1 },
});

async function studentIdsEnrolledIn(assignmentIds) {
  if (!assignmentIds.length) return [];
  return CourseRegistration.distinct(
    'student',
    ownFilter({ offering: { $in: assignmentIds }, status: 'registered' }),
  );
}

export async function listTeacherStudents(teacherId, query) {
  const programIds = await activeProgramIdsForTeacher(teacherId);
  const readIds = await readAssignmentIdsForTeacher(teacherId);
  if (!programIds.length && !readIds.length) return emptyPage(query);

  const clauses = [];
  if (programIds.length) {
    clauses.push({ program: { $in: programIds } });
  } else {
    const ids = await studentIdsEnrolledIn(readIds);
    if (!ids.length) return emptyPage(query);
    clauses.push({ _id: { $in: ids } });
  }

  if (query.assignmentId) {
    const ids = await studentIdsEnrolledIn([query.assignmentId]);
    if (!ids.length) return emptyPage(query);
    clauses.push({ _id: { $in: ids } });
  }
  if (query.program) clauses.push({ program: query.program });
  if (query.batch) clauses.push({ batch: query.batch });
  if (query.category) clauses.push({ studentCategory: query.category });
  if (query.level) clauses.push({ level: query.level });
  if (query.status && query.status !== 'all') {
    if (['active', 'completed', 'withdrawn', 'cancelled', 'pending'].includes(query.status)) {
      clauses.push({ enrollmentStatus: query.status });
    } else {
      clauses.push({ studentStatus: query.status });
    }
  }
  const search = searchFilter(query.search, ['studentId', 'fullName', 'email', 'phone']);
  if (search) clauses.push(search);

  const filter = ownFilter({ $and: clauses });
  const start = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    Student.find(filter)
      .populate('program', 'code name qualificationType')
      .populate('batch', 'code name category currentLevel status')
      .populate('department', 'code name')
      .sort({ fullName: 1 })
      .skip(start)
      .limit(query.limit)
      .lean(),
    Student.countDocuments(filter),
  ]);

  const studentIds = rows.map((row) => row._id);
  const registrationFilter = { student: { $in: studentIds }, offering: { $in: readIds } };
  if (query.assignmentId) registrationFilter.offering = { $in: [query.assignmentId] };
  const registrations = studentIds.length && readIds.length
    ? await CourseRegistration.find(ownFilter(registrationFilter))
        .populate(OFFERING_POPULATE)
        .sort({ createdAt: -1 })
        .lean()
    : [];

  const byStudent = new Map();
  for (const row of registrations) {
    const key = String(row.student);
    if (!byStudent.has(key)) byStudent.set(key, []);
    const offering = row.offering && typeof row.offering === 'object' ? row.offering : null;
    byStudent.get(key).push({
      registrationId: String(row._id),
      assignmentId: offering ? String(offering._id) : String(row.offering),
      courseCode: offering?.course?.code ?? '',
      courseTitle: offering?.course?.title ?? '',
      academicYear: offering?.academicYear?.label ?? '',
      term: offering?.term ?? '',
      level: offering?.level ?? null,
      batch: offering?.batch?.code ?? '',
      category: offering?.category ?? offering?.batch?.category ?? '',
      canManage: String(offering?.teacher?._id ?? offering?.teacher ?? '') === String(teacherId),
      registrationStatus: row.status,
    });
  }

  const students = rows.map((student) => {
    const dto = studentDto(student);
    return {
      ...dto,
      studentNumber: dto.studentNumber,
      name: dto.name,
      classes: byStudent.get(String(student._id)) || [],
    };
  });

  return {
    students,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function teacherStudentDetail(teacherId, studentId) {
  const programIds = await activeProgramIdsForTeacher(teacherId);
  const ownAssignmentIds = await readAssignmentIdsForTeacher(teacherId);
  const readIds = await readAssignmentIdsForTeacher(teacherId);

  const student = await Student.findById(studentId)
    .populate('program', 'code name qualificationType')
    .populate('batch', 'code name category currentLevel status')
    .populate('department', 'code name')
    .lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student was not found.');

  const inProgram = programIds.some((id) => String(id) === String(student.program?._id ?? student.program));
  const ownRegistration = ownAssignmentIds.length
    ? await CourseRegistration.exists(
        ownFilter({ student: student._id, offering: { $in: ownAssignmentIds } }),
      )
    : false;
  if (!inProgram && !ownRegistration) {
    throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student was not found in your programmes or classes.');
  }

  const rows = readIds.length
    ? await CourseRegistration.find(ownFilter({ offering: { $in: readIds }, student: student._id }))
        .populate(STUDENT_POPULATE)
        .populate(OFFERING_POPULATE)
        .lean()
    : [];

  const ownRows = rows.filter((row) => {
    const offering = row.offering && typeof row.offering === 'object' ? row.offering : null;
    return String(offering?.teacher?._id ?? offering?.teacher ?? '') === String(teacherId);
  });
  const activeRows = ownRows.filter((row) => row.status === 'registered');
  const offerings = ownRows
    .map((row) => row.offering)
    .filter((row) => row && typeof row === 'object');
  const offeringIds = offerings.map((row) => row._id);

  const [sheets, attendanceRecords, assessments, results] = await Promise.all([
    offeringIds.length
      ? AttendanceSheet.find(ownFilter({ offering: { $in: offeringIds } }))
          .select('_id offering dateKey period status')
          .lean()
      : [],
    offeringIds.length
      ? AttendanceRecord.find(ownFilter({ offering: { $in: offeringIds }, student: student._id })).lean()
      : [],
    offeringIds.length
      ? Assessment.find(
          ownFilter({ offering: { $in: offeringIds }, status: { $in: ['published', 'closed', 'submitted'] } }),
        ).lean()
      : [],
    offeringIds.length
      ? Result.find(ownFilter({ offering: { $in: offeringIds }, student: student._id })).lean()
      : [],
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
    student: studentDto(student),
    classes: rows
      .filter((row) => row.offering && typeof row.offering === 'object')
      .map((row) =>
        assignmentDto(
          row.offering,
          {
            registrationId: String(row._id),
            registrationStatus: row.status,
          },
          teacherId,
        ),
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

