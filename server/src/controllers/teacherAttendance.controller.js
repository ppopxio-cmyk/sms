import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { User } from '../models/User.js';
import { sendCode } from '../services/codeDelivery.js';
import { checkCode, resendWaitMessage } from '../services/code.service.js';
import {
  attendanceOverview,
  attendanceRoster,
  finalizeAttendance,
  saveAttendance,
  attendanceHistory,
  exportAttendanceHistoryData,
  finalizeCourseAttendance,
} from '../services/teacherAttendance.service.js';

export const overview = asyncHandler(async (req, res) => {
  res.json(await attendanceOverview(req.user.id, req.valid.query));
});

export const roster = asyncHandler(async (req, res) => {
  res.json(await attendanceRoster(req.user.id, req.valid.params.assignmentId, req.valid.query));
});

export const save = asyncHandler(async (req, res) => {
  const data = await saveAttendance(req.user.id, req.valid.params.assignmentId, req.body);
  audit({
    req,
    action: 'teacher.attendance_saved',
    targetType: 'attendance',
    targetId: data?.id,
    meta: {
      assignmentId: req.valid.params.assignmentId,
      date: req.body.date,
      period: req.body.period,
      records: req.body.records.length,
    },
  });
  res.json(data);
});

export const finalize = asyncHandler(async (req, res) => {
  const data = await finalizeAttendance(
    req.user.id,
    req.valid.params.assignmentId,
    req.valid.params.attendanceId,
    req.body,
  );
  audit({
    req,
    action: 'teacher.attendance_finalized',
    targetType: 'attendance',
    targetId: data?.id,
    meta: {
      assignmentId: req.valid.params.assignmentId,
      date: data?.dateKey,
      period: data?.period,
      marked: data?.marked,
    },
  });
  res.json(data);
});

export const history = asyncHandler(async (req, res) => {
  res.json(await attendanceHistory(req.user.id, req.valid.params.assignmentId, req.valid.query));
});

export const exportHistory = asyncHandler(async (req, res) => {
  const format = req.query.format || 'xlsx';
  const data = await exportAttendanceHistoryData(req.user.id, req.valid.params.assignmentId, format);
  audit({
    req,
    action: 'teacher.attendance_history_exported',
    targetType: 'attendance',
    targetId: req.valid.params.assignmentId,
    meta: { format, rowCount: data.rowCount },
  });
  res.setHeader('Content-Type', data.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${data.filename}"`);
  res.send(data.buffer);
});

export const requestFinalizeCode = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user?.email) throw new AppError(400, 'NO_EMAIL', 'Your account has no email address.');
  const sent = await sendCode(user, 'attendance_finalize');
  if (!sent) {
    throw new AppError(429, 'WAIT_BEFORE_RESEND', resendWaitMessage);
  }
  res.json({ message: `A confirmation code has been sent to ${user.email}.` });
});

export const finalizeCourse = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user?.email) throw new AppError(400, 'NO_EMAIL', 'Your account has no email address.');
  const code = String(req.body.code || '').trim();
  if (!code) throw new AppError(400, 'CODE_REQUIRED', 'Confirmation code is required.');
  await checkCode(user._id, 'attendance_finalize', code);

  const result = await finalizeCourseAttendance(req.user.id, req.valid.params.assignmentId);
  audit({
    req,
    action: 'teacher.course_attendance_finalized',
    targetType: 'attendance',
    targetId: req.valid.params.assignmentId,
    meta: { policyMark: result.policyMark, syncedCount: result.syncedCount },
  });
  res.json({ message: 'Course attendance finalized and synced to marks.', ...result });
});
