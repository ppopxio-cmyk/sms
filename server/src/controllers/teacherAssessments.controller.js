import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import {
  assessmentDetail,
  closeAssessment,
  createAssessment,
  gradebook,
  listAssessments,
  publishAssessment,
  saveGrades,
  submitAssessment,
  updateAssessment,
} from '../services/teacherAssessment.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await listAssessments(req.user.id, req.valid.query));
});

export const detail = asyncHandler(async (req, res) => {
  res.json(await assessmentDetail(req.user.id, req.valid.params.assessmentId));
});

export const create = asyncHandler(async (req, res) => {
  const data = await createAssessment(req.user.id, req.valid.params.assignmentId, req.body);
  audit({
    req,
    action: 'teacher.assessment_created',
    targetType: 'assessment',
    targetId: data.id,
    meta: { assignmentId: data.assignmentId, title: data.title },
  });
  res.status(201).json(data);
});

export const update = asyncHandler(async (req, res) => {
  const data = await updateAssessment(req.user.id, req.valid.params.assessmentId, req.body);
  audit({
    req,
    action: 'teacher.assessment_updated',
    targetType: 'assessment',
    targetId: data.id,
    meta: { assignmentId: data.assignmentId, title: data.title },
  });
  res.json(data);
});

export const publish = asyncHandler(async (req, res) => {
  const data = await publishAssessment(req.user.id, req.valid.params.assessmentId);
  audit({
    req,
    action: 'teacher.assessment_published',
    targetType: 'assessment',
    targetId: data.id,
    meta: { assignmentId: data.assignmentId, title: data.title },
  });
  res.json(data);
});

export const close = asyncHandler(async (req, res) => {
  const data = await closeAssessment(req.user.id, req.valid.params.assessmentId);
  audit({
    req,
    action: 'teacher.assessment_closed',
    targetType: 'assessment',
    targetId: data.id,
    meta: { assignmentId: data.assignmentId, title: data.title },
  });
  res.json(data);
});

export const grades = asyncHandler(async (req, res) => {
  res.json(await gradebook(req.user.id, req.valid.params.assessmentId, req.valid.query));
});

export const save = asyncHandler(async (req, res) => {
  const data = await saveGrades(req.user.id, req.valid.params.assessmentId, req.body);
  audit({
    req,
    action: 'teacher.grades_saved',
    targetType: 'assessment',
    targetId: req.valid.params.assessmentId,
    meta: { saved: data.saved, entered: data.entered, missing: data.missing },
  });
  res.json(data);
});

export const submit = asyncHandler(async (req, res) => {
  const data = await submitAssessment(req.user.id, req.valid.params.assessmentId);
  audit({
    req,
    action: 'teacher.grades_submitted',
    targetType: 'assessment',
    targetId: data.id,
    meta: { assignmentId: data.assignmentId, title: data.title, students: data.studentCount },
  });
  res.json(data);
});
