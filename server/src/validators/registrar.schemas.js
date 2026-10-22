import { z } from 'zod';
import { normalizePhone, isValidEthiopianPhone } from '../utils/phone.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
const text = (max = 200) => z.string().trim().max(max);
const optionalText = (max = 200) => text(max).optional().default('');
const date = z.coerce.date();

export const idParamSchema = z.object({ id: objectId });
export const studentIdParamSchema = z.object({ studentId: objectId });

// Ethiopian mobile numbers are stored in the international form (+251 9XX XXX XXX).
// The normaliser runs before validation so the error message can speak to the value
// the registrar actually typed.
const ethiopianPhone = z
  .string()
  .trim()
  .min(1, 'Phone number is required.')
  .superRefine((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized || !isValidEthiopianPhone(normalized)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter a valid Ethiopian mobile number, e.g. +251 912 345 678.',
      });
    }
    return normalized;
  })
  .transform((value) => normalizePhone(value));

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: text(120).optional().default(''),
  sort: text(40).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const listStudentsQuerySchema = paginationSchema.extend({
  status: z.enum(['all', 'active', 'pending', 'graduated', 'withdrawn', 'suspended', 'archived']).optional().default('all'),
  program: objectId.optional(),
  department: objectId.optional(),
  batch: objectId.optional(),
  level: z.coerce.number().int().min(1).max(20).optional(),
  qualificationType: z.enum(['degree', 'diploma', 'short-term']).optional(),
  category: z.enum(['regular', 'extension']).optional(),
});

export const createStudentSchema = z.object({
  // The Registrar no longer types a number: the server derives it from the programme,
  // batch and regular/extension stream when the admission is recorded.
  studentId: text(40).min(2).optional(),
  firstName: text(80).min(1),
  middleName: optionalText(80),
  lastName: text(80).min(1),
  sex: z.enum(['female', 'male']),
  dateOfBirth: date.nullish(),
  email: z.email('Enter a valid email address.').transform((value) => value.trim().toLowerCase()),
  phone: ethiopianPhone,
  address: z
    .object({
      city: optionalText(80),
      woreda: optionalText(80),
    })
    .optional()
    .default({}),
  department: objectId,
  program: objectId,
  batch: objectId.nullish(),
  admissionAcademicYear: objectId.nullish(),
  level: z.coerce.number().int().min(1).max(20).optional().default(1),
  enrollmentStatus: z.enum(['pending', 'active', 'completed', 'withdrawn', 'cancelled']).optional().default('active'),
  studentStatus: z.enum(['active', 'suspended', 'graduated', 'withdrawn', 'archived']).optional().default('active'),
  studentCategory: z.enum(['regular', 'extension']).optional().default('regular'),
  admissionDate: date.nullish(),
});

export const updateStudentSchema = createStudentSchema.partial().omit({ studentId: true });

export const studentDeleteSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code sent to your email.'),
});

export const studentProfileExportQuerySchema = z.object({
  format: z.enum(['docx', 'pdf']).optional().default('pdf'),
});

export const departmentSchema = z.object({
  code: text(20).min(1),
  name: text(120).min(1),
  description: optionalText(1000),
});

export const departmentUpdateSchema = departmentSchema.partial();

const shortTermSchema = z.object({
  duration: z.coerce.number().int().min(1).max(520),
  unit: z.enum(['weeks', 'months']).default('weeks'),
});

const programFields = z.object({
  code: text(20).min(1),
  name: text(160).min(1),
  department: objectId,
  qualificationType: z.enum(['degree', 'diploma', 'short-term']),
  categories: z.array(z.enum(['regular', 'extension'])).min(1).optional(),
  durationYears: z.coerce.number().int().min(1).max(10).nullish(),
  levels: z.array(z.coerce.number().int().min(1).max(4)).max(4).optional(),
  shortTerm: shortTermSchema.nullish(),
  capacity: z.coerce.number().int().min(1).max(10000).nullish(),
  teachers: z.array(objectId).max(100).optional(),
  description: optionalText(1000),
  active: z.boolean().optional(),
});

