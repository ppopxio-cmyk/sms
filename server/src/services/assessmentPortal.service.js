import crypto from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env.js';
import { Assessment } from '../models/Assessment.js';
import { AssessmentSubmission } from '../models/AssessmentSubmission.js';
import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { Result } from '../models/Records.js';
import { Student } from '../models/Student.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../utils/text.js';
import {
  ASSIGNMENT_POPULATE,
  assessmentForTeacher,
  studentName,
} from './teacherScope.service.js';
import {
  deleteImage,
  signedImageUrl,
  uploadDocument,
  validateDocument,
} from './imagekit.service.js';
import { notifyAdmins, notifyUser } from './notification.service.js';
import { ownFilter } from './registrar.helpers.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const key = crypto.scryptSync(env.CODE_HMAC_SECRET, 'sms-assessment-portal', 32);

function encryptCode(code) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptCode(value) {
  try {
    const [iv, tag, encrypted] = String(value || '')
      .split('.')
      .map((part) => Buffer.from(part, 'base64url'));
    if (!iv?.length || !tag?.length || !encrypted?.length) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

function createCode() {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
}

function sameCode(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function portalState(assessment, now = new Date()) {
  if (!assessment?.portalEnabled) return 'disabled';
  if (assessment.status === 'draft') return 'draft';
  if (['closed', 'submitted'].includes(assessment.status)) return 'closed';
  if (assessment.portalOpensAt && now < new Date(assessment.portalOpensAt)) return 'scheduled';
  if (assessment.portalClosesAt && now > new Date(assessment.portalClosesAt)) return 'closed';
  return 'open';
}

function documentDto(document) {
  if (!document?.filePath) return null;
  return {
    fileName: document.fileName,
    contentType: document.contentType,
    bytes: document.bytes,
    uploadedAt: document.uploadedAt,
    url: signedImageUrl(document.filePath, { expiresIn: 21600 }),
  };
}

export function portalSummary(assessment) {
  const state = portalState(assessment);
  return {
    enabled: Boolean(assessment.portalEnabled),
    status: state,
    publicHash: assessment.publicHash || null,
    opensAt: assessment.portalOpensAt || null,
    closesAt: assessment.portalClosesAt || null,
    allowResubmission: assessment.allowResubmission !== false,
    submissionCount: assessment.submissionCount || 0,
    document: documentDto(assessment.portalDocument),
  };
}

export async function portalConfiguration(teacherId, assessmentId) {
  const { assessment } = await assessmentForTeacher(teacherId, assessmentId);
  const secret = await Assessment.findById(assessment._id).select('+accessCodeEncrypted').lean();
  return {
    ...portalSummary(secret),
    accessCode: decryptCode(secret?.accessCodeEncrypted),
  };
}

export async function configurePortal(teacherId, assessmentId, payload) {
  const { assessment } = await assessmentForTeacher(teacherId, assessmentId, { write: true });
  const set = {
    portalEnabled: payload.enabled,
    updatedBy: teacherId,
  };

  if (payload.opensAt !== undefined) set.portalOpensAt = payload.opensAt || null;
  if (payload.closesAt !== undefined) set.portalClosesAt = payload.closesAt || null;
  if (payload.allowResubmission !== undefined) set.allowResubmission = payload.allowResubmission;

  let accessCode = null;
  if (payload.enabled) {
    if (!assessment.publicHash) set.publicHash = crypto.randomBytes(16).toString('hex');
    const secret = await Assessment.findById(assessment._id).select('+accessCodeEncrypted').lean();
    if (payload.rotateCode || !secret?.accessCodeEncrypted) {
      accessCode = createCode();
      set.accessCodeEncrypted = encryptCode(accessCode);
    }
  }

  const updated = await Assessment.findOneAndUpdate(
    ownFilter({ _id: assessment._id, status: { $ne: 'submitted' } }),
    { $set: set },
    { new: true, runValidators: true },
  )
    .select('+accessCodeEncrypted')
    .lean();
  if (!updated) {
    throw new AppError(409, 'ASSESSMENT_SUBMITTED', 'Submitted marks are locked, so the public portal cannot be changed.');
  }

  return {
    ...portalSummary(updated),
    accessCode: accessCode || decryptCode(updated.accessCodeEncrypted),
  };
}

export async function uploadPortalDocument(teacherId, assessmentId, buffer, filename) {
  const { assessment } = await assessmentForTeacher(teacherId, assessmentId, { write: true });
  const safeName = path.basename(String(filename || '').split(/[\\/]/).pop()).replace(/[^\w.\- ]+/g, '_').slice(0, 160);
  if (!safeName || !path.extname(safeName)) {
    throw new AppError(400, 'FILENAME_REQUIRED', 'The uploaded file needs a name and extension.');
  }
  const info = validateDocument(buffer, safeName);
  const uploaded = await uploadDocument(buffer, {
    fileName: `${assessment._id}-${Date.now()}-${safeName}`,
    folder: `/assessments/${assessment.offering}`,
    contentType: info.contentType,
  });

  let updated;
  try {
    updated = await Assessment.findOneAndUpdate(
      ownFilter({ _id: assessment._id, status: { $ne: 'submitted' } }),
      {
        $set: {
          portalDocument: {
            provider: 'imagekit',
            fileId: uploaded.fileId,
            filePath: uploaded.filePath,
            fileName: safeName,
            contentType: uploaded.contentType,
            bytes: uploaded.bytes,
            uploadedAt: uploaded.uploadedAt,
            uploadedBy: teacherId,
          },
          updatedBy: teacherId,
        },
      },
      { new: true },
    ).lean();
  } catch (err) {
    await deleteImage(uploaded.fileId).catch(() => {});
    throw err;
  }
  if (!updated) {
    await deleteImage(uploaded.fileId).catch(() => {});
    throw new AppError(409, 'ASSESSMENT_SUBMITTED', 'Submitted marks are locked, so the portal document cannot be changed.');
  }
  if (assessment.portalDocument?.fileId) {
    await deleteImage(assessment.portalDocument.fileId).catch(() => {});
  }

  return { document: documentDto(updated.portalDocument) };
}

export async function removePortalDocument(teacherId, assessmentId) {
  const { assessment } = await assessmentForTeacher(teacherId, assessmentId, { write: true });
  const updated = await Assessment.findOneAndUpdate(
    ownFilter({ _id: assessment._id, status: { $ne: 'submitted' } }),
    { $set: { portalDocument: null, updatedBy: teacherId } },
    { new: true },
  ).lean();
  if (!updated) {
    throw new AppError(409, 'ASSESSMENT_SUBMITTED', 'Submitted marks are locked, so the portal document cannot be changed.');
  }
  if (assessment.portalDocument?.fileId) {
    await deleteImage(assessment.portalDocument.fileId).catch(() => {});
  }
  return { document: null };
}

async function publicAssessment(hash) {
  if (!/^[a-f0-9]{32}$/i.test(String(hash || ''))) {
    throw new AppError(404, 'ASSESSMENT_PORTAL_NOT_FOUND', 'That assessment link is not valid.');
  }
  const assessment = await Assessment.findOne({
    publicHash: String(hash).toLowerCase(),
    portalEnabled: true,
  })
    .populate({
      path: 'offering',
      populate: [...ASSIGNMENT_POPULATE, { path: 'teacher', select: 'name email' }],
    })
    .lean();
  if (!assessment || assessment.status === 'draft') {
    throw new AppError(404, 'ASSESSMENT_PORTAL_NOT_FOUND', 'That assessment link is not available.');
  }
  if (!['assignment', 'project', 'presentation'].includes(assessment.type)) {
    throw new AppError(403, 'PORTAL_TYPE_RESTRICTED', 'The public portal is only available for assignments, projects, and presentations.');
  }
  return assessment;
}

function publicMeta(assessment) {
  const assignment = assessment.offering && typeof assessment.offering === 'object' ? assessment.offering : null;
  const state = portalState(assessment);
  return {
    title: assessment.title,
    type: assessment.type,
    maxScore: assessment.maxScore,
    dueDate: assessment.dueDate,
    instructions: assessment.instructions || '',
    courseCode: assignment?.course?.code || '',
    courseTitle: assignment?.course?.title || '',
    program: assignment?.program
      ? [assignment.program.code, assignment.program.name].filter(Boolean).join(' · ')
      : '',
    academicYear: assignment?.academicYear?.label || '',
    term: assignment?.term || '',
    teacher: assignment?.teacher?.name || assignment?.teacher?.email || '',
    status: state,
    acceptingSubmissions: state === 'open',
    allowResubmission: assessment.allowResubmission !== false,
    opensAt: assessment.portalOpensAt || null,
    closesAt: assessment.portalClosesAt || null,
    hasDocument: Boolean(assessment.portalDocument?.filePath),
  };
}

function submissionDto(submission) {
  if (!submission) return null;
  return {
    id: String(submission._id),
    studentNumber: submission.studentNumber,
    studentName: submission.studentName,
    fileName: submission.fileName,
    contentType: submission.contentType,
    bytes: submission.bytes,
    note: submission.note || '',
    status: submission.status,
    score: submission.status === 'submitted' ? null : submission.score,
    feedback: submission.status === 'submitted' ? '' : submission.feedback || '',
    submittedAt: submission.submittedAt,
    reviewedAt: submission.reviewedAt,
    revision: submission.revision,
    fileUrl: signedImageUrl(submission.filePath, { expiresIn: 7200 }),
  };
}

function submissionSummary(submission) {
  if (!submission) return null;
  return {
    id: String(submission._id),
    fileName: submission.fileName,
    bytes: submission.bytes,
    status: submission.status,
    submittedAt: submission.submittedAt,
    revision: submission.revision,
    score: submission.status === 'submitted' ? null : submission.score,
    feedback: submission.status === 'submitted' ? '' : submission.feedback || '',
    fileUrl: signedImageUrl(submission.filePath, { expiresIn: 7200 }),
  };
}

export async function portalMeta(hash) {
  const assessment = await publicAssessment(hash);
  return {
    assessment: publicMeta(assessment),
    portal: {
      state: portalState(assessment),
      document: null,
    },
  };
}

async function verifiedStudent(assessment, studentNumber, accessCode) {
  const secret = await Assessment.findById(assessment._id).select('+accessCodeEncrypted').lean();
  const expected = decryptCode(secret?.accessCodeEncrypted);
  if (!expected || !sameCode(expected, String(accessCode || '').trim().toUpperCase())) {
    throw new AppError(401, 'ACCESS_CODE_INVALID', 'The student ID or assessment code is not correct.');
  }

  const number = String(studentNumber || '').trim().toUpperCase();
  const student = await Student.findOne({ studentId: number })
    .select('studentId firstName middleName lastName fullName program batch level photo')
    .populate('program', 'code name')
    .populate('batch', 'code name')
    .lean();
  if (!student) {
    throw new AppError(401, 'ACCESS_CODE_INVALID', 'The student ID or assessment code is not correct.');
  }
  const registration = await CourseRegistration.findOne({
    offering: assessment.offering?._id ?? assessment.offering,
    student: student._id,
    status: 'registered',
  })
    .select('_id')
    .lean();
  if (!registration) {
    throw new AppError(403, 'STUDENT_NOT_ENROLLED', 'That student is not registered in this course.');
  }
  return student;
}

function studentDto(student) {
  return {
    id: String(student._id),
    studentNumber: student.studentId,
    name: studentName(student),
    level: student.level ?? null,
    program: student.program ? [student.program.code, student.program.name].filter(Boolean).join(' · ') : '',
    batch: student.batch ? [student.batch.code, student.batch.name].filter(Boolean).join(' · ') : '',
    photoUrl: student.photo?.status === 'active' ? signedImageUrl(student.photo.filePath, { expiresIn: 3600 }) : null,
  };
}

export async function verifyPortalAccess(hash, payload) {
  const assessment = await publicAssessment(hash);
  const student = await verifiedStudent(assessment, payload.studentNumber, payload.accessCode);
  const submission = await AssessmentSubmission.findOne({
    assessment: assessment._id,
    student: student._id,
  }).lean();
  const state = portalState(assessment);
  const canResubmit =
    state === 'open' &&
    assessment.allowResubmission !== false &&
    (!submission || submission.status !== 'graded');

  return {
    assessment: publicMeta(assessment),
    student: studentDto(student),
    submission: submissionSummary(submission),
    documentUrl: assessment.portalDocument?.filePath
      ? signedImageUrl(assessment.portalDocument.filePath, { expiresIn: 7200 })
      : null,
    canSubmit: state === 'open' && (!submission || canResubmit),
    canResubmit: Boolean(submission && canResubmit),
  };
}

export async function receivePortalSubmission(hash, payload, buffer, { ip } = {}) {
  const assessment = await publicAssessment(hash);
  if (portalState(assessment) !== 'open') {
    throw new AppError(409, 'PORTAL_CLOSED', 'This assessment is not accepting submissions any more.');
  }
  const student = await verifiedStudent(assessment, payload.studentNumber, payload.accessCode);
  const existing = await AssessmentSubmission.findOne({
    assessment: assessment._id,
    student: student._id,
  }).lean();
  if (existing && assessment.allowResubmission === false) {
    throw new AppError(409, 'RESUBMISSION_CLOSED', 'A submission has already been received for this student.');
  }
  if (existing?.status === 'graded') {
    throw new AppError(409, 'SUBMISSION_GRADED', 'This submission has already been graded and cannot be replaced.');
  }

  const safeName = path.basename(String(payload.filename || '').split(/[\\/]/).pop()).replace(/[^\w.\- ]+/g, '_').slice(0, 160);
  if (!safeName || !path.extname(safeName)) {
    throw new AppError(400, 'FILENAME_REQUIRED', 'Choose a file with a name and extension.');
  }
  const info = validateDocument(buffer, safeName);
  const uploaded = await uploadDocument(buffer, {
    fileName: `${assessment._id}-${student._id}-${Date.now()}-${safeName}`,
    folder: `/assessment-submissions/${assessment._id}`,
    contentType: info.contentType,
  });

  let saved;
  try {
    if (existing) {
      saved = await AssessmentSubmission.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            fileName: safeName,
            fileId: uploaded.fileId,
            filePath: uploaded.filePath,
            contentType: uploaded.contentType,
            bytes: uploaded.bytes,
            note: payload.note || '',
            status: 'submitted',
            score: null,
            feedback: '',
            submittedAt: new Date(),
            reviewedBy: null,
            reviewedAt: null,
          },
          $inc: { revision: 1 },
        },
        { new: true, runValidators: true },
      ).lean();
    } else {
      saved = await AssessmentSubmission.create({
        assessment: assessment._id,
        offering: assessment.offering._id,
        student: student._id,
        studentNumber: student.studentId,
        studentName: studentName(student),
        fileName: safeName,
        fileId: uploaded.fileId,
        filePath: uploaded.filePath,
        contentType: uploaded.contentType,
        bytes: uploaded.bytes,
        note: payload.note || '',
        submittedAt: new Date(),
      });
      saved = saved.toObject();
      await Assessment.updateOne({ _id: assessment._id }, { $inc: { submissionCount: 1 } });
    }
  } catch (err) {
    await deleteImage(uploaded.fileId).catch(() => {});
    throw err;
  }

  if (existing?.fileId) {
    await deleteImage(existing.fileId).catch(() => {});
  }

  const teacherId = assessment.offering?.teacher?._id ?? assessment.offering?.teacher;
  void notifyUser(teacherId, {
    type: 'assessment_submission',
    title: 'New assessment submission',
    body: `${studentName(student)} submitted ${safeName} for ${assessment.title}.`,
    actorName: studentName(student),
    meta: {
      assessmentId: String(assessment._id),
      submissionId: String(saved._id),
      course: assessment.offering?.course?.code || '',
    },
  });
  void notifyAdmins({
    type: 'assessment_submission',
    title: 'Assessment submission received',
    body: `${studentName(student)} submitted work for ${assessment.title}.`,
    actorRole: 'STUDENT',
    actorName: studentName(student),
    meta: {
      assessmentId: String(assessment._id),
      submissionId: String(saved._id),
      studentNumber: student.studentId,
      ip: ip || null,
    },
  });

  return {
    assessment: publicMeta(assessment),
    student: studentDto(student),
    submission: submissionSummary(saved),
  };
}

