import { z } from 'zod';
import { ASSESSMENT_TYPES } from '../models/Assessment.js';
import { ATTENDANCE_PERIODS } from '../models/AttendanceSheet.js';
import { MATERIAL_KINDS, MATERIAL_VISIBILITIES } from '../models/Material.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'That id is not valid.');
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in the form YYYY-MM-DD.');
const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const exportFormat = z.enum(['xlsx', 'docx', 'pdf']).default('xlsx');
const score = z
  .number()
  .finite('Enter a number.')
  .min(0, 'A score cannot be below zero.')
  .max(1000, 'That score is too high.')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, 'Use at most two decimal places.');

export const assignmentParamSchema = z.strictObject({ assignmentId: objectId });
export const assessmentParamSchema = z.strictObject({ assessmentId: objectId });
export const assessmentSubmissionParamSchema = z.strictObject({ submissionId: objectId });
export const attendanceParamSchema = z.strictObject({ attendanceId: objectId });
export const finalizeAttendanceParamSchema = z.strictObject({ assignmentId: objectId, attendanceId: objectId });
export const materialParamSchema = z.strictObject({ materialId: objectId });
export const studentParamSchema = z.strictObject({ studentId: objectId });

export const listAssignmentsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'active', 'completed']).default('all'),
  program: objectId.optional(),
  batch: objectId.optional(),
  category: z.enum(['regular', 'extension']).optional(),
  page,
  limit,
});

export const listStudentsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  assignmentId: objectId.optional(),
  program: objectId.optional(),
  batch: objectId.optional(),
  category: z.enum(['regular', 'extension']).optional(),
  level: z.coerce.number().int().min(1).max(20).optional(),
  status: z.enum(['all', 'active', 'completed', 'withdrawn', 'cancelled', 'pending']).default('active'),
  page,
  limit,
});

export const attendanceOverviewQuerySchema = z.strictObject({
  status: z.enum(['all', 'draft', 'finalized']).default('all'),
  assignmentId: objectId.optional(),
  page,
  limit,
});

export const attendanceRosterQuerySchema = z.strictObject({
  date: dateKey.optional(),
  period: z.enum(ATTENDANCE_PERIODS).default('day'),
});

const attendanceRecord = z.strictObject({
  studentId: objectId,
  status: z.enum(['present', 'absent', 'late', 'excused']),
  note: z.string().trim().max(300).default(''),
});

export const saveAttendanceSchema = z
  .strictObject({
    date: dateKey,
    period: z.enum(ATTENDANCE_PERIODS).default('day'),
    revision: z.number().int().min(0).optional(),
    records: z.array(attendanceRecord).max(2000),
  })
  .superRefine((value, ctx) => {
    const seen = new Set();
    value.records.forEach((record, index) => {
      if (seen.has(record.studentId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['records', index, 'studentId'],
          message: 'A student can appear only once in an attendance sheet.',
        });
      }
      seen.add(record.studentId);
    });
  });

export const finalizeAttendanceSchema = z.strictObject({
  revision: z.number().int().min(0).optional(),
});

export const listAssessmentsQuerySchema = z.strictObject({
  assignmentId: objectId.optional(),
  type: z.enum(['all', ...ASSESSMENT_TYPES]).default('all'),
  status: z.enum(['all', 'draft', 'published', 'closed', 'submitted']).default('all'),
  page,
  limit,
});

const assessmentFields = {
  title: z.string().trim().min(2, 'Give this assessment a title.').max(160),
  type: z.enum(ASSESSMENT_TYPES).default('other'),
  maxScore: z.coerce.number().finite().min(0.01, 'The maximum score must be greater than zero.').max(1000),
  weight: z.coerce.number().finite().min(0).max(100).default(0),
  dueDate: z.coerce.date().nullable().optional(),
  instructions: z.string().trim().max(2000).default(''),
};

export const createAssessmentSchema = z.strictObject(assessmentFields);

export const updateAssessmentSchema = z
  .strictObject({
    title: assessmentFields.title.optional(),
    type: assessmentFields.type.optional(),
    maxScore: assessmentFields.maxScore.optional(),
    weight: assessmentFields.weight.optional(),
    dueDate: assessmentFields.dueDate,
    instructions: assessmentFields.instructions.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Change at least one field.');

const portalDate = z.union([z.null(), z.coerce.date()]).optional();

export const assessmentPortalSchema = z
  .strictObject({
    enabled: z.boolean(),
    opensAt: portalDate,
    closesAt: portalDate,
    allowResubmission: z.boolean().optional(),
    rotateCode: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.opensAt && value.closesAt && value.opensAt >= value.closesAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['closesAt'],
        message: 'The closing time must be after the opening time.',
      });
    }
  });

export const assessmentPortalDocumentQuerySchema = z.strictObject({
  filename: z.string().trim().min(1).max(255),
});

export const listAssessmentSubmissionsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'submitted', 'graded', 'returned']).default('all'),
  page,
  limit,
});

