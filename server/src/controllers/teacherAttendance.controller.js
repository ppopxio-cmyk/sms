import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import {
  attendanceOverview,
  attendanceRoster,
  finalizeAttendance,
  saveAttendance,
  attendanceHistory,
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