export const programSchema = programFields.superRefine((value, ctx) => {
  if (value.qualificationType === 'degree' && !value.durationYears) {
    ctx.addIssue({ code: 'custom', path: ['durationYears'], message: 'A degree programme needs a duration in years.' });
  }
  if (value.qualificationType === 'diploma') {
    const levels = value.levels?.length ? value.levels : [1, 2, 3, 4];
    if (levels.some((level) => level < 1 || level > 4)) {
      ctx.addIssue({ code: 'custom', path: ['levels'], message: 'Diploma levels must be between 1 and 4.' });
    }
  }
  if (value.qualificationType === 'short-term' && !value.shortTerm?.duration) {
    ctx.addIssue({
      code: 'custom',
      path: ['shortTerm', 'duration'],
      message: 'A short-term programme needs a duration in weeks or months.',
    });
  }
});

export const programUpdateSchema = programFields.partial();

export const academicYearSchema = z.object({
  label: text(40).min(2),
  startDate: date,
  endDate: date,
  isCurrent: z.boolean().optional().default(false),
  status: z.enum(['planned', 'active', 'closed']).optional().default('planned'),
});

export const academicTermSchema = z.object({
  academicYear: objectId,
  name: text(60).min(1),
  sequence: z.coerce.number().int().min(1).max(20),
  type: z.enum(['semester', 'term', 'session']).optional().default('semester'),
  startDate: date,
  endDate: date,
});

export const calendarEventSchema = z.object({
  academicYear: objectId,
  term: objectId.nullish(),
  type: z.enum(['registration', 'exam', 'important', 'holiday']),
  title: text(160).min(1),
  startDate: date,
  endDate: date,
  notes: optionalText(1000),
});

export const batchSchema = z.object({
  code: text(30).min(1),
  name: text(120).min(1),
  department: objectId.optional(),
  program: objectId.optional(),
  programs: z.array(objectId).min(1).max(50).optional(),
  category: z.enum(['regular', 'extension']).optional().default('regular'),
  admissionAcademicYear: objectId,
  durationYears: z.coerce.number().int().min(1).max(5).nullish(),
  expectedCompletionYear: z.coerce.number().int().min(2000).max(2300).nullish(),
  currentLevel: z.coerce.number().int().min(1).max(20).optional().default(1),
  status: z.enum(['planned', 'active', 'completed', 'archived']).optional().default('planned'),
});

export const batchUpdateSchema = z.object({
  code: text(30).min(1).optional(),
  name: text(120).min(1).optional(),
  department: objectId.optional(),
  program: objectId.optional(),
  programs: z.array(objectId).min(1).max(50).optional(),
  category: z.enum(['regular', 'extension']).optional(),
  admissionAcademicYear: objectId.optional(),
  durationYears: z.coerce.number().int().min(1).max(5).nullish(),
  expectedCompletionYear: z.coerce.number().int().min(2000).max(2300).nullish(),
  currentLevel: z.coerce.number().int().min(1).max(20).optional(),
  status: z.enum(['planned', 'active', 'completed', 'archived']).optional(),
});

export const batchExportQuerySchema = z.object({
  format: z.enum(['docx', 'pdf']).optional().default('pdf'),
});

export const batchAssignSchema = z.object({
  studentIds: z.array(objectId).min(1).max(500),
  level: z.coerce.number().int().min(1).max(20).optional(),
});

export const progressionSchema = z.object({
  studentIds: z.array(objectId).min(1).max(500),
  toLevel: z.coerce.number().int().min(1).max(20).optional(),
  complete: z.boolean().optional().default(false),
  effectiveDate: date.optional(),
  reason: optionalText(500),
});

