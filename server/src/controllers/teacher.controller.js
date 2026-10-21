import { asyncHandler } from '../utils/asyncHandler.js';
import { teacherDashboard } from '../services/teacherDashboard.service.js';
import { listTeacherAssignments, teacherAssignmentDetail } from '../services/teacherCourse.service.js';
import { listTeacherStudents, teacherStudentDetail } from '../services/teacherStudent.service.js';

export const dashboard = asyncHandler(async (req, res) => {
  res.json(await teacherDashboard(req.user.id));
});

export const listAssignments = asyncHandler(async (req, res) => {
  res.json(await listTeacherAssignments(req.user.id, req.valid.query));
});

export const assignmentDetail = asyncHandler(async (req, res) => {
  const data = await teacherAssignmentDetail(req.user.id, req.valid.params.assignmentId);
  if (!data) return res.status(404).json({ code: 'CLASS_NOT_FOUND', message: 'That class was not found in your workspace.' });
  return res.json(data);
});

export const listStudents = asyncHandler(async (req, res) => {
  res.json(await listTeacherStudents(req.user.id, req.valid.query));
});

export const studentDetail = asyncHandler(async (req, res) => {
  res.json(await teacherStudentDetail(req.user.id, req.valid.params.studentId));
});
