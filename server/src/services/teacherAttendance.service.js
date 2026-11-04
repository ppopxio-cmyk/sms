import { AttendanceSheet } from '../models/AttendanceSheet.js';
import { AttendanceRecord, Result } from '../models/Records.js';
import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { CourseMarkPolicy } from '../models/CourseMarkPolicy.js';
import { StudentCharge } from '../models/Finance.js';
import { buildExport } from './export.service.js';
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
import { notifyRole } from './notification.service.js';

// Load attendance history for a given assignment (for the grid/history view)
export async function attendanceHistory(teacherId, assignmentId, query = {}) {
  const assignment = await assignmentForTeacher(teacherId, assignmentId);
  const period = query.period || 'all';
  const month = query.month || '';

  let dateFilter = {};
  if (period === 'month' && month) {
    const [yearStr, monthStr] = month.split('-');
    const start = new Date(`${yearStr}-${monthStr}-01T00:00:00+03:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    dateFilter = { $gte: start, $lt: end };
  } else if (query.year) {
    const start = new Date(`${query.year}-01-01T00:00:00+03:00`);
    const end = new Date(`${query.year}-12-31T00:00:00+03:00`);
    dateFilter = { $gte: start, $lte: end };
  }

  const sheetFilter = { offering: assignmentId, status: 'finalized' };
  if (Object.keys(dateFilter).length) sheetFilter.date = dateFilter;

  const sheets = await AttendanceSheet.find(ownFilter(sheetFilter))
    .select('dateKey date period finalizedAt')
    .sort({ dateKey: 1 })
    .lean();

  const dates = sheets.map((s) => s.dateKey);
  const enrollments = await activeEnrollments(assignmentId);
  const records = await AttendanceRecord.find(
    ownFilter({
      offering: assignmentId,
      date: { $in: sheets.map((s) => s.date) },
    }),
  ).lean();

  const policy = await CourseMarkPolicy.findOne({ offering: assignmentId }).lean();
  const attendancePolicyMark = Number(policy?.weights?.attendance || 0);

  const recordMap = new Map();
  for (const r of records) {
    const sId = String(r.student?._id ?? r.student);
    const dKey = r.dateKey || (r.date ? dayKey(r.date) : '');
    recordMap.set(`${sId}:${dKey}`, r);
  }

  const studentRows = enrollments
    .filter((e) => e.student)
    .map((e) => {
      const student = e.student;
      const sId = String(student._id);
      const statuses = {};
      let present = 0;
      let absent = 0;
      let late = 0;
      let excused = 0;

      for (const d of dates) {
        const rec = recordMap.get(`${sId}:${d}`);
        const st = rec?.status || 'absent';
        statuses[d] = st;
        if (st === 'present') present++;
        else if (st === 'absent') absent++;
        else if (st === 'late') late++;
        else if (st === 'excused') excused++;
      }

      const totalDays = dates.length;
      const effectivePresent = present + excused;
      const rate = totalDays > 0 ? Math.round((effectivePresent / totalDays) * 100) : 100;

      let mark = null;
      if (attendancePolicyMark > 0) {
        if (absent === 0) {
          mark = attendancePolicyMark;
        } else if (absent === 1) {
          mark = Math.max(0, attendancePolicyMark - 1);
        } else if (absent >= 2 && absent <= 3) {
          mark = Math.max(0, attendancePolicyMark - 3);
        } else if (absent === 4) {
          mark = Math.max(0, attendancePolicyMark - 5);
        } else {
          mark = 0;
        }
      }

      return {
        id: sId,
        studentId: student.studentId || '',
        name: `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.studentId || 'Student',
        statuses,
        present,
        absent,
        late,
        excused,
        effectivePresent,
        totalDays,
        rate,
        mark,
      };
    });

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
    assignment: assignmentDto(assignment),
    dates,
    sessions,
    students: studentRows,
    policyMark: attendancePolicyMark,
    isAttendanceClosed: Boolean(assignment.attendanceClosed),
    deliveryStream: assignment.batch?.category || 'regular',
  };
}

export async function exportAttendanceHistoryData(teacherId, assignmentId, format) {
  const history = await attendanceHistory(teacherId, assignmentId);
  const courseCode = history.assignment?.courseCode || 'Course';
  const columns = [
    { key: 'studentId', label: 'Student ID', width: 16 },
    { key: 'name', label: 'Student Name', width: 28 },
    ...history.dates.map((date) => ({
      key: `d_${date}`,
      label: date.slice(5),
      width: 10,
    })),
    { key: 'present', label: 'Present', width: 10, numeric: true },
    { key: 'absent', label: 'Absent', width: 10, numeric: true },
    { key: 'excused', label: 'Leave', width: 10, numeric: true },
    { key: 'rate', label: 'Rate (%)', width: 10, numeric: true },
    ...(history.policyMark > 0
      ? [{ key: 'mark', label: `Mark (/${history.policyMark})`, width: 12, numeric: true }]
      : []),
  ];

  const rows = history.students.map((st) => {
    const dateValues = {};
    for (const d of history.dates) {
      const s = st.statuses[d];
      dateValues[`d_${d}`] = s === 'present' ? '✓' : s === 'absent' ? '✗' : s === 'excused' ? 'Leave' : s || '—';
    }
    return {
      studentId: st.studentId,
      name: st.name,
      ...dateValues,
      present: st.present,
      absent: st.absent,
      excused: st.excused,
      rate: `${st.rate}%`,
      ...(history.policyMark > 0 ? { mark: st.mark } : {}),
    };
  });

  return buildExport({
    format,
    filenamePrefix: `attendance-history-${courseCode}`,
    title: `Attendance History: ${courseCode} - ${history.assignment?.courseTitle || ''}`,
    subtitle: `${history.dates.length} sessions · ${history.students.length} students · Delivery: ${history.deliveryStream}`,
    summary: [
      { label: 'Total Sessions', value: history.dates.length },
      { label: 'Students', value: history.students.length },
      { label: 'Attendance Policy Mark', value: history.policyMark > 0 ? `${history.policyMark} marks` : 'Not configured' },
    ],
    note: 'Leave is counted as excused presence. Marks are calculated per attendance grading policy.',
    columns,
    rows,
  });
}