export const curriculumPlanCreateSchema = z.object({
  program: objectId,
  academicYear: objectId,
  title: optionalText(160),
  notes: optionalText(2000),
  cloneFrom: objectId.nullish(),
});

export const curriculumPlanUpdateSchema = z.object({
  title: optionalText(160),
  notes: optionalText(2000),
});

export const curriculumCourseSchema = z.object({
  course: objectId,
  term: optionalText(60),
  level: z.coerce.number().int().min(1).max(20),
  creditHours: z.coerce.number().min(0.5).max(30),
  category: z.enum(['required', 'elective']).optional().default('required'),
  prerequisites: z.array(objectId).max(20).optional().default([]),
  order: z.coerce.number().int().min(0).max(10000).optional().default(0),
});

export const curriculumCourseUpdateSchema = curriculumCourseSchema.partial().omit({ course: true });

export const reorderCurriculumSchema = z.object({
  items: z.array(z.object({ id: objectId, order: z.coerce.number().int().min(0).max(10000) })).min(1).max(500),
});

export const offeringCreateSchema = z.object({
  curriculumCourse: objectId,
  teacher: objectId.nullish(),
  capacity: z.coerce.number().int().min(1).max(500).optional().default(60),
  schedule: optionalText(300),
  status: z.enum(['draft', 'open', 'in_progress', 'completed', 'cancelled']).optional().default('draft'),
});

export const offeringUpdateSchema = z.object({
  teacher: objectId.nullish(),
  capacity: z.coerce.number().int().min(1).max(500).optional(),
  schedule: optionalText(300),
  status: z.enum(['draft', 'open', 'in_progress', 'completed', 'cancelled']).optional(),
});

export const listOfferingsQuerySchema = paginationSchema.extend({
  academicYear: objectId.optional(),
  term: text(60).optional(),
  program: objectId.optional(),
  level: z.coerce.number().int().min(1).max(20).optional(),
  status: z.enum(['all', 'draft', 'open', 'in_progress', 'completed', 'cancelled']).optional().default('all'),
});

export const registrationEligibleSchema = z.object({
  student: objectId,
  academicYear: objectId,
  term: text(60).min(1),
});

export const registrationCreateSchema = z.object({
  student: objectId,
  offeringIds: z.array(objectId).min(1).max(30),
});

export const registrationDropSchema = z.object({
  reason: optionalText(500),
});

export const offeringCandidatesQuerySchema = paginationSchema.extend({
  category: z.enum(['regular', 'extension']).optional(),
  batch: objectId.optional(),
});

export const offeringBulkRegistrationSchema = z.object({
  studentIds: z.array(objectId).min(1).max(500),
});

export const listRegistrationsQuerySchema = paginationSchema.extend({
  academicYear: objectId.optional(),
  term: text(60).optional(),
  student: objectId.optional(),
  status: z.enum(['all', 'registered', 'dropped', 'withdrawn', 'completed', 'cancelled']).optional().default('all'),
});

export const listCourseResourcesQuerySchema = z.object({
  program: objectId.optional(),
  search: text(120).optional(),
});

export const courseResourceUploadSchema = z.object({
  program: objectId,
  courseName: text(160).min(1),
  courseCode: text(40).min(1),
  filename: text(255).min(1),
});

export const listResultsQuerySchema = paginationSchema.extend({
  academicYear: objectId.optional(),
  term: text(60).optional(),
  status: z.enum(['all', 'draft', 'submitted', 'under_review', 'approved', 'published', 'rejected']).optional().default('all'),
  offering: objectId.optional(),
  student: objectId.optional(),
});

export const resultDecisionSchema = z.object({
  reason: optionalText(500),
});

export const offeringIdParamSchema = z.object({ offering: objectId });

export const resultSubmissionDecisionSchema = z.object({
  reason: text(500).min(5, 'Explain what the teacher needs to correct.'),
});

