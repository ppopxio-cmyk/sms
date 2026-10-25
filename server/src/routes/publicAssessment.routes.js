import express, { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { codeLimiter, uploadLimiter } from '../middleware/rateLimit.js';
import {
  publicAssessmentParamSchema,
  publicAssessmentSubmitQuerySchema,
  publicAssessmentVerifySchema,
} from '../validators/publicAssessment.schemas.js';
import { downloadDocument, meta, submit, verify } from '../controllers/publicAssessments.controller.js';

const r = Router();

r.get('/assessments/:hash', validate(publicAssessmentParamSchema, 'params'), meta);
r.get('/assessments/:hash/document/download', validate(publicAssessmentParamSchema, 'params'), downloadDocument);
r.post(
  '/assessments/:hash/verify',
  codeLimiter,
  validate(publicAssessmentParamSchema, 'params'),
  validate(publicAssessmentVerifySchema),
  verify,
);
r.post(
  '/assessments/:hash/submissions',
  uploadLimiter,
  validate(publicAssessmentParamSchema, 'params'),
  validate(publicAssessmentSubmitQuerySchema, 'query'),
  express.raw({
    type: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
    ],
    limit: '30mb',
  }),
  submit,
);

export default r;
