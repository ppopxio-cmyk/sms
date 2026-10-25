import express, { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate.js';
import { requirePermission, requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { exportLimiter, uploadLimiter } from '../middleware/rateLimit.js';
import {
  assessmentParamSchema,
  assessmentPortalDocumentQuerySchema,
  assessmentPortalSchema,
  assessmentSubmissionParamSchema,
  assignmentParamSchema,
  attendanceOverviewQuerySchema,
  attendanceReportQuerySchema,
  attendanceRosterQuerySchema,
  competencyReportQuerySchema,
  courseMarkPolicySchema,
  courseMarksExportQuerySchema,
  createAssessmentSchema,
  createMaterialSchema,
  finalizeAttendanceSchema,
  finalizeAttendanceParamSchema,
  gradeSheetQuerySchema,
  gradesQuerySchema,
  listAssessmentsQuerySchema,
  listAssessmentSubmissionsQuerySchema,
  listAssignmentsQuerySchema,
  listCourseMarksQuerySchema,
  listCourseResourcesQuerySchema,
  listMaterialsQuerySchema,
  listStudentsQuerySchema,
  materialParamSchema,
  reportOptionsQuerySchema,
  reviewAssessmentSubmissionSchema,
  rosterReportQuerySchema,
  saveAttendanceSchema,
  saveCourseMarksSchema,
  saveGradesSchema,
  studentParamSchema,
  submitCourseMarksSchema,
  updateAssessmentSchema,
  updateMaterialSchema,
} from '../validators/teacher.schemas.js';
import {
  assignmentDetail,
  dashboard,
  listAssignments,
  listStudents,
  programs,
  studentDetail,
} from '../controllers/teacher.controller.js';
import {
  finalize,
  history as attendanceHistoryController,
  overview as attendanceOverviewController,
  roster as attendanceRosterController,
  save as saveAttendanceController,
} from '../controllers/teacherAttendance.controller.js';
import {
  close,
  create as createAssessment,
  detail as assessmentDetail,
  downloadDocumentFile,
  downloadSubmissionFile,
  grades,
  list as listAssessments,
  portal,
  publish,
  removeDocument,
  reviewSubmissionController,
  save as saveGradesController,
  submissions,
  submit,
  update as updateAssessment,
  updatePortal,
  uploadDocument,
} from '../controllers/teacherAssessments.controller.js';
import {
  create as createMaterial,
  list as listMaterials,
  remove as removeMaterial,
  sharedResources,
  teacherCurriculum,
  update as updateMaterial,
} from '../controllers/teacherMaterials.controller.js';
import {
  attendanceSummary,
  competency,
  exportReport,
  gradeDistribution,
  gradeSheet,
  options as reportOptions,
  performance,
  roster as reportRoster,
} from '../controllers/teacherReports.controller.js';
import {
  calculate as calculateCourseMarksController,
  courses as courseMarkCourses,
  detail as courseMarksDetailController,
  exportMarks as exportCourseMarksController,
  policy as courseMarkPolicyController,
  save as saveCourseMarksController,
  savePolicy as saveCourseMarkPolicyController,
  submit as submitCourseMarksController,
  requestSubmitCode as requestCourseMarksCode,
} from '../controllers/teacherCourseMarks.controller.js';

const r = Router();

// A teacher's workspace is closed to every other role before any handler runs. Each
// route repeats its permission so the permission map stays the source of truth.
r.use(authenticate, requirePasswordChanged, requireRole('TEACHER'));

r.get('/programs', requirePermission('teacher:dashboard'), programs);
r.get('/dashboard', requirePermission('teacher:dashboard'), dashboard);

r.get('/courses', requirePermission('teacher:courses:read'), validate(listAssignmentsQuerySchema, 'query'), listAssignments);
r.get(
  '/courses/:assignmentId',
  requirePermission('teacher:courses:read'),
  validate(assignmentParamSchema, 'params'),
  assignmentDetail,
);
r.get(
  '/courses/:assignmentId/attendance',
  requirePermission('teacher:attendance:manage'),
  validate(assignmentParamSchema, 'params'),
  validate(attendanceRosterQuerySchema, 'query'),
  attendanceRosterController,
);
r.put(
  '/courses/:assignmentId/attendance',
  requirePermission('teacher:attendance:manage'),
  validate(assignmentParamSchema, 'params'),
  validate(saveAttendanceSchema),
  saveAttendanceController,
);
r.post(
  '/courses/:assignmentId/attendance/:attendanceId/finalize',
  requirePermission('teacher:attendance:manage'),
  validate(finalizeAttendanceParamSchema, 'params'),
  validate(finalizeAttendanceSchema),
  finalize,
);

r.get('/students', requirePermission('teacher:students:read'), validate(listStudentsQuerySchema, 'query'), listStudents);
r.get(
  '/students/:studentId',
  requirePermission('teacher:students:read'),
  validate(studentParamSchema, 'params'),
  studentDetail,
);

r.get('/attendance', requirePermission('teacher:attendance:manage'), validate(attendanceOverviewQuerySchema, 'query'), attendanceOverviewController);
r.get('/attendance/:assignmentId/history', requirePermission('teacher:attendance:manage'), validate(attendanceOverviewQuerySchema, 'query'), attendanceHistoryController);

r.get('/assessments', requirePermission('teacher:assessments:manage'), validate(listAssessmentsQuerySchema, 'query'), listAssessments);
r.post(
  '/courses/:assignmentId/assessments',
  requirePermission('teacher:assessments:manage'),
  validate(assignmentParamSchema, 'params'),
  validate(createAssessmentSchema),
  createAssessment,
);
r.get(
  '/assessments/:assessmentId',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  assessmentDetail,
);
r.get(
  '/assessments/:assessmentId/portal',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  portal,
);
r.put(
  '/assessments/:assessmentId/portal',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  validate(assessmentPortalSchema),
  updatePortal,
);
r.post(
  '/assessments/:assessmentId/portal/document',
  uploadLimiter,
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  validate(assessmentPortalDocumentQuerySchema, 'query'),
  express.raw({
    type: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
    ],
    limit: '30mb',
  }),
  uploadDocument,
);
r.get(
  '/assessments/:assessmentId/portal/document/download',
  requirePermission('teacher:assessments:view'),
  validate(assessmentParamSchema, 'params'),
  downloadDocumentFile,
);
r.delete(
  '/assessments/:assessmentId/portal/document',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  removeDocument,
);
r.get(
  '/assessments/:assessmentId/submissions',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  validate(listAssessmentSubmissionsQuerySchema, 'query'),
  submissions,
);
r.get(
  '/assessment-submissions/:submissionId/download',
  requirePermission('teacher:assessments:view'),
  validate(assessmentSubmissionParamSchema, 'params'),
  downloadSubmissionFile,
);
r.patch(
  '/assessment-submissions/:submissionId',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentSubmissionParamSchema, 'params'),
  validate(reviewAssessmentSubmissionSchema),
  reviewSubmissionController,
);
r.patch(
  '/assessments/:assessmentId',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  validate(updateAssessmentSchema),
  updateAssessment,
);
r.post(
  '/assessments/:assessmentId/publish',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  publish,
);
r.post(
  '/assessments/:assessmentId/close',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  close,
);
r.get(
  '/assessments/:assessmentId/grades',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  validate(gradesQuerySchema, 'query'),
  grades,
);
r.put(
  '/assessments/:assessmentId/grades',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  validate(saveGradesSchema),
  saveGradesController,
);
r.post(
  '/assessments/:assessmentId/submit',
  requirePermission('teacher:assessments:manage'),
  validate(assessmentParamSchema, 'params'),
  submit,
);

