import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import {
  portalMeta,
  receivePortalSubmission,
  verifyPortalAccess,
} from '../services/assessmentPortal.service.js';

export const meta = asyncHandler(async (req, res) => {
  res.json(await portalMeta(req.valid.params.hash));
});

export const verify = asyncHandler(async (req, res) => {
  res.json(await verifyPortalAccess(req.valid.params.hash, req.body));
});

export const submit = asyncHandler(async (req, res) => {
  const data = await receivePortalSubmission(
    req.valid.params.hash,
    req.valid.query,
    req.body,
    { ip: req.ip },
  );
  audit({
    req,
    actorRole: 'STUDENT',
    action: 'assessment.submission_received',
    targetType: 'AssessmentSubmission',
    targetId: data.submission?.id,
    meta: {
      assessmentId: data.assessment?.title,
      studentNumber: data.student?.studentNumber,
      fileName: data.submission?.fileName,
      revision: data.submission?.revision,
    },
  });
  res.status(201).json(data);
});
