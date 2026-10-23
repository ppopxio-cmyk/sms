import { AttendanceSheet } from '../models/AttendanceSheet.js';
import { AttendanceRecord } from '../models/Records.js';
import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import {
  ASSIGNMENT_POPULATE,
  activeEnrollments,
  assignmentDto,
  assignmentForTeacher,
  assignmentIdsForTeacher,
  readAssignmentIdsForTeacher,
  dateFromKey,
  dayKey,
  enrollmentDto,
} from './teacherScope.service.js';
import { AppError } from '../utils/AppError.js';
import { ownFilter } from './registrar.helpers.js';

// Load attendance history for a given assignment (for the grid/history view)
export async function attendanceHistory(teacherId, assignmentId, query) {
  const assignment = await assignmentForTeacher(teacherId, assignmentId);
  const period = query.period || 'month';
  const month = query.month || '';

  let dateFilter = {};
  if (period === 'month' && month) {
    const [yearStr, monthStr] = month.split('-');
    const start = new Date(`${yearStr}-${monthStr}-01T00:00:00+03:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    dateFilter = { $gte: start, $lt: end };
  } else {
    const year = query.year || new Date().getFullYear();
    const start = new Date(`${year}-01-01T00:00:00+03:00`);
    const end = new Date(`${year}-12-31T00:00:00+03:00`);
    dateFilter = { $gte: start, $lte: end };
  }

  const sheets = await AttendanceSheet.find(
    ownFilter({
      offering: assignmentId,
      status: 'finalized',
      date: dateFilter,
    }),
  )
    .select('dateKey date period finalizedAt')
    .sort({ dateKey: 1 })
    .lean();

  if (!sheets.length) return { sessions: [], deliveryStream: assignment.batch?.category || 'regular' };

  const records = await AttendanceRecord.find(
    ownFilter({
      offering: assignmentId,
      date: { $in: sheets.map((s) => s.date) },
    }),
  )
    .lean();

  const sessions = sheets.map((sheet) => {
    const sheetRecords = records.filter(
      (r) =>
        String(r.offering) === String(sheet.offering) &&
        r.period === sheet.period &&
        new Date(r.date).getTime() === new Date(sheet.date).getTime(),
    );
    return {
      id: String(sheet._id),
      dateKey: sheet.dateKey,
      period: sheet.period,
      present: sheetRecords.filter((r) => r.status === 'present').length,
      absent: sheetRecords.filter((r) => r.status === 'absent').length,
      late: sheetRecords.filter((r) => r.status === 'late').length,
      excused: sheetRecords.filter((r) => r.status === 'excused').length,
      total: sheetRecords.length,
      status: sheet.status,
    };
  });

  return {
    sessions,
    deliveryStream: assignment.batch?.category || 'regular',
  };
}

function assertNotFuture(dateKey) {
  if (dateKey > dayKey()) {
    throw new AppError(400, 'FUTURE_ATTENDANCE', 'You cannot mark attendance for a future date.');
  }
}

function sheetSummary(sheet, records, assignment = null) {
  const course = assignment?.course ?? null;
  return {
    id: String(sheet._id),
    assignmentId: String(sheet.offering),
    courseCode: course?.code ?? '',
    courseTitle: course?.title ?? '',
    academicYear: assignment?.academicYear?.label ?? '',
    term: assignment?.term ?? '',
    level: assignment?.level ?? null,
    dateKey: sheet.dateKey,
    period: sheet.period,
    status: sheet.status,
    revision: sheet.revision,
    marked: records.length,
    present: records.filter((record) => record.status === 'present').length,
    absent: records.filter((record) => record.status === 'absent').length,
    late: records.filter((record) => record.status === 'late').length,
    excused: records.filter((record) => record.status === 'excused').length,
    finalizedAt: sheet.finalizedAt ?? null,
    updatedAt: sheet.updatedAt,
  };
}

async function loadRecords(sheets) {
  if (!sheets.length) return [];
  return AttendanceRecord.find(
    ownFilter({
      offering: { $in: sheets.map((row) => row.offering) },
      date: { $in: sheets.map((row) => row.date) },
    }),
  )
    .select('offering date period status')
    .lean();
}

export async function attendanceOverview(teacherId, query) {
  const assignmentIds = await readAssignmentIdsForTeacher(teacherId);
  const match = { offering: { $in: assignmentIds } };
  if (query.assignmentId) match.offering = { $in: assignmentIds.filter((id) => String(id) === query.assignmentId) };
  if (query.status !== 'all') match.status = query.status;
  const filter = ownFilter(match);

  const [total, rows] = await Promise.all([
    AttendanceSheet.countDocuments(filter),
    AttendanceSheet.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
  ]);

  const [draftCount, records, assignments] = await Promise.all([
    AttendanceSheet.countDocuments(ownFilter({ offering: match.offering, status: 'draft' })),
    loadRecords(rows),
    assignmentIds.length
      ? CourseOffering.find(ownFilter({ _id: { $in: assignmentIds } }))
          .populate(ASSIGNMENT_POPULATE)
          .lean()
      : [],
  ]);
  const assignmentById = new Map(assignments.map((row) => [String(row._id), row]));

  return {
    sessions: rows.map((sheet) => {
      const sheetRecords = records.filter(
        (record) =>
          String(record.offering) === String(sheet.offering) &&
          record.period === sheet.period &&
          new Date(record.date).getTime() === new Date(sheet.date).getTime(),
      );
      return sheetSummary(sheet, sheetRecords, assignmentById.get(String(sheet.offering)));
    }),
    draftCount,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function attendanceRoster(teacherId, assignmentId, query) {
  const assignment = await assignmentForTeacher(teacherId, assignmentId);
  const dateKey = query.date || dayKey();
  assertNotFuture(dateKey);
  const date = dateFromKey(dateKey);
  const period = query.period || 'day';

  const [enrollments, sheet, records] = await Promise.all([
    activeEnrollments(assignmentId),
    AttendanceSheet.findOne({ offering: assignmentId, dateKey, period }).lean(),
    AttendanceRecord.find({ offering: assignmentId, date, period }).lean(),
  ]);

  const recordByStudent = new Map(records.map((record) => [String(record.student), record]));
  const students = enrollments
    .filter((row) => row.student)
    .map((row) => {
      const record = recordByStudent.get(String(row.student._id));
      return {
        ...enrollmentDto(row),
        attendanceStatus: record?.status ?? null,
        note: record?.notes ?? '',
        markedAt: record?.markedAt ?? null,
      };
    });

  return {
    assignment: assignmentDto(assignment),
    date: dateKey,
    period,
    session: sheet
      ? {
          id: String(sheet._id),
          status: sheet.status,
          revision: sheet.revision,
          finalizedAt: sheet.finalizedAt,
        }
      : null,
    canEdit: ['open', 'in_progress'].includes(assignment.status) && (!sheet || sheet.status === 'draft'),
    students,
    marked: students.filter((student) => student.attendanceStatus).length,
    total: students.length,
  };
}

export async function saveAttendance(teacherId, assignmentId, payload) {
  const assignment = await assignmentForTeacher(teacherId, assignmentId, { write: true, populate: false });
  assertNotFuture(payload.date);
  const date = dateFromKey(payload.date);
  const period = payload.period || 'day';

  const registrations = await CourseRegistration.find({ offering: assignmentId, status: 'registered' }).select('student').lean();
  const allowed = new Set(registrations.map((row) => String(row.student)));
  for (const record of payload.records) {
    if (!allowed.has(record.studentId)) {
      throw new AppError(404, 'STUDENT_NOT_FOUND', 'One of those students is not registered in this class.');
    }
  }

  const existing = await AttendanceSheet.findOne({ offering: assignmentId, dateKey: payload.date, period }).lean();
  if (existing?.status === 'finalized') {
    throw new AppError(409, 'ATTENDANCE_FINALIZED', 'This attendance sheet was finalized and is locked.');
  }
  if (existing && payload.revision !== undefined && Number(payload.revision) !== existing.revision) {
    throw new AppError(409, 'ATTENDANCE_CHANGED', 'This sheet changed in another window. Reload it before saving.');
  }

  const now = new Date();
  let sheet;
  if (existing) {
    sheet = await AttendanceSheet.findOneAndUpdate(
      { _id: existing._id, status: 'draft', revision: existing.revision },
      { $set: { updatedBy: teacherId, date }, $inc: { revision: 1 } },
      { new: true },
    ).lean();
    if (!sheet) {
      throw new AppError(409, 'ATTENDANCE_CHANGED', 'This sheet changed in another window. Reload it before saving.');
    }
  } else {
    try {
      sheet = await AttendanceSheet.create({
        offering: assignmentId,
        dateKey: payload.date,
        date,
        period,
        status: 'draft',
        revision: 0,
        createdBy: teacherId,
        updatedBy: teacherId,
      });
      sheet = sheet.toObject();
    } catch (error) {
      if (error?.code === 11000) {
        throw new AppError(409, 'ATTENDANCE_CHANGED', 'This sheet was opened in another window. Reload it before saving.');
      }
      throw error;
    }
  }

  // The registrar's AttendanceRecord table holds the rows. Saving replaces the set for
  // this meeting so a draft can never keep a status the teacher has cleared.
  await AttendanceRecord.deleteMany(
    ownFilter({
      offering: assignmentId,
      date,
      period,
      student: { $nin: payload.records.map((record) => record.studentId) },
    }),
  );

  if (payload.records.length) {
    await AttendanceRecord.bulkWrite(
      payload.records.map((record) => ({
        updateOne: {
          filter: { offering: assignmentId, student: record.studentId, date, period },
          update: {
            $set: {
              status: record.status,
              notes: record.note ?? '',
              markedBy: teacherId,
              markedAt: now,
            },
            $setOnInsert: {
              offering: assignmentId,
              student: record.studentId,
              date,
              period,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  const records = await AttendanceRecord.find({ offering: assignmentId, date, period }).lean();
  const populated = await assignmentForTeacher(teacherId, assignmentId);
  return sheetSummary(sheet, records, populated);
}

export async function finalizeAttendance(teacherId, assignmentId, attendanceId, payload) {
  await assignmentForTeacher(teacherId, assignmentId, { write: true, populate: false });
  const sheet = await AttendanceSheet.findOne({ _id: attendanceId, offering: assignmentId }).lean();
  if (!sheet) throw new AppError(404, 'ATTENDANCE_NOT_FOUND', 'That attendance sheet was not found.');
  if (sheet.status === 'finalized') {
    throw new AppError(409, 'ATTENDANCE_FINALIZED', 'This attendance sheet is already finalized.');
  }
  if (payload.revision !== undefined && Number(payload.revision) !== sheet.revision) {
    throw new AppError(409, 'ATTENDANCE_CHANGED', 'This sheet changed in another window. Reload it before saving.');
  }

  const registrations = await CourseRegistration.find({ offering: assignmentId, status: 'registered' })
    .select('student')
    .lean();
  const records = await AttendanceRecord.find({
    offering: assignmentId,
    date: sheet.date,
    period: sheet.period,
  }).lean();
  const marked = new Set(records.map((record) => String(record.student)));
  const missing = registrations.filter((row) => !marked.has(String(row.student))).length;
  if (missing > 0) {
    throw new AppError(400, 'ATTENDANCE_INCOMPLETE', `Mark every student before finalizing. ${missing} still have no status.`, {
      missing,
    });
  }

  const updated = await AttendanceSheet.findOneAndUpdate(
    { _id: sheet._id, status: 'draft', revision: sheet.revision },
    {
      $set: {
        status: 'finalized',
        finalizedAt: new Date(),
        finalizedBy: teacherId,
        updatedBy: teacherId,
      },
      $inc: { revision: 1 },
    },
    { new: true },
  ).lean();
  if (!updated) {
    throw new AppError(409, 'ATTENDANCE_CHANGED', 'This sheet changed in another window. Reload it before saving.');
  }

  const populated = await assignmentForTeacher(teacherId, assignmentId);
  return sheetSummary(updated, records, populated);
}
