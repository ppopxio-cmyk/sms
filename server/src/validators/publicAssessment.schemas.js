import { z } from 'zod';

const hash = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{32}$/i, 'That assessment link is not valid.')
  .transform((value) => value.toLowerCase());

export const publicAssessmentParamSchema = z.strictObject({ hash });

export const publicAssessmentVerifySchema = z.strictObject({
  studentNumber: z.string().trim().min(1, 'Enter your student ID.').max(40),
  accessCode: z
    .string()
    .trim()
    .min(4, 'Enter the assessment code.')
    .max(32)
    .transform((value) => value.toUpperCase()),
});

export const publicAssessmentSubmitQuerySchema = z.strictObject({
  studentNumber: z.string().trim().min(1, 'Enter your student ID.').max(40),
  accessCode: z
    .string()
    .trim()
    .min(4, 'Enter the assessment code.')
    .max(32)
    .transform((value) => value.toUpperCase()),
  filename: z.string().trim().min(1).max(255),
  note: z.string().trim().max(1000).optional().default(''),
});