r.get('/materials', requirePermission('teacher:materials:manage'), validate(listMaterialsQuerySchema, 'query'), listMaterials);
r.post('/materials', requirePermission('teacher:materials:manage'), validate(createMaterialSchema), createMaterial);
r.put(
  '/materials/:materialId',
  requirePermission('teacher:materials:manage'),
  validate(materialParamSchema, 'params'),
  validate(updateMaterialSchema),
  updateMaterial,
);
r.delete(
  '/materials/:materialId',
  requirePermission('teacher:materials:manage'),
  validate(materialParamSchema, 'params'),
  removeMaterial,
);
r.get(
  '/materials/course-resources',
  requirePermission('teacher:materials:manage'),
  validate(listCourseResourcesQuerySchema, 'query'),
  sharedResources,
);
r.get(
  '/materials/curriculum',
  requirePermission('teacher:materials:manage'),
  teacherCurriculum,
);

r.get(
  '/course-marks',
  requirePermission('teacher:assessments:manage'),
  validate(listCourseMarksQuerySchema, 'query'),
  courseMarkCourses,
);
r.post(
  '/course-marks/submit-code',
  requirePermission('teacher:assessments:manage'),
  requestCourseMarksCode,
);
r.post(
  '/course-marks/submit',
  requirePermission('teacher:assessments:manage'),
  validate(submitCourseMarksSchema),
  submitCourseMarksController,
);
r.get(
  '/courses/:assignmentId/mark-policy',
  requirePermission('teacher:assessments:manage'),
  validate(assignmentParamSchema, 'params'),
  courseMarkPolicyController,
);
r.put(
  '/courses/:assignmentId/mark-policy',
  requirePermission('teacher:assessments:manage'),
  validate(assignmentParamSchema, 'params'),
  validate(courseMarkPolicySchema),
  saveCourseMarkPolicyController,
);
r.get(
  '/courses/:assignmentId/marks',
  requirePermission('teacher:assessments:manage'),
  validate(assignmentParamSchema, 'params'),
  courseMarksDetailController,
);
r.put(
  '/courses/:assignmentId/marks',
  requirePermission('teacher:assessments:manage'),
  validate(assignmentParamSchema, 'params'),
  validate(saveCourseMarksSchema),
  saveCourseMarksController,
);
r.post(
  '/courses/:assignmentId/marks/calculate',
  requirePermission('teacher:assessments:manage'),
  validate(assignmentParamSchema, 'params'),
  calculateCourseMarksController,
);
r.get(
  '/courses/:assignmentId/marks/export',
  exportLimiter,
  requirePermission('teacher:assessments:manage'),
  validate(assignmentParamSchema, 'params'),
  validate(courseMarksExportQuerySchema, 'query'),
  exportCourseMarksController,
);