export const resultCorrectionSchema = z
  .object({
    components: z
      .array(z.object({ name: text(80).min(1), max: z.coerce.number().min(0.01).max(1000), score: z.coerce.number().min(0) }))
      .max(20)
      .optional(),
    totalMark: z.coerce.number().min(0).max(100).optional(),
    reason: text(1000).min(3),
  })
  .superRefine((value, ctx) => {
    if (!value.components && value.totalMark === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['totalMark'],
        message: 'Enter a corrected mark or the corrected components.',
      });
    }
    value.components?.forEach((component, index) => {
      if (component.score > component.max) {
        ctx.addIssue({
          code: 'custom',
          path: ['components', index, 'score'],
          message: 'A component score cannot be higher than its maximum.',
        });
      }
    });
    if (value.components && value.totalMark === undefined) {
      const total = value.components.reduce((sum, component) => sum + component.score, 0);
      if (total > 100) {
        ctx.addIssue({
          code: 'custom',
          path: ['components'],
          message: 'Component scores cannot add up to more than 100.',
        });
      }
    }
  });

export const resultEntrySchema = z.object({
  student: objectId,
  offering: objectId,
  components: z
    .array(z.object({ name: text(80).min(1), max: z.coerce.number().min(0.01).max(1000), score: z.coerce.number().min(0) }))
    .max(20)
    .optional()
    .default([]),
  totalMark: z.coerce.number().min(0).max(100).optional(),
});

export const listAttendanceQuerySchema = paginationSchema.extend({
  academicYear: objectId.optional(),
  term: text(60).optional(),
  offering: objectId.optional(),
  student: objectId.optional(),
  status: z.enum(['all', 'present', 'absent', 'late', 'excused']).optional().default('all'),
  from: date.optional(),
  to: date.optional(),
});

export const gpaQuerySchema = z.object({
  student: objectId.optional(),
  program: objectId.optional(),
  batch: objectId.optional(),
  academicYear: objectId.optional(),
  term: text(60).optional(),
});

export const graduationQuerySchema = paginationSchema.extend({
  status: z.enum(['all', 'eligible', 'in_progress', 'pending_review', 'not_eligible', 'certificate_issued']).optional().default('all'),
  program: objectId.optional(),
  academicYear: objectId.optional(),
});

export const transcriptCreateSchema = z.object({
  student: objectId,
  purpose: optionalText(300),
});

export const certificateEligibilitySchema = z.object({
  student: objectId,
});

export const certificatePreviewSchema = z.object({
  student: objectId,
});

export const certificateIssueSchema = z.object({
  student: objectId,
  idempotencyKey: text(120).min(4),
  confirm: z.literal(true),
});

export const certificateIdParamSchema = z.object({ id: objectId });

export const revokeSchema = z.object({
  reason: text(1000).min(5),
});

export const reissueSchema = z.object({
  reason: text(1000).min(5),
  idempotencyKey: text(120).min(4),
});

export const registrarReportQuerySchema = z.object({
  type: z.enum(['students', 'enrollments', 'results', 'graduation', 'certificates', 'transcripts', 'curriculum', 'attendance']),
  format: z.enum(['xlsx', 'docx', 'pdf']).optional().default('xlsx'),
  academicYear: objectId.optional(),
  program: objectId.optional(),
  department: objectId.optional(),
  batch: objectId.optional(),
  category: z.enum(['regular', 'extension']).optional(),
  status: text(40).optional().default(''),
});

export const announcementListSchema = paginationSchema.extend({
  status: z.enum(['all', 'draft', 'scheduled', 'published', 'expired', 'archived']).optional().default('all'),
  kind: z.enum(['announcement', 'notification']).optional().default('announcement'),
});

