import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { Assessment } from '../models/Assessment.js';
import { AttendanceSheet } from '../models/AttendanceSheet.js';
import {
  ASSIGNMENT_POPULATE,
  READ_STATUSES,
  WRITE_STATUSES,
  assignmentDto,
  assignmentForTeacherRead,
} from './teacherScope.service.js';
import { activeProgramIdsForTeacher, activeProgramsForTeacher, teacherOfferingFilter } from './teacherAccess.service.js';
import { ownFilter } from './registrar.helpers.js';

const matches = (row, term) => {
  if (!term) return true;
  const haystack = [
    row.courseCode,
    row.courseTitle,
    row.program,
    row.level ? `level ${row.level}` : '',
    row.academicYear,
    row.term,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
};

export async function listTeacherAssignments(teacherId, query) {
  const statuses =
    query.status === 'all'
      ? ['open', 'in_progress', 'completed', 'draft', 'pending']
      : query.status === 'active'
        ? WRITE_STATUSES
        : query.status === 'pending'
          ? ['draft', 'pending']
          : query.status === 'completed'
            ? ['completed']
            : READ_STATUSES;
  const access = await teacherOfferingFilter(teacherId);
  const clauses = [access, { status: { $in: statuses } }];
  if (query.program) clauses.push({ program: query.program });
  if (query.batch) clauses.push({ batch: query.batch });
  if (query.category) clauses.push({ category: query.category });

  const rows = await CourseOffering.find(ownFilter({ $and: clauses }))
    .populate(ASSIGNMENT_POPULATE)
    .sort({ createdAt: -1 })
    .lean();

  const ids = rows.map((row) => row._id);
  const [registrationCounts, assessmentCounts, attendanceCounts] = await Promise.all([
    CourseRegistration.aggregate([
      { $match: { offering: { $in: ids }, status: 'registered' } },
      { $group: { _id: '$offering', count: { $sum: 1 } } },
    ]),
    Assessment.aggregate([
      { $match: { offering: { $in: ids } } },
      {
        $group: {
          _id: '$offering',
          count: { $sum: 1 },
          awaiting: { $sum: { $cond: [{ $in: ['$status', ['published', 'closed']] }, 1, 0] } },
        },
      },
    ]),
    AttendanceSheet.aggregate([
      { $match: { offering: { $in: ids }, status: 'draft' } },
      { $group: { _id: '$offering', count: { $sum: 1 } } },
    ]),
  ]);

  const registrations = Object.fromEntries(registrationCounts.map((row) => [String(row._id), row.count]));
  const assessments = Object.fromEntries(
    assessmentCounts.map((row) => [String(row._id), { total: row.count, awaiting: row.awaiting }]),
  );
  const attendance = Object.fromEntries(attendanceCounts.map((row) => [String(row._id), row.count]));

  const search = String(query.search || '').trim().toLowerCase();
  const filtered = rows
    .map((row) =>
      assignmentDto(
        row,
        {
          studentCount: registrations[String(row._id)] || 0,
          assessmentCount: assessments[String(row._id)]?.total || 0,
          assessmentsAwaitingSubmission: assessments[String(row._id)]?.awaiting || 0,
          attendanceDrafts: attendance[String(row._id)] || 0,
        },
        teacherId,
      ),
    )
    .filter((row) => matches(row, search));

  const total = filtered.length;
  const start = (query.page - 1) * query.limit;
  const programs = await activeProgramsForTeacher(teacherId);
  const teacherProgramIds = new Set(programs.map((p) => String(p._id)));

  // Enrich with teacherProgramIds for manage permissions
  const enrichedAssignments = filtered.slice(start, start + query.limit).map((dto) => {
    if (dto.programId && teacherProgramIds.has(String(dto.programId))) {
      return { ...dto, canManage: true };
    }
    return dto;
  });

  return {
    assignments: enrichedAssignments,
    programs: programs.map((row) => ({
      id: String(row._id),
      code: row.code,
      name: row.name,
      qualificationType: row.qualificationType,
      department: row.department ? { id: String(row.department._id), code: row.department.code, name: row.department.name } : null,
    })),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function teacherAssignmentDetail(teacherId, assignmentId) {
  const row = await assignmentForTeacherRead(teacherId, assignmentId).catch(() => null);
  if (!row) return null;

  const [students, assessments, attendance] = await Promise.all([
    CourseRegistration.countDocuments({ offering: assignmentId, status: 'registered' }),
    Assessment.aggregate([
      { $match: { offering: row._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    AttendanceSheet.find({ offering: assignmentId })
      .sort({ date: -1, createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  const assessmentCounts = { draft: 0, published: 0, closed: 0, submitted: 0 };
  for (const group of assessments) assessmentCounts[group._id] = group.count;

  const teacherProgIds = new Set(await activeProgramIdsForTeacher(teacherId));

  return assignmentDto(
    row,
    {
      studentCount: students,
      assessmentCounts,
      recentAttendance: attendance.map((sheet) => ({
        id: String(sheet._id),
        dateKey: sheet.dateKey,
        period: sheet.period,
        status: sheet.status,
      })),
    },
    teacherId,
    teacherProgIds,
  );
}