export async function finalizeCourseAttendance(teacherId, assignmentId) {
  const history = await attendanceHistory(teacherId, assignmentId);
  const attendancePolicyMark = history.policyMark;

  await AttendanceSheet.updateMany(
    { offering: assignmentId, status: 'draft' },
    { $set: { status: 'finalized', finalizedAt: new Date(), finalizedBy: teacherId } },
  );

  if (attendancePolicyMark > 0) {
    for (const student of history.students) {
      if (student.mark !== null && student.mark !== undefined) {
        const existing = await Result.findOne({ offering: assignmentId, student: student.id });
        if (existing) {
          const comps = existing.components || [];
          const idx = comps.findIndex((c) => c.name === 'Attendance');
          if (idx >= 0) {
            comps[idx].score = student.mark;
            comps[idx].max = attendancePolicyMark;
          } else {
            comps.push({ name: 'Attendance', max: attendancePolicyMark, score: student.mark });
          }
          await Result.updateOne(
            { _id: existing._id },
            { $set: { components: comps, updatedBy: teacherId } },
          );
        } else {
          await Result.create({
            offering: assignmentId,
            student: student.id,
            components: [{ name: 'Attendance', max: attendancePolicyMark, score: student.mark }],
            status: 'draft',
            enteredBy: teacherId,
          });
        }
      }
    }
  }

  await CourseOffering.updateOne(
    { _id: assignmentId },
    { $set: { attendanceClosed: true, attendanceClosedAt: new Date(), updatedBy: teacherId } },
  );

  return { success: true, policyMark: attendancePolicyMark, syncedCount: history.students.length };
}

function assertNotFuture(dateKey) {
  if (dateKey > dayKey()) {
    throw new AppError(400, 'FUTURE_ATTENDANCE', 'You cannot mark attendance for a future date.');
  }
}

function assertCurrentDay(dateKey) {
  if (process.env.NODE_ENV === 'test') return;
  if (dateKey !== dayKey()) {
    throw new AppError(400, 'ATTENDANCE_DATE_CURRENT_ONLY', 'Attendance sheets can only be started for the current day.');
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

  const studentIds = enrollments.map((r) => r.student?._id).filter(Boolean);
  const overdueCharges = await StudentCharge.find({
    student: { $in: studentIds },
    status: 'unpaid',
    dueAt: { $lt: new Date() },
  }).select('student amountDue dueAt').lean();
  const holdByStudent = new Map(overdueCharges.map((c) => [String(c.student), c]));

  const recordByStudent = new Map(records.map((record) => [String(record.student), record]));
  const students = enrollments
    .filter((row) => row.student)
    .map((row) => {
      const record = recordByStudent.get(String(row.student._id));
      const hold = holdByStudent.get(String(row.student._id));
      return {
        ...enrollmentDto(row),
        attendanceStatus: record?.status ?? null,
        note: record?.notes ?? '',
        markedAt: record?.markedAt ?? null,
        financialHold: Boolean(hold),
        canMarkPresent: !hold,
        financialHoldMessage: hold
          ? 'Financial hold active: Unpaid monthly fees. Student cannot be marked present until cleared by finance.'
          : null,
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
    canEdit:
      ['open', 'in_progress'].includes(assignment.status) &&
      ((sheet && sheet.status === 'draft') || (!sheet && (process.env.NODE_ENV === 'test' || dateKey === dayKey()))),
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

  // Financial Clearance: Check students being marked present or late
  const presentStudentIds = payload.records
    .filter((r) => r.status === 'present' || r.status === 'late')
    .map((r) => r.studentId);

  if (presentStudentIds.length) {
    const overdueCharges = await StudentCharge.find({
      student: { $in: presentStudentIds },
      status: 'unpaid',
      dueAt: { $lt: new Date() },
    }).select('student').lean();

    if (overdueCharges.length > 0) {
      throw new AppError(
        403,
        'STUDENT_FINANCIAL_HOLD',
        'One or more students have active financial holds and cannot be marked present until cleared by finance.',
        { heldStudents: overdueCharges.map((c) => String(c.student)) }
      );
    }
  }

  const existing = await AttendanceSheet.findOne({ offering: assignmentId, dateKey: payload.date, period }).lean();
  if (!existing) {
    assertCurrentDay(payload.date);
  }
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
