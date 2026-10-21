import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Choose a valid record.');
const text = (max = 200) => z.string().trim().max(max);
const optionalText = (max = 200) => text(max).optional().default('');
const date = z.coerce.date();

export const idParamSchema = z.object({ id: objectId });
export const studentIdParamSchema = z.object({ studentId: objectId });

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
});

export const createStudentSchema = z.object({
  studentId: text(40).min(2),
  firstName: text(80).min(1),
  middleName: optionalText(80),
  lastName: text(80).min(1),
  sex: z.enum(['female', 'male', 'other', 'unspecified']).optional().default('unspecified'),
  dateOfBirth: date.nullish(),
  email: z.union([z.literal(''), z.email()]).optional().default(''),
  phone: optionalText(40),
  address: z
    .object({
      region: optionalText(80),
      city: optionalText(80),
      woreda: optionalText(80),
      line: optionalText(220),
    })
    .optional()
    .default({}),
  department: objectId,
  program: objectId,
  batch: objectId.nullish(),
  admissionAcademicYear: objectId.nullish(),
  level: z.coerce.number().int().min(1).max(20).optional().default(1),
  enrollmentStatus: z.enum(['pending', 'active', 'completed', 'withdrawn', 'cancelled']).optional().default('pending'),
  studentStatus: z.enum(['active', 'suspended', 'graduated', 'withdrawn', 'archived']).optional().default('active'),
  admissionDate: date.nullish(),
  notes: optionalText(2000),
});

export const updateStudentSchema = createStudentSchema.partial().omit({ studentId: true });

export const enrollmentCreateSchema = z.object({
  student: objectId,
  academicYear: objectId,
  batch: objectId.nullish(),
  level: z.coerce.number().int().min(1).max(20),
  enrollmentDate: date,
  status: z.enum(['pending', 'active', 'completed', 'withdrawn', 'cancelled']).optional().default('active'),
});

export const enrollmentStatusSchema = z.object({
  status: z.enum(['pending', 'active', 'completed', 'withdrawn', 'cancelled']),
  reason: optionalText(500),
});

export const listEnrollmentsQuerySchema = paginationSchema.extend({
  status: z.enum(['all', 'pending', 'active', 'completed', 'withdrawn', 'cancelled']).optional().default('all'),
  academicYear: objectId.optional(),
  program: objectId.optional(),
  student: objectId.optional(),
});

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
  program: objectId,
  admissionAcademicYear: objectId,
  expectedCompletionYear: z.coerce.number().int().min(2000).max(2300).nullish(),
  currentLevel: z.coerce.number().int().min(1).max(20).optional().default(1),
  status: z.enum(['planned', 'active', 'completed', 'archived']).optional().default('planned'),
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

export const listRegistrationsQuerySchema = paginationSchema.extend({
  academicYear: objectId.optional(),
  term: text(60).optional(),
  student: objectId.optional(),
  status: z.enum(['all', 'registered', 'dropped', 'withdrawn', 'completed', 'cancelled']).optional().default('all'),
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
  status: z.enum(['all', 'planned', 'active', 'completed', 'archived']).optional().default('all'),
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
});
