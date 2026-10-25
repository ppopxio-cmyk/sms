import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
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

export const downloadDocument = asyncHandler(async (req, res) => {
  const metaData = await portalMeta(req.valid.params.hash);
  if (!metaData.assessment?.hasDocument || !metaData.assessment?.documentUrl) {
    throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'No document has been attached to this assessment.');
  }
  const response = await fetch(metaData.assessment.documentUrl);
  if (!response.ok) throw new AppError(502, 'DOWNLOAD_FAILED', 'Could not stream document.');
  const filename = (metaData.assessment.title || 'assessment-document').replace(/[^\w.\- ]+/g, '_') + '.pdf';
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/pdf');
  const arrayBuffer = await response.arrayBuffer();
  res.send(Buffer.from(arrayBuffer));
});
