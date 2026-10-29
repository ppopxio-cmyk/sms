import { Student } from '../models/Student.js';
import { StudentIdCard } from '../models/IdCard.js';
import { Result } from '../models/Records.js';
import { CourseOffering } from '../models/Offering.js';
import { Program, Batch, Department } from '../models/AcademicStructure.js';
import { generateIdCardPdf, generateBulkIdCardsLandscapePdf } from '../services/id-card-pdf.service.js';
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
    canIssue: existingCount < 2 && hasPhoto,
    maxIssues: 2,
    remainingIssues: Math.max(0, 2 - existingCount),
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

  // Strict 2-Issue Limit: "bulking only 2 times okay... and counter is reached in single issued too remove print and say reached"
  const existingCount = await StudentIdCard.countDocuments({ student: student._id });
  if (existingCount >= 2) {
    throw new AppError(400, 'ISSUE_LIMIT_REACHED', 'This student has already reached the maximum limit of 2 ID card issuances.');
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
      gender: student.sex || student.gender || '—',
      phone: student.phone || '—',
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
    message: `Student ID Card #${issueNumber} of 2 issued successfully!`,
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
      gender: student.sex || student.gender || '—',
      phone: student.phone || '—',
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

export const getProgrammeCardCohortSummary = asyncHandler(async (req, res) => {
  const { programId, batchId } = req.query;
  if (!programId || !batchId) {
    throw new AppError(400, 'PARAMS_REQUIRED', 'Program and Batch IDs are required.');
  }

  const [program, batch] = await Promise.all([
    Program.findById(programId).populate('department').lean(),
    Batch.findById(batchId).lean(),
  ]);

  if (!program) throw new AppError(404, 'PROGRAM_NOT_FOUND', 'Program not found.');
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'Batch not found.');

  // Find all students in this cohort
  const students = await Student.find({ program: programId, batch: batchId, studentStatus: { $ne: 'archived' } })
    .sort({ studentId: 1 })
    .lean();

  const studentIds = students.map((s) => s._id);

  // Load all issued ID cards for these students
  const idCards = await StudentIdCard.find({ student: { $in: studentIds } })
    .sort({ createdAt: -1 })
    .lean();

  const cardsByStudent = new Map();
  for (const c of idCards) {
    const sId = String(c.student);
    if (!cardsByStudent.has(sId)) {
      cardsByStudent.set(sId, []);
    }
    cardsByStudent.get(sId).push(c);
  }

  let photoCount = 0;
  let issuedCount = 0;
  let maxCohortIssues = 0;

  const studentRows = students.map((s) => {
    const sId = String(s._id);
    const studentCards = cardsByStudent.get(sId) || [];
    const latestCard = studentCards[0] || null;
    const issueCount = studentCards.length;
    const printCount = latestCard?.printCount || 0;
    const hasPhoto = Boolean(s.photo?.url || s.photo?.filePath);

    if (hasPhoto) photoCount++;
    if (issueCount > 0) issuedCount++;
    if (issueCount > maxCohortIssues) maxCohortIssues = issueCount;

    return {
      id: String(s._id),
      studentId: s.studentId,
      fullName: s.fullName,
      gender: s.gender,
      level: s.level || 1,
      photo: s.photo,
      hasPhoto,
      issueCount,
      printCount,
      canIssue: issueCount < 2 && hasPhoto,
      canPrint: issueCount > 0 && printCount < 2,
      limitReached: issueCount >= 2 || printCount >= 2,
      latestCard: latestCard
        ? {
            id: String(latestCard._id),
            issueNumber: latestCard.issueNumber,
            printCount: latestCard.printCount || 0,
            issuedAt: latestCard.issuedAt,
          }
        : null,
    };
  });

  const totalStudents = students.length;
  const allHavePhotos = totalStudents > 0 && photoCount === totalStudents;
  const allIssued = totalStudents > 0 && issuedCount === totalStudents;
  const bulkCount = maxCohortIssues;
  const bulkLimitReached = bulkCount >= 2;
  const canBulkIssue = bulkCount < 2 && allHavePhotos && totalStudents > 0;
  const canBulkPrint = bulkCount > 0 && bulkCount <= 2 && allHavePhotos;

  res.json({
    program: {
      id: String(program._id),
      code: program.code,
      name: program.name,
      qualificationType: program.qualificationType,
      durationYears: program.durationYears,
      department: program.department ? { id: String(program.department._id), name: program.department.name, code: program.department.code } : null,
    },
    batch: {
      id: String(batch._id),
      code: batch.code,
      name: batch.name,
      category: batch.category,
    },
    totalStudents,
    photoCount,
    allHavePhotos,
    issuedCount,
    allIssued,
    bulkCount,
    canBulkIssue,
    canBulkPrint,
    bulkLimitReached,
    students: studentRows,
    history: idCards.slice(0, 30).map((c) => ({
      id: String(c._id),
      studentId: c.studentSnapshot?.studentId,
      fullName: c.studentSnapshot?.fullName,
      issueNumber: c.issueNumber,
      printCount: c.printCount || 0,
      promotedStages: c.promotedStages,
      issuedAt: c.issuedAt,
    })),
  });
});