r.get('/reports/options', requirePermission('teacher:reports:read'), validate(reportOptionsQuerySchema, 'query'), reportOptions);
r.get(
  '/reports/grade-sheet/export',
  exportLimiter,
  requirePermission('teacher:reports:read'),
  validate(gradeSheetQuerySchema, 'query'),
  exportReport('grades'),
);
r.get(
  '/reports/grade-sheet',
  requirePermission('teacher:reports:read'),
  validate(gradeSheetQuerySchema, 'query'),
  gradeSheet,
);
r.get(
  '/reports/attendance/export',
  exportLimiter,
  requirePermission('teacher:reports:read'),
  validate(attendanceReportQuerySchema, 'query'),
  exportReport('attendance'),
);
r.get(
  '/reports/attendance',
  requirePermission('teacher:reports:read'),
  validate(attendanceReportQuerySchema, 'query'),
  attendanceSummary,
);
r.get(
  '/reports/roster/export',
  exportLimiter,
  requirePermission('teacher:reports:read'),
  validate(rosterReportQuerySchema, 'query'),
  exportReport('roster'),
);
r.get(
  '/reports/roster',
  requirePermission('teacher:reports:read'),
  validate(rosterReportQuerySchema, 'query'),
  reportRoster,
);
r.get(
  '/reports/competency',
  requirePermission('teacher:reports:read'),
  validate(competencyReportQuerySchema, 'query'),
  competency,
);
r.get(
  '/reports/performance',
  requirePermission('teacher:reports:read'),
  validate(reportOptionsQuerySchema, 'query'),
  performance,
);
r.get(
  '/reports/performance/export',
  exportLimiter,
  requirePermission('teacher:reports:read'),
  validate(reportOptionsQuerySchema, 'query'),
  exportReport('performance'),
);
r.get(
  '/reports/grade-distribution',
  requirePermission('teacher:reports:read'),
  validate(reportOptionsQuerySchema, 'query'),
  gradeDistribution,
);
r.get(
  '/reports/grade-distribution/export',
  exportLimiter,
  requirePermission('teacher:reports:read'),
  validate(reportOptionsQuerySchema, 'query'),
  exportReport('grade-dist'),
);

export default r;