export const reviewAssessmentSubmissionSchema = z
  .strictObject({
    status: z.enum(['submitted', 'graded', 'returned']),
    score: z.coerce.number().finite().min(0).max(1000).nullable().optional(),
    feedback: z.string().trim().max(2000).default(''),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'graded' && value.score === null) {
      ctx.addIssue({ code: 'custom', path: ['score'], message: 'Enter a score before marking this submission as graded.' });
    }
    if (value.status === 'returned' && !value.feedback) {
      ctx.addIssue({ code: 'custom', path: ['feedback'], message: 'Explain what the student needs to change.' });
    }
  });

export const gradesQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  page,
  limit,
});

const gradeRow = z.strictObject({
  studentId: objectId,
  score: score.nullable(),
  feedback: z.string().trim().max(1000).default(''),
});

export const saveGradesSchema = z
  .strictObject({
    results: z.array(gradeRow).min(1, 'Enter at least one result.').max(2000),
  })
  .superRefine((value, ctx) => {
    const seen = new Set();
    value.results.forEach((row, index) => {
      if (seen.has(row.studentId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['results', index, 'studentId'],
          message: 'A student can appear only once in a grade sheet.',
        });
      }
      seen.add(row.studentId);
    });
  });

export const listMaterialsQuerySchema = z.strictObject({
  assignmentId: objectId.optional(),
  kind: z.enum(['all', ...MATERIAL_KINDS]).default('all'),
  visibility: z.enum(['all', ...MATERIAL_VISIBILITIES]).default('all'),
  search: z.string().trim().max(100).optional(),
  page,
  limit,
});

export const listCourseResourcesQuerySchema = z.strictObject({
  assignmentId: objectId.optional(),
  search: z.string().trim().max(100).optional(),
});

const materialFields = {
  title: z.string().trim().min(2, 'Give this material a title.').max(160),
  kind: z.enum(MATERIAL_KINDS),
  description: z.string().trim().max(1000).default(''),
  content: z.string().trim().max(5000).default(''),
  url: z.string().trim().max(2000).default(''),
  visibility: z.enum(MATERIAL_VISIBILITIES).default('draft'),
};

function checkMaterial(value, ctx) {
  if (value.kind === 'note' && !value.content) {
    ctx.addIssue({ code: 'custom', path: ['content'], message: 'Write the note before saving it.' });
  }
  if (value.kind === 'link') {
    if (!value.url) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Add the link before saving it.' });
    } else {
      try {
        const parsed = new URL(value.url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
      } catch {
        ctx.addIssue({ code: 'custom', path: ['url'], message: 'Use a complete http or https link.' });
      }
    }
  }
}

export const createMaterialSchema = z
  .strictObject({ assignmentId: objectId, ...materialFields })
  .superRefine(checkMaterial);

export const updateMaterialSchema = z
  .strictObject({
    title: materialFields.title.optional(),
    kind: materialFields.kind.optional(),
    description: materialFields.description.optional(),
    content: materialFields.content.optional(),
    url: materialFields.url.optional(),
    visibility: materialFields.visibility.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Change at least one field.');

export const reportOptionsQuerySchema = z.strictObject({
  assignmentId: objectId.optional(),
});

export const gradeSheetQuerySchema = z.strictObject({
  assignmentId: objectId,
  assessmentId: objectId.optional(),
  format: exportFormat.optional(),
});

export const attendanceReportQuerySchema = z.strictObject({
  assignmentId: objectId,
  from: dateKey.optional(),
  to: dateKey.optional(),
  format: exportFormat.optional(),
});

export const rosterReportQuerySchema = z.strictObject({
  assignmentId: objectId,
  format: exportFormat.optional(),
});

export const competencyReportQuerySchema = z.strictObject({
  assignmentId: objectId,
});

const markComponent = z.coerce.number().finite().min(0).max(100).nullable().optional();

export const courseMarkPolicySchema = z
  .strictObject({
    assessments: markComponent,
    quizzes: markComponent,
    bonus: markComponent,
    attendance: markComponent,
    presentation: markComponent,
  })
  .superRefine((value, ctx) => {
    const total = ['assessments', 'quizzes', 'bonus', 'attendance', 'presentation'].reduce(
      (sum, key) => sum + Number(value[key] || 0),
      0,
    );
    if (Math.abs(total - 100) > 0.001) {
      ctx.addIssue({ code: 'custom', message: 'The policy must add up to exactly 100 marks.' });
    }
  });

export const listCourseMarksQuerySchema = z.strictObject({
  program: objectId.optional(),
});

const courseMarkRow = z.strictObject({
  studentId: objectId,
  assessments: markComponent,
  quizzes: markComponent,
  bonus: markComponent,
  attendance: markComponent,
  presentation: markComponent,
});

export const saveCourseMarksSchema = z.strictObject({
  students: z.array(courseMarkRow).min(1, 'Enter at least one student.').max(2000),
});

export const submitCourseMarksSchema = z.strictObject({
  offeringIds: z.array(objectId).min(1, 'Choose at least one course.').max(100),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
});

export const courseMarksExportQuerySchema = z.strictObject({
  format: exportFormat,
});
