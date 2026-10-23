import express, { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate.js';
import { requirePermission, requireRole } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { uploadLimiter, exportLimiter } from '../middleware/rateLimit.js';
import {
  idParamSchema,
  studentIdParamSchema,
  listStudentsQuerySchema,
  createStudentSchema,
  updateStudentSchema,
  studentDeleteSchema,
  studentProfileExportQuerySchema,
  departmentSchema,
  departmentUpdateSchema,
  programSchema,
  programUpdateSchema,
  academicYearSchema,
  academicTermSchema,
  calendarEventSchema,
  batchSchema,
  batchUpdateSchema,
  batchExportQuerySchema,
  batchDeleteSchema,
  batchAssignSchema,
  progressionSchema,
  curriculumPlanCreateSchema,
  curriculumPlanUpdateSchema,
  curriculumCourseSchema,
  curriculumCourseUpdateSchema,
  reorderCurriculumSchema,
  offeringCreateSchema,
  offeringUpdateSchema,
  listOfferingsQuerySchema,
  registrationEligibleQuerySchema,
  registrationCreateSchema,
  registrationDropSchema,
  listCourseResourcesQuerySchema,
  courseResourceUploadSchema,
  offeringCandidatesQuerySchema,
  offeringBulkRegistrationSchema,
  listRegistrationsQuerySchema,
  listResultsQuerySchema,
  resultDecisionSchema,
  resultCorrectionSchema,
  offeringIdParamSchema,
  resultSubmissionDecisionSchema,
  listAttendanceQuerySchema,
  gpaQuerySchema,
  graduationQuerySchema,
  transcriptCreateSchema,
  certificatePreviewSchema,
  certificateIssueSchema,
  revokeSchema,
  reissueSchema,
  registrarReportQuerySchema,
  noticeListSchema,
  registrarAnnouncementSchema,
  audiencePreviewSchema,
  listBatchesQuerySchema,
  analyticsQuerySchema,
  listPlansQuerySchema,
  planCourseParamSchema,
  listCertificatesQuerySchema,
  listTranscriptsQuerySchema,
  gradingPolicyUpdateSchema,
  gradingPolicyPreviewSchema,
} from '../validators/registrar.schemas.js';
import {
  listStudents, getStudent, createStudent, updateStudent, uploadStudentPhoto, removeStudentPhoto,
  requestStudentDeleteCode, deleteStudent, exportStudentProfile, studentOptions, studentSummary,
} from '../controllers/registrar.students.controller.js';
import {
  structure, createDepartment, updateDepartment, deleteDepartment, createProgram, updateProgram, deleteProgram,
  calendar, createAcademicYear, updateAcademicYear, createTerm, updateTerm,
  createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
  listBatches, listBatchGroups, requestBatchDeleteCode, deleteBatchGroup, getBatch, exportBatch, createBatch, updateBatch, batchAssignmentPreview, assignBatch, progressBatch,
  listPlans, planOptions, createPlan, getPlan, updatePlan, addPlanCourse, updatePlanCourse,
  removePlanCourse, reorderPlanCourses, publishPlan, archivePlan, clonePlan,
  listOfferings, offeringOptions, planOfferings, createOffering, updateOffering,
  registrationEligible, createRegistrations, offeringCandidates, registerOfferingStudents,
  listRegistrations, dropRegistration, programDetail,
} from '../controllers/registrar.academic.controller.js';
import {
  listCourseResources, uploadCourseResource, removeCourseResource,
} from '../controllers/registrar.courseResources.controller.js';
import {
  listAttendance, attendanceSummary, listResults, listResultSubmissions, getResult,
  reviewResult, approveResult, publishResult, rejectResult, correctResult,
  approveResultSubmission, declineResultSubmission, publishResultSubmission,
  gpaCgpa, listGraduation, evaluateGraduation, graduationStudent, resultOptions,
} from '../controllers/registrar.records.controller.js';
import {
  viewPolicy, updatePolicy as updateGradingPolicy, previewPolicy, policyHistory,
} from '../controllers/registrar.grading-policy.controller.js';
import {
  listCertificates, getCertificate, preview, issue, downloadCertificate, revokeCertificate,
  reissueCertificate, listTranscripts, createTranscript, downloadTranscript, revokeTranscript, certificateMeta,
} from '../controllers/registrar.documents.controller.js';
import { dashboard, analytics, search } from '../controllers/registrar.dashboard.controller.js';
import { reportOverview, exportReport } from '../controllers/registrar.reports.controller.js';
import {
  previewAudience, listNotices, getNotice, createNotice, updateNotice, publishNotice,
  archiveNotice, notificationSummary,
} from '../controllers/registrar.comms.controller.js';
import { env } from '../config/env.js';

const r = Router();

// Every route is behind authentication, the password-change gate, and the Registrar
// role. Individual permissions repeat the check so the permission map remains the
// source of truth and a future role cannot slip in through a single forgotten route.
r.use(authenticate, requirePasswordChanged, requireRole('REGISTRAR'));

r.get('/dashboard', requirePermission('registrar:dashboard'), dashboard);
r.get('/analytics', requirePermission('registrar:dashboard'), validate(analyticsQuerySchema, 'query'), analytics);
r.get('/search', requirePermission('registrar:search'), search);

// ---- Students ---------------------------------------------------------------
r.get('/students/options', requirePermission('students:view'), studentOptions);
r.get('/students/summary', requirePermission('students:view'), studentSummary);
r.get('/students', requirePermission('students:view'), validate(listStudentsQuerySchema, 'query'), listStudents);
r.post('/students', requirePermission('students:manage'), validate(createStudentSchema), createStudent);
r.get('/students/:studentId', requirePermission('students:view'), validate(studentIdParamSchema, 'params'), getStudent);
r.get(
  '/students/:studentId/export',
  exportLimiter,
  requirePermission('students:view'),
  validate(studentIdParamSchema, 'params'),
  validate(studentProfileExportQuerySchema, 'query'),
  exportStudentProfile,
);
r.patch('/students/:studentId', requirePermission('students:manage'), validate(studentIdParamSchema, 'params'), validate(updateStudentSchema), updateStudent);
r.post(
  '/students/:studentId/photo',
  uploadLimiter,
  requirePermission('students:photo'),
  validate(studentIdParamSchema, 'params'),
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: env.IMAGEKIT_PHOTO_MAX_BYTES }),
  uploadStudentPhoto,
);
r.delete('/students/:studentId/photo', requirePermission('students:photo'), validate(studentIdParamSchema, 'params'), removeStudentPhoto);
r.post('/students/:studentId/delete-code', requirePermission('students:manage'), validate(studentIdParamSchema, 'params'), requestStudentDeleteCode);
r.delete('/students/:studentId', requirePermission('students:manage'), validate(studentIdParamSchema, 'params'), validate(studentDeleteSchema), deleteStudent);

