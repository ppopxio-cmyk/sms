import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { Assessment } from '../models/Assessment.js';
import { AttendanceSheet } from '../models/AttendanceSheet.js';
import {
  ASSIGNMENT_POPULATE,
  READ_STATUSES,
  WRITE_STATUSES,
  assignmentDto,
} from './teacherScope.service.js';

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
    query.status === 'all' ? READ_STATUSES : query.status === 'active' ? WRITE_STATUSES : ['completed'];
  const filter = { teacher: teacherId, status: { $in: statuses } };
  if (query.program) filter.program = query.program;

  const rows = await CourseOffering.find(filter)
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
      assignmentDto(row, {
        studentCount: registrations[String(row._id)] || 0,
        assessmentCount: assessments[String(row._id)]?.total || 0,
        assessmentsAwaitingSubmission: assessments[String(row._id)]?.awaiting || 0,
        attendanceDrafts: attendance[String(row._id)] || 0,
      }),
    )
    .filter((row) => matches(row, search));

  const total = filtered.length;
  const start = (query.page - 1) * query.limit;
  return {
    assignments: filtered.slice(start, start + query.limit),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function teacherAssignmentDetail(teacherId, assignmentId) {
  const row = await CourseOffering.findOne({
    _id: assignmentId,
    teacher: teacherId,
    status: { $in: READ_STATUSES },
  })
    .populate(ASSIGNMENT_POPULATE)
    .lean();
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

  return assignmentDto(row, {
    studentCount: students,
    assessmentCounts,
    recentAttendance: attendance.map((sheet) => ({
      id: String(sheet._id),
      dateKey: sheet.dateKey,
      period: sheet.period,
      status: sheet.status,
    })),
  });
}
