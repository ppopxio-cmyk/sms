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
export const attendanceParamSchema = z.strictObject({ attendanceId: objectId });
export const finalizeAttendanceParamSchema = z.strictObject({ assignmentId: objectId, attendanceId: objectId });
export const materialParamSchema = z.strictObject({ materialId: objectId });
export const studentParamSchema = z.strictObject({ studentId: objectId });

export const listAssignmentsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'active', 'completed']).default('all'),
  program: objectId.optional(),
  page,
  limit,
});

export const listStudentsQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  assignmentId: objectId.optional(),
  status: z.enum(['all', 'active']).default('active'),
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