// ---- Academic structure and calendar ---------------------------------------
r.get('/academic-structure', requirePermission('structure:view'), structure);
r.get('/academic-structure/programs/:id', requirePermission('structure:view'), validate(idParamSchema, 'params'), programDetail);
r.post('/academic-structure/departments', requirePermission('structure:manage'), validate(departmentSchema), createDepartment);
r.patch('/academic-structure/departments/:id', requirePermission('structure:manage'), validate(idParamSchema, 'params'), validate(departmentUpdateSchema), updateDepartment);
r.delete('/academic-structure/departments/:id', requirePermission('structure:manage'), validate(idParamSchema, 'params'), deleteDepartment);
r.post('/academic-structure/programs', requirePermission('structure:manage'), validate(programSchema), createProgram);
r.patch('/academic-structure/programs/:id', requirePermission('structure:manage'), validate(idParamSchema, 'params'), validate(programUpdateSchema), updateProgram);
r.delete('/academic-structure/programs/:id', requirePermission('structure:manage'), validate(idParamSchema, 'params'), deleteProgram);
r.get('/academic-calendar', requirePermission('calendar:view'), calendar);
r.post('/academic-calendar/years', requirePermission('calendar:manage'), validate(academicYearSchema), createAcademicYear);
r.patch('/academic-calendar/years/:id', requirePermission('calendar:manage'), validate(idParamSchema, 'params'), validate(academicYearSchema.partial()), updateAcademicYear);
r.post('/academic-calendar/terms', requirePermission('calendar:manage'), validate(academicTermSchema), createTerm);
r.patch('/academic-calendar/terms/:id', requirePermission('calendar:manage'), validate(idParamSchema, 'params'), validate(academicTermSchema.partial()), updateTerm);
r.post('/academic-calendar/events', requirePermission('calendar:manage'), validate(calendarEventSchema), createCalendarEvent);
r.patch('/academic-calendar/events/:id', requirePermission('calendar:manage'), validate(idParamSchema, 'params'), validate(calendarEventSchema.partial()), updateCalendarEvent);
r.delete('/academic-calendar/events/:id', requirePermission('calendar:manage'), validate(idParamSchema, 'params'), deleteCalendarEvent);

