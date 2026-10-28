import { Student } from '../models/Student.js';
import { StudentIdCard } from '../models/IdCard.js';
import { Result } from '../models/Records.js';
import { CourseOffering } from '../models/Offering.js';
import { Program, Batch, Department } from '../models/AcademicStructure.js';
import { generateIdCardPdf } from '../services/id-card-pdf.service.js';
import { fetchAssetBuffer } from '../services/document.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';

export const listIdCards = asyncHandler(async (req, res) => {
  const { batch, department, program, search, page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const query = {};
  if (batch) query['studentSnapshot.batchCode'] = batch;
  if (program) query['studentSnapshot.programName'] = program;
  if (department) query['studentSnapshot.departmentName'] = department;

  if (search) {
    const rx = new RegExp(search.trim(), 'i');
    query.$or = [
      { 'studentSnapshot.fullName': rx },
      { 'studentSnapshot.studentId': rx },
    ];
  }

  const [rows, total] = await Promise.all([
    StudentIdCard.find(query)
      .populate('student')
      .populate('issuedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    StudentIdCard.countDocuments(query),
  ]);

  res.json({ rows, total, page: Number(page), limit: Number(limit) });
});

export const getStudentCardEligibility = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const student = await Student.findById(studentId)
    .populate('program')
    .populate('department')
    .populate('batch')
    .lean();

  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student record was not found.');

  const existingCount = await StudentIdCard.countDocuments({ student: student._id });
  const hasPhoto = Boolean(student.photo?.url || student.photo?.filePath);

  res.json({
    student,
    issueCount: existingCount,
    canIssue: existingCount < 4 && hasPhoto,
    maxIssues: 4,
    remainingIssues: Math.max(0, 4 - existingCount),
    hasPhoto,
  });
});

export const issueIdCard = asyncHandler(async (req, res) => {
  const { studentId, notes } = req.body;
  if (!studentId) throw new AppError(400, 'STUDENT_REQUIRED', 'Student ID is required.');

  const student = await Student.findById(studentId)
    .populate('program')
    .populate('department')
    .populate('batch');

  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'Student not found.');

  // Strict Photo Requirement: "If that student have no image dont make prepare okay id"
  const hasPhoto = Boolean(student.photo?.url || student.photo?.filePath);
  if (!hasPhoto) {
    throw new AppError(400, 'PHOTO_REQUIRED', 'Student must have an uploaded photo before an ID card can be prepared or issued.');
  }

  // Strict 4-Issue Limit: "and the student only issued for 4 times"
  const existingCount = await StudentIdCard.countDocuments({ student: student._id });
  if (existingCount >= 4) {
    throw new AppError(400, 'ISSUE_LIMIT_REACHED', 'This student has already reached the maximum limit of 4 ID card issuances.');
  }

  // Calculate promoted stages: find all offerings with published results or student level
  const offerings = await CourseOffering.find({ program: student.program?._id }).select('_id level').lean();
  const offLevelMap = new Map(offerings.map((o) => [String(o._id), o.level]));
  const results = await Result.find({ student: student._id, status: { $in: ['submitted', 'approved', 'published'] } }).lean();

  const passedStages = new Set();
  for (const r of results) {
    const lvl = offLevelMap.get(String(r.offering));
    if (lvl) passedStages.add(lvl);
  }
  // If student is level 2, year 1 was promoted; if level 3, year 1 & 2 promoted, etc.
  for (let l = 1; l < (student.level || 1); l++) {
    passedStages.add(l);
  }

  const promotedStages = [...passedStages].sort((a, b) => a - b);
  const issueNumber = existingCount + 1;

  const idCard = await StudentIdCard.create({
    student: student._id,
    studentSnapshot: {
      studentId: student.studentId,
      fullName: student.fullName,
      photo: student.photo,
      qualificationType: student.qualificationType || student.program?.qualificationType || 'degree',
      departmentName: student.department?.name || '',
      programName: student.program?.name || '',
      batchCode: student.batch?.code || '2019',
      admissionYear: '2019',
    },
    issueNumber,
    promotedStages,
    currentLevel: student.level || 1,
    qualificationType: student.qualificationType || student.program?.qualificationType || 'degree',
    issuedAt: new Date(),
    issuedBy: req.user?.id || null,
    notes: notes || '',
  });

  audit({
    req,
    action: 'registrar.id_card.issued',
    targetType: 'StudentIdCard',
    targetId: idCard._id,
    meta: { studentId: student.studentId, issueNumber },
  });

  res.status(201).json({
    success: true,
    message: `Student ID Card #${issueNumber} of 4 issued successfully!`,
    idCard,
  });
});

export const downloadIdCardPdf = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const idCard = await StudentIdCard.findById(id).populate('student');
  if (!idCard) throw new AppError(404, 'NOT_FOUND', 'ID card record not found.');

  let photoBuffer = null;
  if (idCard.studentSnapshot?.photo?.filePath) {
    try {
      photoBuffer = await fetchAssetBuffer(idCard.studentSnapshot.photo, { jpeg: true });
    } catch {
      photoBuffer = null;
    }
  }

  const pdf = await generateIdCardPdf({ idCard, photoBuffer });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="ID_Card_${idCard.studentSnapshot?.studentId || id}.pdf"`);
  res.send(pdf);
});

export const previewIdCardPdf = asyncHandler(async (req, res) => {
  const { studentId } = req.body;
  if (!studentId) throw new AppError(400, 'STUDENT_REQUIRED', 'Student ID is required.');

  const student = await Student.findById(studentId)
    .populate('program')
    .populate('department')
    .populate('batch');

  if (!student) throw new AppError(404, 'NOT_FOUND', 'Student record not found.');

  const hasPhoto = Boolean(student.photo?.url || student.photo?.filePath);
  if (!hasPhoto) {
    throw new AppError(400, 'PHOTO_REQUIRED', 'Student must have an uploaded photo before an ID card preview can be prepared.');
  }

  const existingCount = await StudentIdCard.countDocuments({ student: student._id });
  const issueNumber = Math.min(4, existingCount + 1);

  const passedStages = new Set();
  for (let l = 1; l < (student.level || 1); l++) {
    passedStages.add(l);
  }

  let photoBuffer = null;
  if (student.photo?.filePath) {
    try {
      photoBuffer = await fetchAssetBuffer(student.photo, { jpeg: true });
    } catch {
      photoBuffer = null;
    }
  }

  const mockCard = {
    studentSnapshot: {
      studentId: student.studentId,
      fullName: student.fullName,
      photo: student.photo,
      qualificationType: student.qualificationType || student.program?.qualificationType || 'degree',
      departmentName: student.department?.name || '',
      programName: student.program?.name || '',
      batchCode: student.batch?.code || '2019',
      admissionYear: '2019',
    },
    issueNumber,
    promotedStages: [...passedStages],
    currentLevel: student.level || 1,
    qualificationType: student.qualificationType || student.program?.qualificationType || 'degree',
    issuedAt: new Date(),
  };

  const pdf = await generateIdCardPdf({ idCard: mockCard, photoBuffer });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="ID_Card_Preview.pdf"');
  res.send(pdf);
});
