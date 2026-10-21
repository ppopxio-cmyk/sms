import { Certificate, Transcript, CertificateTemplate } from '../models/Documents.js';
import { Student } from '../models/Student.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { pageOf, sortOf, searchFilter, mergeFilters, paged, ownFilter } from '../services/registrar.helpers.js';
import {
  certificatePreview,
  certificatePdf,
  issueCertificate,
  issueTranscript,
  transcriptPdf,
} from '../services/document.service.js';

const sendPdf = (res, { buffer, filename }) => {
  res.status(200);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/["\\]/g, '-')}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
};

export const listCertificates = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  let studentIds = null;
  if (query.search) {
    const students = await Student.find(searchFilter(query.search, ['studentId', 'fullName']))
      .select('_id')
      .limit(2000)
      .lean();
    studentIds = students.map((row) => row._id);
  }
  const filter = mergeFilters(
    query.status && query.status !== 'all' ? { status: query.status } : null,
    query.academicYear ? { academicYear: query.academicYear } : null,
    studentIds ? { student: { $in: studentIds } } : null,
  );
  const [rows, total] = await Promise.all([
    Certificate.find(filter)
      .populate('student', 'studentId fullName level photo')
      .populate('academicYear', 'label')
      .sort(sortOf(query, ['issuedAt', 'certificateNumber', 'status'], 'issuedAt'))
      .skip(skip)
      .limit(limit)
      .lean(),
    Certificate.countDocuments(filter),
  ]);
  res.json({
    ...paged(
      rows.map((row) => ({
        id: String(row._id),
        certificateNumber: row.certificateNumber,
        verificationId: row.verificationId,
        student: row.student
          ? { id: String(row.student._id), studentId: row.student.studentId, fullName: row.student.fullName, level: row.student.level }
          : { studentId: row.studentSnapshot?.studentId, fullName: row.studentSnapshot?.fullName },
        program: row.programSnapshot,
        department: row.departmentSnapshot,
        academicYear: row.academicYear?.label || row.academicYearLabel,
        cgpa: row.cgpa,
        status: row.status,
        issuedAt: row.issuedAt,
        pdfGeneratedAt: row.pdfGeneratedAt,
        revokedAt: row.revokedAt,
        revokeReason: row.revokeReason,
      })),
      total,
      page,
      limit,
    ),
  });
});

export const getCertificate = asyncHandler(async (req, res) => {
  const row = await Certificate.findById(req.valid.params.id)
    .populate('student', 'studentId fullName photo')
    .populate('academicYear', 'label')
    .lean();
  if (!row) throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'That certificate was not found.');
  res.json({
    certificate: {
      ...row,
      id: String(row._id),
      student: row.student ? { ...row.student, id: String(row.student._id), _id: undefined } : null,
      academicYear: row.academicYear ? { ...row.academicYear, id: String(row.academicYear._id), _id: undefined } : null,
      _id: undefined,
    },
  });
});

export const preview = asyncHandler(async (req, res) => {
  const pdf = await certificatePreview(req.body.student, req.user.id);
  sendPdf(res, { buffer: pdf, filename: 'Certificate_preview.pdf' });
});

export const issue = asyncHandler(async (req, res) => {
  const certificate = await issueCertificate({
    studentId: req.body.student,
    userId: req.user.id,
    idempotencyKey: req.body.idempotencyKey,
  });
  audit({
    req,
    action: 'registrar.certificate.issue',
    targetType: 'Certificate',
    targetId: certificate._id,
    meta: { certificateNumber: certificate.certificateNumber, student: certificate.studentSnapshot?.studentId },
  });
  res.status(201).json({ certificate });
});

export const downloadCertificate = asyncHandler(async (req, res) => {
  const result = await certificatePdf(req.valid.params.id);
  audit({ req, action: 'registrar.certificate.download', targetType: 'Certificate', targetId: req.valid.params.id });
  sendPdf(res, result);
});

export const revokeCertificate = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findById(req.valid.params.id);
  if (!certificate) throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'That certificate was not found.');
  if (certificate.status === 'revoked') return res.json({ certificate });
  certificate.status = 'revoked';
  certificate.revokedAt = new Date();
  certificate.revokedBy = req.user.id;
  certificate.revokeReason = req.body.reason;
  await certificate.save();
  audit({ req, action: 'registrar.certificate.revoke', targetType: 'Certificate', targetId: certificate._id, meta: { reason: req.body.reason } });
  res.json({ certificate });
});

export const reissueCertificate = asyncHandler(async (req, res) => {
  const previous = await Certificate.findById(req.valid.params.id);
  if (!previous) throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'That certificate was not found.');
  if (previous.status !== 'revoked') {
    throw new AppError(409, 'CERTIFICATE_NOT_REVOKED', 'Only a revoked certificate can be reissued.');
  }
  const replacement = await issueCertificate({
    studentId: previous.student,
    userId: req.user.id,
    idempotencyKey: req.body.idempotencyKey,
  });
  await Certificate.updateOne(
    { _id: replacement._id },
    { $set: { supersedes: previous._id, status: 'issued' } },
  );
  previous.supersededBy = replacement._id;
  previous.status = 'reissued';
  previous.reissueReason = req.body.reason;
  await previous.save();
  audit({
    req,
    action: 'registrar.certificate.reissue',
    targetType: 'Certificate',
    targetId: replacement._id,
    meta: { previous: previous.certificateNumber, reason: req.body.reason },
  });
  const updated = await Certificate.findById(replacement._id).lean();
  res.status(201).json({ certificate: updated });
});