export const printIdCard = asyncHandler(async (req, res) => {
  const idCard = await StudentIdCard.findById(req.params.id);
  if (!idCard) throw new AppError(404, 'NOT_FOUND', 'ID card record not found.');
  if ((idCard.printCount || 0) >= 2) {
    throw new AppError(400, 'PRINT_LIMIT_REACHED', 'This ID card has reached its printing limit of 2 times.');
  }
  idCard.printCount = (idCard.printCount || 0) + 1;
  await idCard.save();

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
  res.setHeader('Content-Disposition', `inline; filename="ID_Card_${idCard.studentSnapshot?.studentId || 'print'}.pdf"`);
  res.send(pdf);
});

export const bulkIssueIdCards = asyncHandler(async (req, res) => {
  const { programId, batchId } = req.body;
  if (!programId || !batchId) {
    throw new AppError(400, 'PARAMS_REQUIRED', 'Program ID and Batch ID are required.');
  }

  const [program, batch] = await Promise.all([
    Program.findById(programId).populate('department').lean(),
    Batch.findById(batchId).lean(),
  ]);
  if (!program || !batch) throw new AppError(404, 'NOT_FOUND', 'Program or Batch not found.');

  const students = await Student.find({
    program: programId,
    batch: batchId,
    studentStatus: { $ne: 'archived' },
  })
    .populate('program')
    .populate('department')
    .populate('batch')
    .sort({ studentId: 1 });

  if (!students.length) {
    throw new AppError(404, 'NO_STUDENTS', 'No students found in this cohort.');
  }

  const studentIds = students.map((s) => s._id);
  const existingCards = await StudentIdCard.find({ student: { $in: studentIds } }).lean();

  const cardsByStudent = new Map();
  for (const c of existingCards) {
    const sId = String(c.student);
    if (!cardsByStudent.has(sId)) cardsByStudent.set(sId, []);
    cardsByStudent.get(sId).push(c);
  }

  let maxCohortIssues = 0;
  for (const s of students) {
    const count = cardsByStudent.get(String(s._id))?.length || 0;
    if (count > maxCohortIssues) maxCohortIssues = count;
  }

  if (maxCohortIssues >= 2) {
    throw new AppError(400, 'BULK_LIMIT_REACHED', 'Bulk ID issuance for this programme cohort has already reached the maximum limit of 2 times.');
  }

  const offerings = await CourseOffering.find({ program: programId }).select('_id level').lean();
  const offLevelMap = new Map(offerings.map((o) => [String(o._id), o.level]));

  const createdCards = [];
  for (const student of students) {
    const hasPhoto = Boolean(student.photo?.url || student.photo?.filePath);
    if (!hasPhoto) continue;

    const sExisting = cardsByStudent.get(String(student._id)) || [];
    if (sExisting.length >= 2) continue;

    const results = await Result.find({ student: student._id, status: { $in: ['submitted', 'approved', 'published'] } }).lean();
    const passedStages = new Set();
    for (const r of results) {
      const lvl = offLevelMap.get(String(r.offering));
      if (lvl) passedStages.add(lvl);
    }
    for (let l = 1; l < (student.level || 1); l++) {
      passedStages.add(l);
    }
    const promotedStages = [...passedStages].sort((a, b) => a - b);
    const issueNumber = sExisting.length + 1;

    const newCard = await StudentIdCard.create({
      student: student._id,
      studentSnapshot: {
        studentId: student.studentId,
        fullName: student.fullName,
        photo: student.photo,
        qualificationType: student.qualificationType || student.program?.qualificationType || 'degree',
        departmentName: student.department?.name || program.department?.name || '',
        programName: student.program?.name || program.name || '',
        batchCode: student.batch?.code || batch.code || '2019',
        category: student.batch?.category || batch.category || 'regular',
        admissionYear: '2019',
        admissionDate: student.admissionDate || '2019-01-10',
        completionDate: student.completionDate || '2019-12-31',
        gender: student.sex || student.gender || '—',
        email: student.email,
        phone: student.phone || '—',
        studentStatus: student.studentStatus,
      },
      issueNumber,
      promotedStages,
      currentLevel: student.level || 1,
      qualificationType: student.qualificationType || student.program?.qualificationType || 'degree',
      issuedAt: new Date(),
      issuedBy: req.user.id,
      status: 'active',
    });

    createdCards.push(newCard);
  }

  res.status(201).json({
    success: true,
    issuedCount: createdCards.length,
    message: `Successfully issued ${createdCards.length} student ID cards in bulk.`,
  });
});