// ---- Batches and progression ------------------------------------------------
r.get('/batches', requirePermission('batches:view'), validate(listBatchesQuerySchema, 'query'), listBatches);
r.get('/batches/groups', requirePermission('batches:view'), validate(listBatchesQuerySchema, 'query'), listBatchGroups);
r.post('/batches/groups/delete-code', requirePermission('batches:manage'), requestBatchDeleteCode);
r.post('/batches/groups/delete', requirePermission('batches:manage'), validate(batchDeleteSchema), deleteBatchGroup);
r.get('/batches/:id', requirePermission('batches:view'), validate(idParamSchema, 'params'), getBatch);
r.get(
  '/batches/:id/export',
  exportLimiter,
  requirePermission('batches:view'),
  validate(idParamSchema, 'params'),
  validate(batchExportQuerySchema, 'query'),
  exportBatch,
);
r.post('/batches', requirePermission('batches:manage'), validate(batchSchema), createBatch);
r.patch('/batches/:id', requirePermission('batches:manage'), validate(idParamSchema, 'params'), validate(batchUpdateSchema), updateBatch);
r.post('/batches/:id/assignment-preview', requirePermission('batches:manage'), validate(idParamSchema, 'params'), validate(batchAssignSchema), batchAssignmentPreview);
r.post('/batches/:id/assign', requirePermission('batches:manage'), validate(idParamSchema, 'params'), validate(batchAssignSchema), assignBatch);
r.post('/batches/:id/progress', requirePermission('batches:manage'), validate(idParamSchema, 'params'), validate(progressionSchema), progressBatch);

// ---- Curriculum -------------------------------------------------------------
r.get('/curriculum/options', requirePermission('curriculum:view'), planOptions);
r.get('/curriculum', requirePermission('curriculum:view'), validate(listPlansQuerySchema, 'query'), listPlans);
r.post('/curriculum', requirePermission('curriculum:manage'), validate(curriculumPlanCreateSchema), createPlan);
r.get('/curriculum/:id', requirePermission('curriculum:view'), validate(idParamSchema, 'params'), getPlan);
r.patch('/curriculum/:id', requirePermission('curriculum:manage'), validate(idParamSchema, 'params'), validate(curriculumPlanUpdateSchema), updatePlan);
r.post('/curriculum/:id/courses', requirePermission('curriculum:manage'), validate(idParamSchema, 'params'), validate(curriculumCourseSchema), addPlanCourse);
r.patch('/curriculum/:id/courses/:courseId', requirePermission('curriculum:manage'), validate(planCourseParamSchema, 'params'), validate(curriculumCourseUpdateSchema), updatePlanCourse);
r.delete('/curriculum/:id/courses/:courseId', requirePermission('curriculum:manage'), validate(planCourseParamSchema, 'params'), removePlanCourse);
r.post('/curriculum/:id/reorder', requirePermission('curriculum:manage'), validate(idParamSchema, 'params'), validate(reorderCurriculumSchema), reorderPlanCourses);
r.post('/curriculum/:id/publish', requirePermission('curriculum:publish'), validate(idParamSchema, 'params'), publishPlan);
r.post('/curriculum/:id/archive', requirePermission('curriculum:manage'), validate(idParamSchema, 'params'), archivePlan);
r.post('/curriculum/:id/clone', requirePermission('curriculum:manage'), validate(idParamSchema, 'params'), clonePlan);

