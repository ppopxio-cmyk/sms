import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { AssessmentSubmission } from '../models/AssessmentSubmission.js';
import { assessmentForTeacher } from '../services/teacherScope.service.js';
import { signedImageUrl } from '../services/imagekit.service.js';
import {
  configurePortal,
  listSubmissions,
  portalConfiguration,
  removePortalDocument,
  reviewSubmission,
  uploadPortalDocument,
} from '../services/assessmentPortal.service.js';
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

export const portal = asyncHandler(async (req, res) => {
  res.json(await portalConfiguration(req.user.id, req.valid.params.assessmentId));
});

export const updatePortal = asyncHandler(async (req, res) => {
  const data = await configurePortal(req.user.id, req.valid.params.assessmentId, req.body);
  audit({
    req,
    action: data.enabled ? 'teacher.assessment_portal_enabled' : 'teacher.assessment_portal_disabled',
    targetType: 'assessment',
    targetId: req.valid.params.assessmentId,
    meta: {
      enabled: data.enabled,
      status: data.status,
      codeRotated: Boolean(req.body.rotateCode),
      closesAt: data.closesAt,
    },
  });
  res.json(data);
});

export const uploadDocument = asyncHandler(async (req, res) => {
  const data = await uploadPortalDocument(
    req.user.id,
    req.valid.params.assessmentId,
    req.body,
    req.valid.query.filename,
  );
  audit({
    req,
    action: 'teacher.assessment_document_uploaded',
    targetType: 'assessment',
    targetId: req.valid.params.assessmentId,
    meta: { fileName: data.document?.fileName, bytes: data.document?.bytes },
  });
  res.status(201).json(data);
});

export const removeDocument = asyncHandler(async (req, res) => {
  const data = await removePortalDocument(req.user.id, req.valid.params.assessmentId);
  audit({
    req,
    action: 'teacher.assessment_document_removed',
    targetType: 'assessment',
    targetId: req.valid.params.assessmentId,
  });
  res.json(data);
});

export const submissions = asyncHandler(async (req, res) => {
  res.json(await listSubmissions(req.user.id, req.valid.params.assessmentId, req.valid.query));
});

export const reviewSubmissionController = asyncHandler(async (req, res) => {
  const data = await reviewSubmission(req.user.id, req.valid.params.submissionId, req.body);
  audit({
    req,
    action: 'teacher.assessment_submission_reviewed',
    targetType: 'AssessmentSubmission',
    targetId: req.valid.params.submissionId,
    meta: {
      status: data.submission.status,
      score: data.submission.score,
      studentNumber: data.submission.student?.studentNumber,
    },
  });
  res.json(data);
});

export const downloadSubmissionFile = asyncHandler(async (req, res) => {
  const submission = await AssessmentSubmission.findById(req.valid.params.submissionId).lean();
  if (!submission) throw new AppError(404, 'SUBMISSION_NOT_FOUND', 'That submission was not found.');
  await assessmentForTeacher(req.user.id, submission.assessment);
  const downloadUrl = signedImageUrl(submission.filePath, { expiresIn: 600 });
  if (!downloadUrl) throw new AppError(404, 'FILE_NOT_FOUND', 'Storage URL could not be resolved.');
  const attachmentUrl = `${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}ik-attachment=true`;
  return res.redirect(attachmentUrl);
});

export const downloadDocumentFile = asyncHandler(async (req, res) => {
  const { assessment } = await assessmentForTeacher(req.user.id, req.valid.params.assessmentId);
  if (!assessment.portalDocument?.filePath) {
    throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'No document has been attached to this assessment.');
  }
  const downloadUrl = signedImageUrl(assessment.portalDocument.filePath, { expiresIn: 600 });
  if (!downloadUrl) throw new AppError(404, 'FILE_NOT_FOUND', 'Storage URL could not be resolved.');
  const attachmentUrl = `${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}ik-attachment=true`;
  return res.redirect(attachmentUrl);
});