const registrarNoticeFields = z.object({
  title: text(160).min(3),
  body: text(5000).min(3),
  type: z.enum(['general', 'academic', 'exam', 'event', 'administrative', 'emergency', 'holiday', 'finance']).optional().default('general'),
  priority: z.enum(['normal', 'high', 'critical']).optional().default('normal'),
  audience: z.enum(['role', 'user']),
  audienceRole: z.enum(['TEACHER', 'ACCOUNTANT']).nullish(),
  audienceEmail: z.union([z.literal(''), z.email()]).optional().default(''),
  scheduledFor: date.nullish(),
  kind: z.enum(['announcement', 'notification']).optional().default('announcement'),
});

export const registrarAnnouncementSchema = registrarNoticeFields.superRefine((value, ctx) => {
  if (value.kind === 'notification' && value.body.length > 300) {
    ctx.addIssue({
      code: 'custom',
      path: ['body'],
      message: 'A notification message must be at most 300 characters.',
    });
  }
});

export const registrarNotificationSchema = registrarNoticeFields.extend({
  kind: z.literal('notification').optional().default('notification'),
  body: text(300).min(3),
});

export const audiencePreviewSchema = z.object({
  audience: z.enum(['role', 'user']),
  audienceRole: z.enum(['TEACHER', 'ACCOUNTANT']).nullish(),
  audienceEmail: z.union([z.literal(''), z.email()]).optional().default(''),
});

export const courseEntryListSchema = z.object({
  student: objectId,
  academicYear: objectId.optional(),
});

export const listBatchesQuerySchema = paginationSchema.extend({
  program: objectId.optional(),
  department: objectId.optional(),
  category: z.enum(['regular', 'extension']).optional(),
  status: z.enum(['all', 'planned', 'active', 'completed', 'archived']).optional().default('all'),
});

export const analyticsQuerySchema = z.object({
  academicYear: objectId.optional(),
  department: objectId.optional(),
  program: objectId.optional(),
  batch: objectId.optional(),
  category: z.enum(['regular', 'extension']).optional(),
});

export const listPlansQuerySchema = paginationSchema.extend({
  program: objectId.optional(),
  academicYear: objectId.optional(),
  status: z.enum(['all', 'draft', 'published', 'archived']).optional().default('all'),
});

export const planCourseParamSchema = z.object({ id: objectId, courseId: objectId });

export const registrationEligibleQuerySchema = z.object({
  student: objectId,
  academicYear: objectId,
  term: text(60).min(1),
});

export const listCertificatesQuerySchema = paginationSchema.extend({
  status: z.enum(['all', 'issued', 'revoked', 'reissued']).optional().default('all'),
  academicYear: objectId.optional(),
});

export const listTranscriptsQuerySchema = paginationSchema.extend({
  status: z.enum(['all', 'issued', 'revoked']).optional().default('all'),
});

export const noticeListSchema = paginationSchema.extend({
  kind: z.enum(['announcement', 'notification']).optional().default('announcement'),
  status: z.enum(['all', 'draft', 'scheduled', 'published', 'expired', 'archived']).optional().default('all'),
  // Filters for the announcements list
  author: z.enum(['all', 'mine']).optional().default('all'),
  audienceRole: z.enum(['ADMIN', 'REGISTRAR', 'TEACHER', 'ACCOUNTANT']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  search: z.string().optional().default(''),
});

const gradeBandSchema = z.object({
  min: z.coerce.number().int().min(0).max(100),
  max: z.coerce.number().int().min(0).max(100),
  letter: text(10).min(1),
  points: z.coerce.number().min(0).max(4),
  pass: z.boolean().default(true),
});

export const gradingPolicyUpdateSchema = z.object({
  bands: z.array(gradeBandSchema).min(1),
  repeatPolicy: z.enum(['all', 'best', 'latest']).default('all'),
  rounding: z.coerce.number().int().min(0).max(4).default(2),
  effectiveFrom: z.coerce.date().optional(),
  reason: text(1000).optional(),
});

export const gradingPolicyPreviewSchema = z.object({
  marks: z.array(z.coerce.number().min(0).max(100)).min(1).max(20),
});
