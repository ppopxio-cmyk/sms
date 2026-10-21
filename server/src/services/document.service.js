import crypto from 'node:crypto';
import { Student, Enrollment } from '../models/Student.js';
import { AcademicYear } from '../models/AcademicStructure.js';
import { CurriculumPlan } from '../models/Curriculum.js';
import { Certificate, CertificateTemplate, Transcript } from '../models/Documents.js';
import { Counter } from '../models/RegistrarSupport.js';
import { getGradingPolicy, academicSnapshot, cgpaForStudent } from './grading.service.js';
import { evaluateStudent } from './eligibility.service.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { signedImageUrl } from './imagekit.service.js';
import { renderCertificatePdf, renderTranscriptPdf } from './certificate-pdf.service.js';
import { logger } from '../utils/logger.js';
import { ownFilter } from './registrar.helpers.js';

async function fetchAssetBuffer(asset, { jpeg = false } = {}) {
  if (!asset?.filePath) return null;
  const url = signedImageUrl(asset.filePath, {
    ...(jpeg ? { transformation: [{ raw: 'f-jpg' }] } : {}),
    expiresIn: 300,
  });
  if (!url) {
    throw new AppError(503, 'IMAGEKIT_NOT_CONFIGURED', 'Image storage is not configured, so the document cannot be rendered.');
  }
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    logger.error({ err: err?.message }, 'certificate asset fetch failed');
    throw new AppError(502, 'ASSET_UNAVAILABLE', 'A certificate asset could not be loaded. Please try again.');
  }
  if (!response.ok) {
    throw new AppError(502, 'ASSET_UNAVAILABLE', 'A certificate asset could not be loaded. Please try again.');
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function loadBrandingAssets(template) {
  if (!template) {
    throw new AppError(
      409,
      'CERTIFICATE_TEMPLATE_MISSING',
      'No active certificate template is configured. Load one with the academic setup tool before issuing documents.',
    );
  }
  const [logoBuffer, sealBuffer, signatureBuffer] = await Promise.all([
    fetchAssetBuffer(template.logo).catch(() => null),
    fetchAssetBuffer(template.seal),
    fetchAssetBuffer(template.signature),
  ]);
  return { logoBuffer, sealBuffer, signatureBuffer };
}

export async function activeTemplate() {
  return CertificateTemplate.findOne({ active: true }).lean();
}

function gradingLegend(policy) {
  return (policy?.bands || []).map((band) => ({
    letter: band.letter,
    min: band.min,
    max: band.max,
    points: band.points,
    pass: band.pass,
  }));
}

async function buildSnapshot(studentId, { policy, evaluation }) {
  const student = await Student.findById(studentId)
    .populate('program', 'code name qualificationType')
    .populate('department', 'code name')
    .populate('admissionAcademicYear', 'label')
    .lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');

  const enrollment = await Enrollment.findOne(ownFilter({ student: studentId, status: { $in: ['active', 'pending'] } }))
    .sort({ createdAt: -1 })
    .lean();
  const yearId = enrollment?.academicYear ?? student.admissionAcademicYear?._id ?? student.admissionAcademicYear;
  const academicYear = yearId ? await AcademicYear.findById(yearId).lean() : null;
  const snapshot = await academicSnapshot(studentId, policy);
  const plan = await CurriculumPlan.findOne({
    program: student.program?._id ?? student.program,
    academicYear: yearId,
    status: 'published',
  }).lean();

  return {
    student,
    enrollment,
    academicYear,
    plan,
    snapshot,
    // A completion date is an academic record, never something inferred from the most
    // recent result. Missing dates block issuance until the Registrar records one.
    completionDate: student.completionDate || null,
    evaluation,
  };
}

export async function certificatePreview(studentId, userId) {
  const policy = await getGradingPolicy();
  if (!policy) {
    throw new AppError(409, 'GRADING_POLICY_MISSING', 'The grading policy is not configured yet.');
  }
  const evaluation = await evaluateStudent(studentId, { evaluatedBy: userId });
  if (!evaluation) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const template = await activeTemplate();
  if (!template) {
    throw new AppError(409, 'CERTIFICATE_TEMPLATE_MISSING', 'No active certificate template is configured.');
  }
  const data = await buildSnapshot(studentId, { policy, evaluation });
  if (!data.completionDate) {
    throw new AppError(409, 'COMPLETION_DATE_MISSING', 'A completion date has not been recorded for this student.');
  }
  if (template.photoPolicy === 'required') assertPhoto(data.student);
  const assets = await loadBrandingAssets(template);
  const photoBuffer = await fetchAssetBuffer(data.student.photo, { jpeg: true }).catch(() => null);
  const certificate = {
    certificateNumber: 'PREVIEW',
    verificationId: 'preview',
    studentSnapshot: {
      studentId: data.student.studentId,
      fullName: data.student.fullName,
      sex: data.student.sex,
      photo: data.student.photo,
    },
    programSnapshot: {
      code: data.student.program?.code || '',
      name: data.student.program?.name || '',
      qualificationType: data.student.program?.qualificationType || '',
    },
    departmentSnapshot: { code: data.student.department?.code || '', name: data.student.department?.name || '' },
    academicYearLabel: data.academicYear?.label || '',
    completionDate: data.completionDate,
    cgpa: data.snapshot.cgpa.gpa,
    requiredCredits: evaluation.requiredCredits,
    earnedCredits: evaluation.earnedCredits,
    gradingLegend: gradingLegend(policy),
    academicSnapshot: data.snapshot.courses,
    issuedAt: new Date(),
  };
  return renderCertificatePdf({
    certificate,
    template,
    photoBuffer,
    ...assets,
    preview: true,
  });
}

function assertPhoto(student) {
  if (!student.photo?.fileId || student.photo.status !== 'active') {
    throw new AppError(
      409,
      'CERTIFICATE_PHOTO_REQUIRED',
      'The certificate policy requires a verified student photo. Upload one before issuing this certificate.',
    );
  }
  if (
    Number(student.photo.width || 0) < env.CERTIFICATE_PHOTO_MIN_PX ||
    Number(student.photo.height || 0) < env.CERTIFICATE_PHOTO_MIN_PX
  ) {
    throw new AppError(
      409,
      'CERTIFICATE_PHOTO_TOO_SMALL',
      `The certificate photo must be at least ${env.CERTIFICATE_PHOTO_MIN_PX} x ${env.CERTIFICATE_PHOTO_MIN_PX} pixels.`,
    );
  }
}

async function nextCertificateNumber(prefix, year) {
  const counter = await Counter.findOneAndUpdate(
    { key: `certificate:${year}` },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return `${prefix || 'CERT'}-${year}-${String(counter.value).padStart(6, '0')}`;
}

async function renderIssuedCertificate(certificate, template) {
  const assets = await loadBrandingAssets(template);
  const photoBuffer = await fetchAssetBuffer(certificate.studentSnapshot?.photo, { jpeg: true }).catch(() => null);
  const pdf = await renderCertificatePdf({
    certificate,
    template,
    photoBuffer,
    ...assets,
  });
  await Certificate.updateOne(
    { _id: certificate._id },
    { $set: { pdfGeneratedAt: new Date() } },
  );
  return pdf;
}

export async function issueCertificate({ studentId, userId, idempotencyKey }) {
  const student = await Student.findById(studentId).lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');

  const existing = await Certificate.findOne({
    student: studentId,
    status: 'issued',
  }).lean();
  if (existing) {
    // Issuance is idempotent. If a previous attempt stored the number but failed while
    // rendering, the same record and number are reused and only the PDF is regenerated.
    if (!existing.pdfGeneratedAt) {
      const existingTemplate = await CertificateTemplate.findById(existing.template).lean();
      if (!existingTemplate) {
        throw new AppError(409, 'CERTIFICATE_TEMPLATE_MISSING', 'The certificate template used for this record is no longer available.');
      }
      await renderIssuedCertificate(existing, existingTemplate);
    }
    return existing;
  }

  const policy = await getGradingPolicy();
  if (!policy) throw new AppError(409, 'GRADING_POLICY_MISSING', 'The grading policy is not configured yet.');
  const template = await activeTemplate();
  if (!template) throw new AppError(409, 'CERTIFICATE_TEMPLATE_MISSING', 'No active certificate template is configured.');
  if (template.photoPolicy === 'required') assertPhoto(student);

  const evaluation = await evaluateStudent(studentId, { evaluatedBy: userId });
  if (!evaluation) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  if (evaluation.status !== 'eligible') {
    throw new AppError(409, 'STUDENT_NOT_ELIGIBLE', 'The student does not meet the requirements for a certificate.', {
      reasons: evaluation.reasons,
      status: evaluation.status,
    });
  }

  const data = await buildSnapshot(studentId, { policy, evaluation });
  if (!data.completionDate) {
    throw new AppError(409, 'COMPLETION_DATE_MISSING', 'A completion date has not been recorded for this student.');
  }
  const academicStudent = data.student;
  const academicYearId = data.enrollment?.academicYear ?? academicStudent.admissionAcademicYear?._id ?? academicStudent.admissionAcademicYear ?? null;
  const completionYear = new Date(data.completionDate).getFullYear();
  const certificateNumber = await nextCertificateNumber(template.certificatePrefix, completionYear);
  const verificationId = crypto.randomBytes(12).toString('hex');
  const record = {
    certificateNumber,
    verificationId,
    student: studentId,
    studentSnapshot: {
      studentId: academicStudent.studentId,
      fullName: academicStudent.fullName,
      sex: academicStudent.sex,
      photo: academicStudent.photo,
    },
    programSnapshot: {
      code: academicStudent.program?.code || '',
      name: academicStudent.program?.name || '',
      qualificationType: academicStudent.program?.qualificationType || '',
    },
    departmentSnapshot: {
      code: academicStudent.department?.code || '',
      name: academicStudent.department?.name || '',
    },
    academicYear: academicYearId,
    academicYearLabel: data.academicYear?.label || '',
    completionDate: data.completionDate,
    cgpa: data.snapshot.cgpa.gpa,
    curriculumPlan: data.plan?._id ?? null,
    planVersion: data.plan?.version ?? null,
    template: template._id,
    templateVersion: template.version,
    academicSnapshot: data.snapshot.courses,
    gradingLegend: gradingLegend(policy),
    requiredCredits: evaluation.requiredCredits,
    earnedCredits: evaluation.earnedCredits,
    issuedAt: new Date(),
    issuedBy: userId,
    idempotencyKey,
    status: 'issued',
  };

  let certificate;
  try {
    certificate = await Certificate.create(record);
  } catch (err) {
    if (err?.code === 11000) {
      const duplicate = await Certificate.findOne({ student: studentId, status: 'issued' }).lean();
      if (duplicate) return duplicate;
    }
    throw err;
  }

  try {
    const pdf = await renderIssuedCertificate(certificate.toObject(), template);
    certificate.pdfGeneratedAt = new Date();
    logger.info(
      { certificateId: String(certificate._id), bytes: pdf.length },
      'certificate issued and rendered',
    );
  } catch (err) {
    // The record and number remain stable, so a retry regenerates the same certificate.
    logger.error({ err: err?.message, certificateId: String(certificate._id) }, 'certificate render failed after issuance');
    throw err;
  }
  return certificate.toObject();
}

export async function certificatePdf(certificateId) {
  const certificate = await Certificate.findById(certificateId).lean();
  if (!certificate) throw new AppError(404, 'CERTIFICATE_NOT_FOUND', 'That certificate was not found.');
  if (certificate.status === 'revoked') {
    throw new AppError(409, 'CERTIFICATE_REVOKED', 'This certificate has been revoked and cannot be downloaded.');
  }
  const template = await CertificateTemplate.findById(certificate.template).lean();
  if (!template) throw new AppError(409, 'CERTIFICATE_TEMPLATE_MISSING', 'The certificate template is no longer available.');
  const assets = await loadBrandingAssets(template);
  const photoBuffer = await fetchAssetBuffer(certificate.studentSnapshot?.photo, { jpeg: true }).catch(() => null);
  return {
    certificate,
    buffer: await renderCertificatePdf({ certificate, template, photoBuffer, ...assets }),
    filename: `Certificate_${String(certificate.studentSnapshot?.studentId || 'student').replace(/[^a-z0-9_-]+/gi, '-')}_${certificate.certificateNumber}.pdf`,
  };
}

export async function issueTranscript({ studentId, userId, purpose }) {
  const student = await Student.findById(studentId)
    .populate('program', 'code name qualificationType')
    .populate('department', 'code name')
    .lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const policy = await getGradingPolicy();
  if (!policy) throw new AppError(409, 'GRADING_POLICY_MISSING', 'The grading policy is not configured yet.');
  const data = await academicSnapshot(studentId, policy);
  if (!data.rows.length) {
    throw new AppError(409, 'NO_PUBLISHED_RESULTS', 'This student has no published results, so a transcript cannot be issued.');
  }
  const transcript = await Transcript.create({
    student: studentId,
    studentSnapshot: {
      studentId: student.studentId,
      fullName: student.fullName,
      sex: student.sex,
      photo: student.photo,
    },
    programSnapshot: {
      code: student.program?.code || '',
      name: student.program?.name || '',
      qualificationType: student.program?.qualificationType || '',
    },
    departmentSnapshot: { code: student.department?.code || '', name: student.department?.name || '' },
    purpose: purpose || '',
    academicSnapshot: data.courses,
    gradingLegend: gradingLegend(policy),
    cgpa: data.cgpa.gpa,
    totalCredits: data.courses.reduce((sum, row) => sum + Number(row.credits || 0), 0),
    verificationId: crypto.randomBytes(12).toString('hex'),
    issuedBy: userId,
  });
  return transcript.toObject();
}

export async function transcriptPdf(transcriptId) {
  const transcript = await Transcript.findById(transcriptId).lean();
  if (!transcript) throw new AppError(404, 'TRANSCRIPT_NOT_FOUND', 'That transcript was not found.');
  if (transcript.status === 'revoked') {
    throw new AppError(409, 'TRANSCRIPT_REVOKED', 'This transcript has been revoked and cannot be downloaded.');
  }
  const template = await activeTemplate();
  const logoBuffer = template ? await fetchAssetBuffer(template.logo).catch(() => null) : null;
  const photoBuffer = await fetchAssetBuffer(transcript.studentSnapshot?.photo, { jpeg: true }).catch(() => null);
  return {
    transcript,
    buffer: await renderTranscriptPdf({ transcript, template, photoBuffer, logoBuffer }),
    filename: `Transcript_${String(transcript.studentSnapshot?.studentId || 'student').replace(/[^a-z0-9_-]+/gi, '-')}_${transcript.verificationId}.pdf`,
  };
}

export async function cgpaSnapshot(studentId) {
  const policy = await getGradingPolicy();
  return cgpaForStudent(studentId, policy);
}
