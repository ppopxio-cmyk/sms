import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Student, Enrollment } from '../models/Student.js';
import { AcademicYear } from '../models/AcademicStructure.js';
import { CurriculumPlan } from '../models/Curriculum.js';
import { Certificate, CertificateTemplate, Transcript } from '../models/Documents.js';
import { Counter } from '../models/RegistrarSupport.js';
import { getGradingPolicy, academicSnapshot, cgpaForStudent } from './grading.service.js';
import { evaluateStudent } from './eligibility.service.js';
import { assertNoFinancialHold } from './finance.service.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { signedImageUrl } from './imagekit.service.js';
import { renderCertificatePdf, renderTranscriptPdf, renderBulkCertificatesPdf } from './certificate-pdf.service.js';
import { logger } from '../utils/logger.js';
import { ownFilter } from './registrar.helpers.js';
import { toEthiopian } from '../utils/ethiopianDate.js';

export async function fetchAssetBuffer(asset, { jpeg = false } = {}) {
  if (!asset) return null;
  const filePath = asset.filePath || asset.url;
  if (!filePath && !asset.fileId) return null;

  // 1. Check local file system
  if (filePath) {
    const filename = path.basename(filePath);
    const candidates = [
      filePath,
      path.resolve(process.cwd(), filePath.replace(/^\//, '')),
      path.resolve(process.cwd(), 'server', filePath.replace(/^\//, '')),
      path.resolve(process.cwd(), 'server/src/assets', filename),
      path.resolve(process.cwd(), filename),
    ];
    for (const cand of candidates) {
      try {
        if (cand && fs.existsSync(cand) && !fs.statSync(cand).isDirectory()) {
          return await fs.promises.readFile(cand);
        }
      } catch {}
    }
  }

  // 2. Direct HTTP(S) URL
  if (asset.url && /^https?:\/\//i.test(asset.url)) {
    try {
      const resp = await fetch(asset.url, { signal: AbortSignal.timeout(10_000) });
      if (resp.ok) return Buffer.from(await resp.arrayBuffer());
    } catch (err) {
      logger.warn({ err: err?.message }, 'Direct URL asset fetch failed');
    }
  }

  // 3. ImageKit
  if (asset.filePath) {
    try {
      const url = signedImageUrl(asset.filePath, {
        ...(jpeg ? { transformation: [{ raw: 'f-jpg' }] } : {}),
        expiresIn: 300,
      });
      if (url) {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (resp.ok) return Buffer.from(await resp.arrayBuffer());
      }
    } catch (err) {
      logger.warn({ err: err?.message }, 'certificate asset fetch via imagekit failed');
    }
  }

  return null;
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
    fetchAssetBuffer(template.seal).catch(() => null),
    fetchAssetBuffer(template.signature).catch(() => null),
  ]);
  return { logoBuffer, sealBuffer, signatureBuffer };
}

function requireOfficialAssets(assets) {
  // Official seal is optional - certificates can be issued with standard college styling
  // if no custom seal image is uploaded.
  return;
}

async function fetchCertificatePhoto(template, photo) {
  if (!photo?.filePath) {
    return null;
  }
  try {
    return await fetchAssetBuffer(photo, { jpeg: true });
  } catch (err) {
    logger.warn({ err: err?.message }, 'certificate photo could not be loaded, using 4x4 box');
    return null;
  }
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

  const enrollment = await Enrollment.findOne(ownFilter({ student: studentId, status: { $in: ['active', 'pending', 'completed'] } }))
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
    completionDate: student.completionDate || student.graduationDate || student.admissionDate || new Date('2019-12-31'),
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
    data.completionDate = data.student.completionDate || data.student.graduationDate || data.student.admissionDate || new Date('2019-12-31');
  }
  // Preview is granted even if photo is missing (placeholder will be rendered)
  const assets = await loadBrandingAssets(template);
  requireOfficialAssets(assets);
  const photoBuffer = await fetchCertificatePhoto(template, data.student.photo);
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
  const hasPhoto = Boolean(
    student.photo?.fileId ||
    student.photo?.url ||
    student.photo?.filePath ||
    student.photo?.thumbnailUrl
  ) && student.photo?.status !== 'missing';

  if (!hasPhoto) {
    throw new AppError(
      409,
      'CERTIFICATE_PHOTO_REQUIRED',
      'A trainee photograph is strictly required before issuing an official certificate. Upload one first.',
    );
  }
}

async function nextCertificateNumber(prefix, year) {
  const counter = await Counter.findOneAndUpdate(
    { key: `certificate:${year}` },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return `${prefix || 'CERT'}-${year}-${String(counter.value).padStart(5, '0')}`;
}

async function renderIssuedCertificate(certificate, template, prepared = null) {
  const assets = prepared || (await loadBrandingAssets(template));
  requireOfficialAssets(assets);
  const photoBuffer = prepared?.photoBuffer ?? (await fetchCertificatePhoto(template, certificate.studentSnapshot?.photo));
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
  await assertNoFinancialHold(studentId, 'issuing an official certificate');
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
  assertPhoto(student);

  const evaluation = await evaluateStudent(studentId, { evaluatedBy: userId });
  if (!evaluation) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  if (evaluation.status !== 'eligible' && student.studentStatus !== 'graduated') {
    throw new AppError(409, 'STUDENT_NOT_ELIGIBLE', 'The student does not meet the requirements for a certificate.', {
      reasons: evaluation.reasons,
      status: evaluation.status,
    });
  }

  const data = await buildSnapshot(studentId, { policy, evaluation });
  if (!data.completionDate) {
    data.completionDate = student.completionDate || new Date('2019-12-31');
  }
  const academicStudent = data.student;
  const academicYearId = data.enrollment?.academicYear ?? academicStudent.admissionAcademicYear?._id ?? academicStudent.admissionAcademicYear ?? null;
  const ethYear = toEthiopian(data.completionDate || new Date()).year || 2019;
  const preparedAssets = await loadBrandingAssets(template);
  requireOfficialAssets(preparedAssets);
  const preparedPhoto = await fetchCertificatePhoto(template, academicStudent.photo);
  const certificateNumber = await nextCertificateNumber(template.certificatePrefix, ethYear);
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
    const pdf = await renderIssuedCertificate(certificate.toObject(), template, {
      ...preparedAssets,
      photoBuffer: preparedPhoto,
    });
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
  requireOfficialAssets(assets);
  const photoBuffer = await fetchCertificatePhoto(template, certificate.studentSnapshot?.photo);
  return {
    certificate,
    buffer: await renderCertificatePdf({ certificate, template, photoBuffer, ...assets }),
    filename: `Certificate_${String(certificate.studentSnapshot?.studentId || 'student').replace(/[^a-z0-9_-]+/gi, '-')}_${certificate.certificateNumber}.pdf`,
  };
}

export async function issueTranscript({ studentId, userId, purpose, selectedLevels }) {
  await assertNoFinancialHold(studentId, 'issuing an official transcript');
  const student = await Student.findById(studentId)
    .populate('program', 'code name qualificationType durationYears')
    .populate('department', 'code name')
    .populate('batch', 'code name category')
    .populate('admissionAcademicYear', 'label')
    .lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const policy = await getGradingPolicy();
  if (!policy) throw new AppError(409, 'GRADING_POLICY_MISSING', 'The grading policy is not configured yet.');
  const data = await academicSnapshot(studentId, policy);
  if (!data.rows.length) {
    throw new AppError(409, 'NO_PUBLISHED_RESULTS', 'This student has no published results, so a transcript cannot be issued.');
  }

  // Enforce 3-times limit for transcripts requested by user
  const existingCount = await Transcript.countDocuments({ student: studentId, status: { $ne: 'revoked' } });
  if (existingCount >= 3) {
    throw new AppError(400, 'TRANSCRIPT_LIMIT_REACHED', 'This student has already reached the maximum issuance limit of 3 transcripts.');
  }

  let courses = data.courses;
  const selected = Array.isArray(selectedLevels) && selectedLevels.length > 0 ? selectedLevels.map(Number) : null;
  if (selected && selected.length > 0) {
    const levelSet = new Set(selected);
    courses = courses.filter((c) => levelSet.has(Number(c.level)));
    if (!courses.length) {
      throw new AppError(400, 'NO_COURSES_FOR_SELECTED_LEVELS', 'No published courses found for the selected year(s)/level(s).');
    }
  }

  let qualityPoints = 0;
  let credits = 0;
  for (const c of courses) {
    const cr = Number(c.credits || 0);
    const pts = Number(c.gradePoint);
    if (!Number.isNaN(pts) && c.gradePoint !== null && cr > 0) {
      qualityPoints += pts * cr;
      credits += cr;
    }
  }
  const calcCgpa = credits > 0 ? Math.round((qualityPoints / credits) * 100) / 100 : null;

  const transcript = await Transcript.create({
    student: studentId,
    issueNumber: existingCount + 1,
    studentSnapshot: {
      studentId: student.studentId,
      fullName: student.fullName,
      sex: student.sex,
      dateOfBirth: student.dateOfBirth,
      admissionDate: student.admissionDate || student.createdAt,
      batchCode: student.batch?.code || '',
      batchCategory: student.batch?.category || '',
      photo: student.photo,
    },
    programSnapshot: {
      code: student.program?.code || '',
      name: student.program?.name || '',
      qualificationType: student.program?.qualificationType || '',
      durationYears: student.program?.durationYears,
    },
    departmentSnapshot: { code: student.department?.code || '', name: student.department?.name || '' },
    selectedLevels: selected || [],
    purpose: purpose || '',
    academicSnapshot: courses,
    gradingLegend: gradingLegend(policy),
    cgpa: calcCgpa,
    totalCredits: courses.reduce((sum, row) => sum + Number(row.credits || 0), 0),
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

export async function bulkIssueCertificatesAndPdf({ programId, batchId, userId }) {
  const students = await Student.find({
    program: programId,
    batch: batchId,
    studentStatus: { $ne: 'archived' },
  }).sort({ studentId: 1 });

  if (!students.length) {
    throw new AppError(404, 'NO_STUDENTS', 'No students found in this cohort.');
  }

  const template = await activeTemplate();
  if (!template) throw new AppError(409, 'CERTIFICATE_TEMPLATE_MISSING', 'No active certificate template is configured.');
  const assets = await loadBrandingAssets(template);
  requireOfficialAssets(assets);

  const items = [];
  let issuedCount = 0;
  let skippedCount = 0;

  for (const student of students) {
    const hasPhoto = Boolean(
      student.photo?.url || student.photo?.filePath || student.photo?.fileId
    ) && student.photo?.status !== 'missing';

    if (!hasPhoto) {
      skippedCount++;
      continue;
    }

    let certificate;
    try {
      certificate = await issueCertificate({ studentId: student._id, userId });
      if (student.studentStatus !== 'graduated') {
        student.studentStatus = 'graduated';
        await student.save();
      }
      issuedCount++;
    } catch (err) {
      certificate = await Certificate.findOne({ student: student._id, status: 'issued' });
      if (!certificate) {
        skippedCount++;
        continue;
      }
    }

    const photoBuffer = await fetchCertificatePhoto(template, student.photo);
    items.push({
      certificate,
      template,
      photoBuffer,
      logoBuffer: assets.logo,
      sealBuffer: assets.seal,
      signatureBuffer: assets.signature,
    });
  }

  if (!items.length) {
    throw new AppError(400, 'NO_ELIGIBLE_STUDENTS', 'No students in this cohort have verified photos to issue certificates. Upload photos first.');
  }

  const buffer = await renderBulkCertificatesPdf(items);
  const progDoc = await Student.findById(students[0]._id).populate('program').lean();
  const progCode = progDoc?.program?.code || 'PROG';
  const filename = `All_Certificates_${progCode}_${batchId}.pdf`;

  return { buffer, filename, issuedCount, skippedCount, total: items.length };
}