function submissionRow(submission) {
  const fileUrl = signedImageUrl(submission.filePath, { expiresIn: 7200 });
  const downloadUrl = fileUrl ? `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}ik-attachment=true` : null;
  return {
    id: String(submission._id),
    student: {
      id: String(submission.student?._id ?? submission.student),
      studentNumber: submission.studentNumber,
      name: submission.studentName,
      level: submission.student?.level ?? null,
      program: submission.student?.program
        ? [submission.student.program.code, submission.student.program.name].filter(Boolean).join(' · ')
        : '',
      batch: submission.student?.batch
        ? [submission.student.batch.code, submission.student.batch.name].filter(Boolean).join(' · ')
        : '',
      photoUrl:
        submission.student?.photo?.status === 'active'
          ? signedImageUrl(submission.student.photo.filePath, { expiresIn: 3600 })
          : null,
    },
    fileName: submission.fileName,
    contentType: submission.contentType,
    bytes: submission.bytes,
    note: submission.note || '',
    status: submission.status,
    score: submission.score,
    feedback: submission.feedback || '',
    submittedAt: submission.submittedAt,
    reviewedAt: submission.reviewedAt,
    revision: submission.revision,
    fileUrl,
    downloadUrl,
  };
}

export async function listSubmissions(teacherId, assessmentId, query) {
  const { assessment, assignment } = await assessmentForTeacher(teacherId, assessmentId);
  const base = { assessment: assessment._id };
  if (query.status !== 'all') base.status = query.status;
  if (query.search) {
    const rx = new RegExp(escapeRegex(String(query.search).trim()), 'i');
    base.$or = [{ studentName: rx }, { studentNumber: rx }];
  }
  const [rows, total, statusRows, expected] = await Promise.all([
    AssessmentSubmission.find(ownFilter(base))
      .populate({
        path: 'student',
        select: 'studentId fullName level program batch photo',
        populate: [
          { path: 'program', select: 'code name' },
          { path: 'batch', select: 'code name' },
        ],
      })
      .sort({ submittedAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    AssessmentSubmission.countDocuments(ownFilter(base)),
    AssessmentSubmission.aggregate([{ $match: { assessment: assessment._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    CourseRegistration.countDocuments({ offering: assignment._id, status: 'registered' }),
  ]);
  const counts = { all: 0, submitted: 0, graded: 0, returned: 0 };
  for (const row of statusRows) {
    if (counts[row._id] !== undefined) counts[row._id] = row.count;
    counts.all += row.count;
  }

  return {
    assessment: {
      id: String(assessment._id),
      title: assessment.title,
      maxScore: assessment.maxScore,
      status: assessment.status,
      portal: portalSummary(assessment),
    },
    submissions: rows.map(submissionRow),
    counts: { ...counts, expected, missing: Math.max(0, expected - counts.all) },
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function reviewSubmission(teacherId, submissionId, payload) {
  const submission = await AssessmentSubmission.findById(submissionId).lean();
  if (!submission) throw new AppError(404, 'SUBMISSION_NOT_FOUND', 'That submission was not found.');
  const { assessment } = await assessmentForTeacher(teacherId, submission.assessment, { write: true });
  if (payload.score !== null && payload.score !== undefined && payload.score > assessment.maxScore) {
    throw new AppError(400, 'SCORE_TOO_HIGH', `A score cannot be above the maximum of ${assessment.maxScore}.`);
  }
  const updated = await AssessmentSubmission.findByIdAndUpdate(
    submission._id,
    {
      $set: {
        status: payload.status,
        score: payload.status === 'submitted' ? null : payload.score,
        feedback: payload.feedback || '',
        reviewedBy: teacherId,
        reviewedAt: payload.status === 'submitted' ? null : new Date(),
      },
    },
    { new: true, runValidators: true },
  )
    .populate({
      path: 'student',
      select: 'studentId fullName level program batch photo',
      populate: [
        { path: 'program', select: 'code name' },
        { path: 'batch', select: 'code name' },
      ],
    })
    .lean();

  if (payload.score !== null && payload.score !== undefined && submission.student) {
    try {
      const offering = await CourseOffering.findById(assessment.offering).lean();
      if (offering) {
        const studentId = submission.student?._id ?? submission.student;
        const existingResult = await Result.findOne({
          offering: offering._id,
          student: studentId,
        }).lean();

        if (!existingResult || existingResult.status === 'draft') {
          const components = (existingResult?.components || [])
            .filter((c) => String(c.name || '').trim().toLowerCase() !== String(assessment.title || '').trim().toLowerCase())
            .map((c) => ({ name: c.name, max: c.max, score: c.score }));
          components.push({ name: assessment.title, max: assessment.maxScore, score: Number(payload.score) });
          await Result.findOneAndUpdate(
            { offering: offering._id, student: studentId },
            {
              $set: { components, enteredBy: teacherId, status: 'draft' },
              $setOnInsert: {
                student: studentId,
                offering: offering._id,
                course: offering.course?._id ?? offering.course,
                academicYear: offering.academicYear?._id ?? offering.academicYear,
                term: offering.term,
                creditHours: offering.creditHours,
              },
            },
            { upsert: true },
          );
        }
      }
    } catch {
      // Non-fatal if course mark sync encounters race condition
    }
  }

  return { submission: submissionRow(updated) };
}
