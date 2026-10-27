import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import { User } from '../models/User.js';
import { sendCode } from '../services/codeDelivery.js';
import { checkCode, resendWaitMessage } from '../services/code.service.js';
import { AppError } from '../utils/AppError.js';
import {
  calculateCourseMarks,
  courseMarksDetail,
  exportCourseMarks,
  getCourseMarkPolicy,
  listCourseMarkSummary,
  saveCourseMarkPolicy,
  saveCourseMarks,
  submitCourseMarks,
} from '../services/courseMark.service.js';

export const courses = asyncHandler(async (req, res) => {
  res.json(await listCourseMarkSummary(req.user.id, req.valid.query));
});

export const policy = asyncHandler(async (req, res) => {
  res.json(await getCourseMarkPolicy(req.user.id, req.valid.params.assignmentId));
});

export const savePolicy = asyncHandler(async (req, res) => {
  const data = await saveCourseMarkPolicy(req.user.id, req.valid.params.assignmentId, req.body);
  audit({
    req,
    action: 'teacher.course_mark_policy_saved',
    targetType: 'CourseOffering',
    targetId: req.valid.params.assignmentId,
    meta: { weights: data.policy?.weights, total: data.policy?.total },
  });
  res.json(data);
});

export const detail = asyncHandler(async (req, res) => {
  res.json(await courseMarksDetail(req.user.id, req.valid.params.assignmentId));
});

export const save = asyncHandler(async (req, res) => {
  const data = await saveCourseMarks(req.user.id, req.valid.params.assignmentId, req.body);
  audit({
    req,
    action: 'teacher.course_marks_saved',
    targetType: 'CourseOffering',
    targetId: req.valid.params.assignmentId,
    meta: { students: req.body.students.length },
  });
  res.json(data);
});

export const calculate = asyncHandler(async (req, res) => {
  const data = await calculateCourseMarks(req.user.id, req.valid.params.assignmentId);
  audit({
    req,
    action: 'teacher.course_marks_calculated',
    targetType: 'CourseOffering',
    targetId: req.valid.params.assignmentId,
    meta: { calculated: data.summary.calculated, missing: data.summary.missing },
  });
  res.json(data);
});

export const requestSubmitCode = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) throw new AppError(401, 'SESSION_ENDED', 'Please sign in again.');
  const sent = await sendCode(user, 'course_marks_submit');
  if (!sent) throw new AppError(429, 'WAIT_BEFORE_RESEND', resendWaitMessage);
  res.json({ message: `We emailed a 6-digit code to ${user.email}.`, email: user.email });
});

export const submit = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) throw new AppError(401, 'SESSION_ENDED', 'Please sign in again.');
  await checkCode(user._id, 'course_marks_submit', req.body.code);
  const data = await submitCourseMarks(req.user.id, req.body.offeringIds);
  audit({
    req,
    action: 'teacher.course_marks_submitted',
    targetType: 'course-marks',
    targetId: req.body.offeringIds.join(','),
    meta: { courses: data.courses.length, students: data.totalStudents },
  });
  res.status(201).json(data);
});

export const exportMarks = asyncHandler(async (req, res) => {
  const report = await exportCourseMarks(
    req.user.id,
    req.valid.params.assignmentId,
    req.valid.query.format,
  );
  audit({
    req,
    action: 'teacher.course_marks_exported',
    targetType: 'CourseOffering',
    targetId: req.valid.params.assignmentId,
    meta: { format: req.valid.query.format, rows: report.rowCount },
  });
  res.setHeader('Content-Type', report.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.setHeader('X-Export-Rows', String(report.rowCount));
  res.send(report.buffer);
});