// ---- Course offerings -------------------------------------------------------
r.get('/offerings/options', requirePermission('offerings:view'), offeringOptions);
r.get('/offerings', requirePermission('offerings:view'), validate(listOfferingsQuerySchema, 'query'), listOfferings);
r.get('/curriculum/:id/offerings', requirePermission('offerings:view'), validate(idParamSchema, 'params'), planOfferings);
r.post('/offerings', requirePermission('offerings:manage'), validate(offeringCreateSchema), createOffering);
r.patch('/offerings/:id', requirePermission('offerings:manage'), validate(idParamSchema, 'params'), validate(offeringUpdateSchema), updateOffering);

// ---- Registration -----------------------------------------------------------
r.get('/course-registration/eligible', requirePermission('registration:view'), validate(registrationEligibleQuerySchema, 'query'), registrationEligible);
r.get(
  '/course-registration/offerings/:offering',
  requirePermission('registration:view'),
  validate(offeringIdParamSchema, 'params'),
  validate(offeringCandidatesQuerySchema, 'query'),
  offeringCandidates,
);
r.post(
  '/course-registration/offerings/:offering',
  requirePermission('registration:manage'),
  validate(offeringIdParamSchema, 'params'),
  validate(offeringBulkRegistrationSchema),
  registerOfferingStudents,
);
r.get('/course-registration', requirePermission('registration:view'), validate(listRegistrationsQuerySchema, 'query'), listRegistrations);
r.post('/course-registration', requirePermission('registration:manage'), validate(registrationCreateSchema), createRegistrations);
r.patch('/course-registration/:id/drop', requirePermission('registration:manage'), validate(idParamSchema, 'params'), validate(registrationDropSchema), dropRegistration);
r.get(
  '/course-registration/resources',
  requirePermission('registration:view'),
  validate(listCourseResourcesQuerySchema, 'query'),
  listCourseResources,
);
r.post(
  '/course-registration/resources',
  uploadLimiter,
  requirePermission('registration:manage'),
  validate(courseResourceUploadSchema, 'query'),
  express.raw({
    type: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
    ],
    limit: '10mb',
  }),
  uploadCourseResource,
);
r.delete(
  '/course-registration/resources/:id',
  requirePermission('registration:manage'),
  validate(idParamSchema, 'params'),
  removeCourseResource,
);

// ---- Attendance (read-only for the Registrar) -------------------------------
r.get('/attendance/summary', requirePermission('attendance:view'), validate(listAttendanceQuerySchema, 'query'), attendanceSummary);
r.get('/attendance', requirePermission('attendance:view'), validate(listAttendanceQuerySchema, 'query'), listAttendance);

// ---- Results review ---------------------------------------------------------
r.get('/results/options', requirePermission('results:view'), resultOptions);
r.get('/results/submissions', requirePermission('results:view'), validate(listResultsQuerySchema, 'query'), listResultSubmissions);
r.post('/results/submissions/:offering/approve', requirePermission('results:review'), validate(offeringIdParamSchema, 'params'), approveResultSubmission);
r.post('/results/submissions/:offering/decline', requirePermission('results:review'), validate(offeringIdParamSchema, 'params'), validate(resultSubmissionDecisionSchema), declineResultSubmission);
r.post('/results/submissions/:offering/publish', requirePermission('results:publish'), validate(offeringIdParamSchema, 'params'), publishResultSubmission);
r.get('/results', requirePermission('results:view'), validate(listResultsQuerySchema, 'query'), listResults);
r.get('/results/:id', requirePermission('results:view'), validate(idParamSchema, 'params'), getResult);
r.post('/results/:id/review', requirePermission('results:review'), validate(idParamSchema, 'params'), reviewResult);
r.post('/results/:id/approve', requirePermission('results:review'), validate(idParamSchema, 'params'), approveResult);
r.post('/results/:id/reject', requirePermission('results:review'), validate(idParamSchema, 'params'), validate(resultDecisionSchema), rejectResult);
r.post('/results/:id/publish', requirePermission('results:publish'), validate(idParamSchema, 'params'), publishResult);
r.patch('/results/:id/correct', requirePermission('results:review'), validate(idParamSchema, 'params'), validate(resultCorrectionSchema), correctResult);

// ---- GPA / CGPA -------------------------------------------------------------
r.get('/gpa-cgpa', requirePermission('gpa:view'), validate(gpaQuerySchema, 'query'), gpaCgpa);