export const downloadBulkIdCardsPdf = asyncHandler(async (req, res) => {
  const { programId, batchId } = req.query;
  if (!programId || !batchId) {
    throw new AppError(400, 'PARAMS_REQUIRED', 'Program and Batch IDs are required.');
  }

  const [program, batch] = await Promise.all([
    Program.findById(programId).populate('department').lean(),
    Batch.findById(batchId).lean(),
  ]);

  if (!program || !batch) throw new AppError(404, 'NOT_FOUND', 'Program or Batch not found.');

  const students = await Student.find({ program: programId, batch: batchId, studentStatus: { $ne: 'archived' } })
    .populate('program')
    .populate('department')
    .populate('batch')
    .sort({ studentId: 1 });

  if (!students.length) throw new AppError(404, 'NO_STUDENTS', 'No students found in this cohort.');

  // Find offerings & compute results for promotion records
  const offerings = await CourseOffering.find({ program: programId }).select('_id level').lean();
  const offLevelMap = new Map(offerings.map((o) => [String(o._id), o.level]));

  const cardsWithPhotos = [];
  for (const student of students) {
    const existingCount = await StudentIdCard.countDocuments({ student: student._id });
    const issueNumber = Math.min(4, Math.max(1, existingCount || 1));

    const results = await Result.find({ student: student._id, status: { $in: ['submitted', 'approved', 'published'] } }).lean();
    const passedStages = new Set();
    for (const r of results) {
      const lvl = offLevelMap.get(String(r.offering));
      if (lvl) passedStages.add(lvl);
    }
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

    const card = {
      student: student._id,
      studentSnapshot: {
        studentId: student.studentId,
        fullName: student.fullName,
        photo: student.photo,
        qualificationType: student.qualificationType || student.program?.qualificationType || 'degree',
        departmentName: student.department?.name || program.department?.name || '',
        programName: student.program?.name || program.name || '',
        batchCode: student.batch?.code || batch.code || '2019',
        category: student.batch?.category || batch.category || 'regular',
        admissionYear: '2019',
        admissionDate: student.admissionDate || '2019-01-10',
        completionDate: student.completionDate || '2019-12-31',
        gender: student.sex || student.gender || '—',
        email: student.email,
        phone: student.phone || '—',
        studentStatus: student.studentStatus,
      },
      issueNumber,
      promotedStages: [...passedStages].sort((a, b) => a - b),
      currentLevel: student.level || 1,
      issuedAt: new Date(),
    };

    cardsWithPhotos.push({ idCard: card, photoBuffer });
  }

  const pdf = await generateBulkIdCardsLandscapePdf({
    cardsWithPhotos,
    batchInfo: {
      programName: program.name,
      batchCode: batch.code,
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="All_IDs_Landscape_${program.code}_${batch.code}.pdf"`);
  res.send(pdf);
});
