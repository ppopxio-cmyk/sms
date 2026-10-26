import { asyncHandler } from '../utils/asyncHandler.js';
import { teacherDashboard } from '../services/teacherDashboard.service.js';
import { listTeacherAssignments, teacherAssignmentDetail } from '../services/teacherCourse.service.js';
import { listTeacherStudents, teacherStudentDetail } from '../services/teacherStudent.service.js';
import { activeProgramsForTeacher } from '../services/teacherAccess.service.js';
import { Batch } from '../models/AcademicStructure.js';
import { ownFilter } from '../services/registrar.helpers.js';

export const programs = asyncHandler(async (req, res) => {
  const rows = await activeProgramsForTeacher(req.user.id);
  const progIds = rows.map((r) => r._id);
  const batches = progIds.length
    ? await Batch.find(ownFilter({ program: { $in: progIds } })).sort({ code: 1, category: 1 }).lean()
    : [];

  res.json({
    programs: rows.map((row) => ({
      id: String(row._id),
      code: row.code,
      name: row.name,
      qualificationType: row.qualificationType,
      department: row.department
        ? { id: String(row.department._id), code: row.department.code, name: row.department.name }
        : null,
    })),
    batches: batches.map((b) => ({
      id: String(b._id),
      code: b.code,
      name: b.name,
      category: b.category || 'regular',
      program: String(b.program),
      status: b.status,
    })),
  });
});

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