// ---- Grading Policy ---------------------------------------------------------
r.get('/grading-policy', requirePermission('grading_policy:view'), viewPolicy);
r.patch('/grading-policy', requirePermission('grading_policy:manage'), validate(gradingPolicyUpdateSchema), updateGradingPolicy);
r.post('/grading-policy/preview', requirePermission('grading_policy:view'), validate(gradingPolicyPreviewSchema), previewPolicy);
r.get('/grading-policy/history', requirePermission('grading_policy:view'), policyHistory);

// ---- Graduation -------------------------------------------------------------
r.get('/graduation-eligibility', requirePermission('graduation:view'), validate(graduationQuerySchema, 'query'), listGraduation);
r.get('/graduation-eligibility/:studentId', requirePermission('graduation:view'), validate(studentIdParamSchema, 'params'), graduationStudent);
r.post('/graduation-eligibility/:studentId/evaluate', requirePermission('graduation:evaluate'), validate(studentIdParamSchema, 'params'), evaluateGraduation);

// ---- Transcripts ------------------------------------------------------------
r.get('/transcripts', requirePermission('transcripts:view'), validate(listTranscriptsQuerySchema, 'query'), listTranscripts);
r.post('/transcripts', requirePermission('transcripts:issue'), validate(transcriptCreateSchema), createTranscript);
r.get('/transcripts/:id/pdf', requirePermission('transcripts:view'), validate(idParamSchema, 'params'), downloadTranscript);
r.post('/transcripts/:id/revoke', requirePermission('transcripts:revoke'), validate(idParamSchema, 'params'), validate(revokeSchema), revokeTranscript);

// ---- Certificates -----------------------------------------------------------
r.get('/certificates/meta', requirePermission('certificates:view'), certificateMeta);
r.get('/certificates', requirePermission('certificates:view'), validate(listCertificatesQuerySchema, 'query'), listCertificates);
r.post('/certificates/preview', requirePermission('certificates:view'), validate(certificatePreviewSchema), preview);
r.get('/certificates/:id', requirePermission('certificates:view'), validate(idParamSchema, 'params'), getCertificate);
r.post('/certificates/issue', requirePermission('certificates:issue'), validate(certificateIssueSchema), issue);
r.get('/certificates/:id/pdf', requirePermission('certificates:view'), validate(idParamSchema, 'params'), downloadCertificate);
r.post('/certificates/:id/revoke', requirePermission('certificates:revoke'), validate(idParamSchema, 'params'), validate(revokeSchema), revokeCertificate);
r.post('/certificates/:id/reissue', requirePermission('certificates:issue'), validate(idParamSchema, 'params'), validate(reissueSchema), reissueCertificate);

// ---- Reports ----------------------------------------------------------------
r.get('/reports/overview', requirePermission('reports:view'), reportOverview);
r.get('/reports/export', exportLimiter, requirePermission('reports:export'), validate(registrarReportQuerySchema, 'query'), exportReport);

// ---- Registrar announcements and notifications ------------------------------
r.post('/announcements/audience', requirePermission('registrar:announcements'), validate(audiencePreviewSchema), previewAudience);
r.get('/announcements', requirePermission('registrar:announcements'), validate(noticeListSchema, 'query'), listNotices);
r.post('/announcements', requirePermission('registrar:announcements'), validate(registrarAnnouncementSchema), createNotice);
r.get('/announcements/:id', requirePermission('registrar:announcements'), validate(idParamSchema, 'params'), getNotice);
r.patch('/announcements/:id', requirePermission('registrar:announcements'), validate(idParamSchema, 'params'), validate(registrarAnnouncementSchema), updateNotice);
r.post('/announcements/:id/publish', requirePermission('registrar:announcements'), validate(idParamSchema, 'params'), publishNotice);
r.post('/announcements/:id/archive', requirePermission('registrar:announcements'), validate(idParamSchema, 'params'), archiveNotice);
r.get('/notifications/summary', requirePermission('registrar:notifications'), notificationSummary);
r.get('/notifications', requirePermission('registrar:notifications'), validate(noticeListSchema, 'query'), listNotices);

export default r;