export const listTranscripts = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  let studentIds = null;
  if (query.search) {
    const students = await Student.find(searchFilter(query.search, ['studentId', 'fullName']))
      .select('_id')
      .limit(2000)
      .lean();
    studentIds = students.map((row) => row._id);
  }
  const filter = mergeFilters(
    query.status && query.status !== 'all' ? { status: query.status } : null,
    studentIds ? { student: { $in: studentIds } } : null,
  );
  const [rows, total] = await Promise.all([
    Transcript.find(filter)
      .populate('student', 'studentId fullName level')
      .sort(sortOf(query, ['issuedAt', 'status'], 'issuedAt'))
      .skip(skip)
      .limit(limit)
      .lean(),
    Transcript.countDocuments(filter),
  ]);
  res.json({
    ...paged(
      rows.map((row) => ({
        id: String(row._id),
        verificationId: row.verificationId,
        student: row.student
          ? { id: String(row.student._id), studentId: row.student.studentId, fullName: row.student.fullName }
          : { studentId: row.studentSnapshot?.studentId, fullName: row.studentSnapshot?.fullName },
        program: row.programSnapshot,
        cgpa: row.cgpa,
        totalCredits: row.totalCredits,
        purpose: row.purpose,
        status: row.status,
        issuedAt: row.issuedAt,
      })),
      total,
      page,
      limit,
    ),
  });
});

export const createTranscript = asyncHandler(async (req, res) => {
  const transcript = await issueTranscript({ studentId: req.body.student, userId: req.user.id, purpose: req.body.purpose });
  audit({ req, action: 'registrar.transcript.issue', targetType: 'Transcript', targetId: transcript._id, meta: { student: transcript.studentSnapshot?.studentId } });
  res.status(201).json({ transcript });
});

export const downloadTranscript = asyncHandler(async (req, res) => {
  const result = await transcriptPdf(req.valid.params.id);
  audit({ req, action: 'registrar.transcript.download', targetType: 'Transcript', targetId: req.valid.params.id });
  sendPdf(res, result);
});

export const revokeTranscript = asyncHandler(async (req, res) => {
  const transcript = await Transcript.findById(req.valid.params.id);
  if (!transcript) throw new AppError(404, 'TRANSCRIPT_NOT_FOUND', 'That transcript was not found.');
  if (transcript.status === 'revoked') return res.json({ transcript });
  transcript.status = 'revoked';
  transcript.revokedAt = new Date();
  transcript.revokedBy = req.user.id;
  transcript.revokeReason = req.body.reason;
  await transcript.save();
  audit({ req, action: 'registrar.transcript.revoke', targetType: 'Transcript', targetId: transcript._id, meta: { reason: req.body.reason } });
  res.json({ transcript });
});

export const verifyDocument = asyncHandler(async (req, res) => {
  const value = String(req.params.verificationId || '').trim();
  const certificate = await Certificate.findOne(ownFilter({
    $or: [{ verificationId: value }, { certificateNumber: value }],
  })).select('certificateNumber verificationId studentSnapshot programSnapshot departmentSnapshot academicYearLabel cgpa status issuedAt revokedAt').lean();
  if (certificate) {
    return res.json({
      valid: certificate.status === 'issued',
      kind: 'certificate',
      document: {
        certificateNumber: certificate.certificateNumber,
        verificationId: certificate.verificationId,
        studentName: certificate.studentSnapshot?.fullName,
        studentId: certificate.studentSnapshot?.studentId,
        program: certificate.programSnapshot?.name,
        qualification: certificate.programSnapshot?.qualificationType,
        department: certificate.departmentSnapshot?.name,
        academicYear: certificate.academicYearLabel,
        cgpa: certificate.cgpa,
        status: certificate.status,
        issuedAt: certificate.issuedAt,
        revokedAt: certificate.revokedAt,
      },
    });
  }
  const transcript = await Transcript.findOne({ verificationId: value })
    .select('verificationId studentSnapshot programSnapshot departmentSnapshot cgpa totalCredits status issuedAt revokedAt')
    .lean();
  if (transcript) {
    return res.json({
      valid: transcript.status === 'issued',
      kind: 'transcript',
      document: {
        verificationId: transcript.verificationId,
        studentName: transcript.studentSnapshot?.fullName,
        studentId: transcript.studentSnapshot?.studentId,
        program: transcript.programSnapshot?.name,
        qualification: transcript.programSnapshot?.qualificationType,
        department: transcript.departmentSnapshot?.name,
        cgpa: transcript.cgpa,
        totalCredits: transcript.totalCredits,
        status: transcript.status,
        issuedAt: transcript.issuedAt,
        revokedAt: transcript.revokedAt,
      },
    });
  }
  throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'No issued document matches that verification reference.');
});

export const certificateMeta = asyncHandler(async (_req, res) => {
  const template = await CertificateTemplate.findOne({ active: true }).select('name version certificateTitle photoPolicy signatoryName signatoryTitle institutionName institutionNameAmharic verificationBaseUrl').lean();
  res.json({ template: template ? { ...template, id: String(template._id), _id: undefined } : null });
});
