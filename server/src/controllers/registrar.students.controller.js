import { Student, Enrollment, ProgressionRecord } from '../models/Student.js';
import { Program, Department, Batch, AcademicYear } from '../models/AcademicStructure.js';
import { CourseRegistration, CourseOffering } from '../models/Offering.js';
import { Result, AttendanceRecord } from '../models/Records.js';
import { Certificate, Transcript } from '../models/Documents.js';
import { Counter } from '../models/RegistrarSupport.js';
import { User } from '../models/User.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signedImageUrl, uploadImage, deleteImage, validateImage } from '../services/imagekit.service.js';
import { sendCode } from '../services/codeDelivery.js';
import { checkCode, resendWaitMessage } from '../services/code.service.js';
import { notifyAdmins, notifyUsers } from '../services/notification.service.js';
import { resolveTeacherIdsForPlacement } from '../services/teacherAccess.service.js';
import { sendStudentAdmissionEmail } from '../services/mail.service.js';
import { buildStudentProfileExport } from '../services/studentExport.service.js';
import { logger } from '../utils/logger.js';
import { pageOf, sortOf, searchFilter, mergeFilters, paged, ownFilter, canonicalNow } from '../services/registrar.helpers.js';
import { normalizePhone } from '../utils/phone.js';

const STUDENT_SORT = ['createdAt', 'updatedAt', 'studentId', 'fullName', 'level', 'admissionDate'];

function photoView(photo) {
  if (!photo) return null;
  const usable = photo.status !== 'missing';
  const url = usable && photo.filePath ? signedImageUrl(photo.filePath, { expiresIn: 3600 }) : usable ? photo.url : null;
  const thumbnailUrl = usable
    ? photo.filePath
      ? signedImageUrl(photo.filePath, {
          transformation: [{ width: 160, height: 160, crop: 'maintain_ratio', focus: 'face' }],
          expiresIn: 3600,
        })
      : photo.thumbnailUrl
    : null;
  return { ...photo, url, thumbnailUrl };
}

export const studentView = (student) => {
  const photo = photoView(student.photo);
  return {
    ...student,
    id: String(student._id),
    studentCategory: student.studentCategory || 'regular',
    photo,
    photoUrl: photo?.thumbnailUrl || photo?.url || null,
    program: student.program
      ? { id: String(student.program._id), code: student.program.code, name: student.program.name, qualificationType: student.program.qualificationType }
      : null,
    department: student.department
      ? { id: String(student.department._id), code: student.department.code, name: student.department.name }
      : null,
    batch: student.batch ? { id: String(student.batch._id), code: student.batch.code, name: student.batch.name } : null,
    admissionAcademicYear: student.admissionAcademicYear
      ? { id: String(student.admissionAcademicYear._id), label: student.admissionAcademicYear.label }
      : null,
    _id: undefined,
  };
};

async function loadOptions(programId, departmentId, batchId, category = 'regular') {
  const program = await Program.findById(programId).lean();
  if (!program || !program.active) throw new AppError(400, 'PROGRAM_INVALID', 'Choose an active programme.');
  const department = await Department.findById(departmentId).lean();
  if (!department || !department.active) throw new AppError(400, 'DEPARTMENT_INVALID', 'Choose an active department.');
  if (String(program.department) !== String(department._id)) {
    throw new AppError(400, 'PROGRAM_DEPARTMENT_MISMATCH', 'That programme does not belong to the selected department.');
  }
  const categories = program.categories?.length ? program.categories : ['regular', 'extension'];
  if (!categories.includes(category)) {
    throw new AppError(409, 'PROGRAM_CATEGORY', 'This programme is not offered in the selected regular/extension stream.');
  }

  // Placement is one choice: department, programme and stream decide the batch.
  // When the Registrar has not picked one, the latest existing intake is used so
  // the student always lands in a batch instead of being left unassigned.
  let batch = null;
  if (batchId) {
    batch = await Batch.findById(batchId).lean();
    if (!batch || String(batch.program) !== String(program._id)) {
      throw new AppError(400, 'BATCH_INVALID', 'Choose a batch that belongs to this programme.');
    }
    if ((batch.category || 'regular') !== category) {
      throw new AppError(409, 'BATCH_CATEGORY', 'That batch belongs to a different regular/extension stream.');
    }
  } else {
    batch = await Batch.findOne(ownFilter({ program: program._id, category }))
      .sort({ createdAt: -1 })
      .lean();
  }
  return { program, department, batch };
}

function validateLevel(program, level) {
  if (program.qualificationType === 'diploma') {
    const allowed = program.levels?.length ? program.levels : [1, 2, 3, 4];
    if (!allowed.includes(Number(level))) {
      throw new AppError(400, 'LEVEL_INVALID', `Choose a diploma level from ${allowed.join(', ')}.`);
    }
    return;
  }
  if (program.qualificationType === 'degree') {
    const maximum = Number(program.durationYears) || 1;
    if (level < 1 || level > maximum) {
      throw new AppError(400, 'LEVEL_INVALID', `A degree programme has levels 1 to ${maximum}.`);
    }
    return;
  }
  if (level !== 1) throw new AppError(400, 'LEVEL_INVALID', 'A short-term programme only has level 1.');
}

async function nextStudentId({ program, batch }) {
  if (!batch) {
    // If no batch was explicitly selected, find the latest batch for this program (any status)
    const existingBatch = await Batch.findOne(ownFilter({ program: program._id }))
      .sort({ createdAt: -1 })
      .lean();
    if (!existingBatch) {
      throw new AppError(409, 'BATCH_REQUIRED', 'Create a batch for this programme before admitting students.');
    }
    batch = existingBatch;
  }
  const programCode = String(program.code || '').trim().toUpperCase();
  const rawBatchCode = String(batch.code || '').trim().toUpperCase();
  const batchCode = rawBatchCode || String(batch.admissionAcademicYear || '').slice(-4) || 'BATCH';
  const prefix = `${programCode}-${batchCode}`.slice(0, 45).replace(/-+$/, '');

  // Find the highest existing sequential number for this prefix (e.g. CS-2024-001)
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existingStudents = await Student.find({
    studentId: new RegExp(`^${escapedPrefix}-\\d+$`, 'i'),
  })
    .select('studentId')
    .lean();

  let maxSeq = 0;
  for (const s of existingStudents) {
    const match = s.studentId?.match(/-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!Number.isNaN(num) && num > maxSeq) maxSeq = num;
    }
  }

  const counter = await Counter.findOneAndUpdate(
    { key: `sid:${program._id}:${batchCode}` },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  let nextSeq = counter.value;
  if (nextSeq <= maxSeq) {
    nextSeq = maxSeq + 1;
    await Counter.updateOne({ key: `sid:${program._id}:${batchCode}` }, { value: nextSeq });
  }

  return `${prefix}-${String(nextSeq).padStart(3, '0')}`;
}

async function assertCapacity(program) {
  if (!program.capacity) return;
  const current = await Student.countDocuments({ program: program._id, studentStatus: 'active' });
  if (current >= program.capacity) {
    throw new AppError(409, 'PROGRAM_FULL', `${program.name} has reached its capacity of ${program.capacity} students.`);
  }
}

async function assertEmailAvailable(email, excludeId) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new AppError(400, 'EMAIL_REQUIRED', 'A student email address is required.');
  if (!/^[\w.%+-]+@gmail\.com$/i.test(normalized)) {
    throw new AppError(400, 'EMAIL_NOT_GMAIL', 'Only Gmail addresses are accepted for student records.');
  }
  const duplicate = await Student.findOne(
    ownFilter({ email: normalized, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }),
  )
    .select('studentId')
    .lean();
  if (duplicate) {
    throw new AppError(
      409,
      'STUDENT_EMAIL_EXISTS',
      `That email address already belongs to student ${duplicate.studentId}.`,
    );
  }
  return normalized;
}

async function assertPhoneAvailable(phone, excludeId) {
  const normalized = normalizePhone(phone);
  if (!normalized) return '';
  const duplicate = await Student.findOne(
    ownFilter({ phone: normalized, ...(excludeId ? { _id: { $ne: excludeId } } : {}) }),
  )
    .select('studentId')
    .lean();
  if (duplicate) {
    throw new AppError(
      409,
      'STUDENT_PHONE_EXISTS',
      `That phone number already belongs to student ${duplicate.studentId}.`,
    );
  }
  return normalized;
}

export const listStudents = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  const statusFilter = query.status === 'all'
    ? null
    : query.status
      ? { studentStatus: query.status }
      : { studentStatus: { $ne: 'graduated' } };

  const filter = mergeFilters(
    statusFilter,
    query.program ? { program: query.program } : null,
    query.department ? { department: query.department } : null,
    query.batch ? { batch: query.batch } : null,
    query.level ? { level: query.level } : null,
    query.qualificationType ? { qualificationType: query.qualificationType } : null,
    query.category ? { studentCategory: query.category } : null,
    searchFilter(query.search, ['studentId', 'fullName', 'email', 'phone']),
  );

  const [rows, total, statusCounts] = await Promise.all([
    Student.find(filter)
      .populate('program', 'code name qualificationType')
      .populate('department', 'code name')
      .populate('batch', 'code name')
      .populate('admissionAcademicYear', 'label')
      .sort(sortOf(query, STUDENT_SORT, 'fullName'))
      .skip(skip)
      .limit(limit)
      .lean(),
    Student.countDocuments(filter),
    Student.aggregate([{ $group: { _id: '$studentStatus', count: { $sum: 1 } } }]),
  ]);
  const counts = { all: 0 };
  for (const row of statusCounts) {
    counts[row._id] = row.count;
    counts.all += row.count;
  }
  res.json({ ...paged(rows.map(studentView), total, page, limit), counts });
});

export const getStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.valid.params.studentId)
    .populate('program', 'code name qualificationType durationYears levels graduationPolicy')
    .populate('department', 'code name')
    .populate('batch', 'code name currentLevel status')
    .populate('admissionAcademicYear', 'label startDate endDate')
    .lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');

  const [enrollments, registrations, publishedResults, certificates] = await Promise.all([
    Enrollment.find({ student: student._id })
      .populate('academicYear', 'label')
      .populate('batch', 'code name')
      .sort({ enrollmentDate: -1 })
      .lean(),
    CourseRegistration.countDocuments({ student: student._id, status: 'registered' }),
    Result.countDocuments({ student: student._id, status: 'published' }),
    Certificate.find({ student: student._id }).sort({ issuedAt: -1 }).lean(),
  ]);

  res.json({
    student: studentView(student),
    summary: {
      activeRegistrations: registrations,
      publishedResults,
      certificates: certificates.length,
      enrollments: enrollments.length,
    },
    enrollments: enrollments.map((row) => ({
      ...row,
      id: String(row._id),
      academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
      batch: row.batch ? { id: String(row.batch._id), code: row.batch.code, name: row.batch.name } : null,
      _id: undefined,
    })),
    certificates: certificates.map((row) => ({
      id: String(row._id),
      certificateNumber: row.certificateNumber,
      status: row.status,
      issuedAt: row.issuedAt,
      cgpa: row.cgpa,
    })),
    fees: {
      available: false,
      message: 'No finance record is available to the Registrar workspace.',
    },
  });
});

export const createStudent = asyncHandler(async (req, res) => {
  const input = req.body;
  const category = input.studentCategory || 'regular';
  const { program, department, batch } = await loadOptions(input.program, input.department, input.batch, category);
  await assertCapacity(program);
  validateLevel(program, input.level || 1);
  const email = await assertEmailAvailable(input.email);
  const phone = await assertPhoneAvailable(input.phone);

  let academicYear = null;
  const yearId = input.admissionAcademicYear || batch?.admissionAcademicYear;
  if (yearId) {
    academicYear = await AcademicYear.findById(yearId).lean();
    if (!academicYear) throw new AppError(400, 'ACADEMIC_YEAR_INVALID', 'Choose a valid academic year.');
  }

  // Admission date defaults to the canonical Ethiopian day, not the browser clock, so a
  // registrar in a different offset never writes a date that drifts by a day.
  const admissionDate = input.admissionDate ? new Date(input.admissionDate) : canonicalNow();
  if (Number.isNaN(admissionDate.getTime())) {
    throw new AppError(400, 'BAD_DATE', 'The admission date is not a valid date.');
  }
  const teacherIds = await resolveTeacherIdsForPlacement(program._id, { batchId: batch?._id ?? null });

  const base = {
    ...input,
    email,
    phone,
    studentCategory: category,
    department: department._id,
    program: program._id,
    qualificationType: program.qualificationType,
    batch: batch?._id ?? null,
    admissionAcademicYear: academicYear?._id ?? null,
    admissionDate,
    enrollmentStatus: 'active',
    studentStatus: input.studentStatus || 'active',
    notes: '',
    createdBy: req.user.id,
    updatedBy: req.user.id,
  };

  let student;
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      student = await Student.create({
        ...base,
        studentId: await nextStudentId({ program, batch, category }),
      });
      break;
    } catch (error) {
      const studentIdCollision = error?.code === 11000
        && (error?.keyPattern?.studentId || error?.keyValue?.studentId || String(error?.message).includes('studentId'));
      if (!studentIdCollision) throw error;
      lastError = error;
    }
  }
  if (!student) throw lastError;

  if (academicYear) {
    await Enrollment.create({
      student: student._id,
      program: program._id,
      department: department._id,
      qualificationType: program.qualificationType,
      academicYear: academicYear._id,
      batch: batch?._id ?? null,
      level: student.level,
      enrollmentDate: student.admissionDate || new Date(),
      status: 'active',
      statusHistory: [{ status: 'active', by: req.user.id }],
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });
  }

  // Auto-assign teachers from CourseAssignment records
  const { CourseAssignment } = await import('../models/CourseAssignment.js');
  const courseAssignments = await CourseAssignment.find(ownFilter({ program: program._id, status: 'active' }))
    .populate('teacher', 'name email')
    .lean();
  const courseAssignmentTeacherIds = [...new Set(courseAssignments.map((ca) => String(ca.teacher._id)))];
  if (courseAssignmentTeacherIds.length && !teacherIds.some((id) => courseAssignmentTeacherIds.includes(id))) {
    teacherIds = [...new Set([...teacherIds, ...courseAssignmentTeacherIds])];
  }

  audit({
    req,
    action: 'registrar.student.create',
    targetType: 'Student',
    targetId: student._id,
    meta: { studentId: student.studentId, program: program.code, category, batch: batch?.code ?? null, teachers: teacherIds.length },
  });
  void notifyUsers(teacherIds, {
    type: 'student_admitted',
    title: 'New student admitted',
    body: `${student.studentId} Â· ${student.fullName} Â· ${program.code}`,
    actorId: req.user.id,
    actorName: req.user.name || 'Registrar',
    meta: { studentId: student.studentId, program: program.code, batch: batch?.code ?? null },
  }).catch(() => {});
  void sendStudentAdmissionEmail({
    to: email,
    name: student.fullName,
    studentId: student.studentId,
    program: program.name,
    department: department.name,
    batch: batch?.name || batch?.code || '',
    category: category === 'extension' ? 'Extension' : 'Regular',
    admissionDate: student.admissionDate,
  }).catch((err) => logger.error({ err: err?.message, studentId: student.studentId }, 'admission email failed'));
  res.status(201).json({ student: studentView(student.toObject()) });
});

export const updateStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.valid.params.studentId);
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const input = req.body;
  const programId = input.program ?? student.program;
  const departmentId = input.department ?? student.department;
  const category = input.studentCategory ?? student.studentCategory ?? 'regular';
  const batchId = input.batch === undefined ? student.batch : input.batch;
  const { program, department, batch } = await loadOptions(programId, departmentId, batchId, category);
  const level = input.level !== undefined ? Number(input.level) : student.level;
  validateLevel(program, level);
  if (input.email !== undefined) input.email = await assertEmailAvailable(input.email, student._id);

  const placementChanged =
    input.program !== undefined || input.batch !== undefined || input.studentCategory !== undefined;
  const yearId = input.admissionAcademicYear || (placementChanged ? batch?.admissionAcademicYear : undefined);
  if (yearId) {
    const year = await AcademicYear.findById(yearId).lean();
    if (!year) throw new AppError(400, 'ACADEMIC_YEAR_INVALID', 'Choose a valid academic year.');
    student.admissionAcademicYear = year._id;
  } else if (placementChanged) {
    student.admissionAcademicYear = null;
  }
  const fields = [
    'firstName', 'middleName', 'lastName', 'sex', 'dateOfBirth', 'email', 'phone', 'address',
    'level', 'enrollmentStatus', 'studentStatus', 'studentCategory', 'admissionDate', 'completionDate',
  ];
  for (const field of fields) if (input[field] !== undefined) student[field] = input[field];
  student.program = program._id;
  student.department = department._id;
  student.qualificationType = program.qualificationType;
  student.batch = batch?._id ?? null;
  student.updatedBy = req.user.id;
  await student.save();

  audit({
    req,
    action: 'registrar.student.update',
    targetType: 'Student',
    targetId: student._id,
    meta: { fields: Object.keys(input) },
  });
  res.json({ student: studentView(student.toObject()) });
});

export const uploadStudentPhoto = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.valid.params.studentId);
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const info = validateImage(req.body);
  const extension = info.extension;
  const fileName = `${student.studentId}.${extension}`;
  const uploaded = await uploadImage(req.body, {
    fileName,
    folder: `/students/${student._id}/profile`,
    contentType: info.contentType,
  });

  const previous = student.photo?.fileId;
  try {
    student.photo = {
      ...uploaded,
      extension,
      width: info.width,
      height: info.height,
      status: 'active',
      uploadedBy: req.user.id,
      missingAt: null,
    };
    await student.save();
  } catch (err) {
    await deleteImage(uploaded.fileId).catch((deleteErr) =>
      logger.error({ err: deleteErr?.message, fileId: uploaded.fileId }, 'orphan photo cleanup failed'),
    );
    throw err;
  }

  if (previous && previous !== uploaded.fileId) {
    await deleteImage(previous).catch((err) =>
      logger.warn({ err: err?.message, fileId: previous }, 'old student photo could not be deleted'),
    );
  }
  audit({
    req,
    action: 'registrar.student.photo.upload',
    targetType: 'Student',
    targetId: student._id,
    meta: { fileId: uploaded.fileId, bytes: uploaded.bytes, width: info.width, height: info.height },
  });
  res.json({ photo: photoView(student.photo) });
});

export const removeStudentPhoto = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.valid.params.studentId);
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  if (!student.photo?.fileId) throw new AppError(404, 'PHOTO_NOT_FOUND', 'This student has no photo to remove.');
  const { fileId } = student.photo;
  student.photo = {};
  await student.save();
  await deleteImage(fileId).catch((err) =>
    logger.warn({ err: err?.message, fileId }, 'student photo reference cleared but the stored file could not be deleted'),
  );
  audit({
    req,
    action: 'registrar.student.photo.remove',
    targetType: 'Student',
    targetId: student._id,
  });
  res.json({ photo: null });
});

export const requestStudentDeleteCode = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.valid.params.studentId).lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const user = await User.findById(req.user.id).lean();
  if (!user) throw new AppError(401, 'SESSION_ENDED', 'Please sign in again.');
  const sent = await sendCode(user, 'student_delete');
  if (!sent) throw new AppError(429, 'WAIT_BEFORE_RESEND', resendWaitMessage);
  audit({
    req,
    action: 'registrar.student.delete_code_sent',
    targetType: 'Student',
    targetId: student._id,
    meta: { studentId: student.studentId },
  });
  res.json({ message: `We emailed a 6-digit code to ${user.email}.`, email: user.email });
});

export const deleteStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.valid.params.studentId)
    .populate('program', 'code name')
    .populate('department', 'code name')
    .lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const user = await User.findById(req.user.id).lean();
  if (!user) throw new AppError(401, 'SESSION_ENDED', 'Please sign in again.');
  await checkCode(user._id, 'student_delete', req.body.code);

  const registrations = await CourseRegistration.find({ student: student._id, status: 'registered' })
    .select('offering')
    .lean();
  if (registrations.length) {
    const counts = new Map();
    for (const row of registrations) {
      const key = String(row.offering);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    await Promise.all(
      [...counts.entries()].map(([offering, count]) =>
        CourseOffering.updateOne(ownFilter({ _id: offering, registeredCount: { $gte: count } }), {
          $inc: { registeredCount: -count },
        }),
      ),
    );
  }

  await Promise.all([
    Enrollment.deleteMany({ student: student._id }),
    ProgressionRecord.deleteMany({ student: student._id }),
    CourseRegistration.deleteMany({ student: student._id }),
    AttendanceRecord.deleteMany({ student: student._id }),
    Result.deleteMany({ student: student._id }),
    Certificate.deleteMany({ student: student._id }),
    Transcript.deleteMany({ student: student._id }),
  ]);
  await Student.deleteOne({ _id: student._id });

  if (student.photo?.fileId) {
    await deleteImage(student.photo.fileId).catch((err) =>
      logger.warn({ err: err?.message, fileId: student.photo.fileId }, 'student record deleted but the photo could not be removed'),
    );
  }

  audit({
    req,
    action: 'registrar.student.delete',
    targetType: 'Student',
    targetId: student._id,
    meta: {
      studentId: student.studentId,
      fullName: student.fullName,
      program: student.program?.code || null,
      department: student.department?.code || null,
      photoFileId: student.photo?.fileId || null,
    },
  });
  await notifyAdmins({
    type: 'student_deleted',
    title: `${student.fullName} was permanently deleted`,
    body: `${student.studentId} Â· ${student.program?.name || 'Programme not set'} Â· deleted by ${user.name || user.email}`,
    actorId: user._id,
    actorName: user.name || user.email,
    meta: { studentId: student.studentId, student: String(student._id) },
  });
  res.json({ message: 'The student record and its stored photo were permanently deleted.' });
});

export const exportStudentProfile = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.valid.params.studentId)
    .populate('program', 'code name qualificationType')
    .populate('department', 'code name')
    .populate('batch', 'code name')
    .populate('admissionAcademicYear', 'label')
    .lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const result = await buildStudentProfileExport({ student, format: req.valid.query.format });
  audit({
    req,
    action: 'registrar.student.export',
    targetType: 'Student',
    targetId: student._id,
    meta: { format: result.format },
  });
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Length', String(result.buffer.length));
  res.setHeader('Cache-Control', 'no-store');
  res.send(result.buffer);
});

export const studentSummary = asyncHandler(async (_req, res) => {
  // Exclude graduated students from the student register summary (they have their own graduated hub)
  const notGraduated = { studentStatus: { $ne: 'graduated' } };
  const [byDepartment, byProgram, byBatch, total] = await Promise.all([
    Student.aggregate([
      { $match: notGraduated },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
      { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'record' } },
      { $unwind: { path: '$record', preserveNullAndEmptyArrays: true } },
    ]),
    Student.aggregate([
      { $match: notGraduated },
      { $group: { _id: '$program', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
      { $lookup: { from: 'programs', localField: '_id', foreignField: '_id', as: 'record' } },
      { $unwind: { path: '$record', preserveNullAndEmptyArrays: true } },
    ]),
    Student.aggregate([
      { $match: notGraduated },
      { $group: { _id: '$batch', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
      { $lookup: { from: 'batches', localField: '_id', foreignField: '_id', as: 'record' } },
      { $unwind: { path: '$record', preserveNullAndEmptyArrays: true } },
    ]),
    Student.countDocuments(notGraduated),
  ]);

  const label = (record) => record?.name || record?.code || 'Not assigned';
  res.json({
    total,
    byDepartment: byDepartment.map((row) => ({
      id: row._id ? String(row._id) : null,
      name: label(row.record),
      code: row.record?.code || '',
      count: row.count,
    })),
    byProgram: byProgram.map((row) => ({
      id: row._id ? String(row._id) : null,
      name: label(row.record),
      code: row.record?.code || '',
      count: row.count,
    })),
    byBatch: byBatch.map((row) => ({
      id: row._id ? String(row._id) : null,
      name: label(row.record),
      code: row.record?.code || '',
      count: row.count,
    })),
  });
});

export const studentOptions = asyncHandler(async (_req, res) => {
  const [departments, programs, batches, years] = await Promise.all([
    Department.find({ active: true }).sort({ name: 1 }).lean(),
    Program.find({ active: true }).sort({ name: 1 }).lean(),
    Batch.find(ownFilter({})).sort({ code: 1 }).lean(),
    AcademicYear.find().sort({ startDate: -1 }).lean(),
  ]);
  res.json({
    departments: departments.map((row) => ({ id: String(row._id), code: row.code, name: row.name })),
    programs: programs.map((row) => ({
      id: String(row._id),
      code: row.code,
      name: row.name,
      qualificationType: row.qualificationType,
      department: String(row.department),
      categories: row.categories?.length ? row.categories : ['regular', 'extension'],
      durationYears: row.durationYears,
      levels: row.levels,
      shortTerm: row.shortTerm,
      capacity: row.capacity,
      teachers: (row.teachers || []).map((teacher) => String(teacher)),
    })),
    batches: batches.map((row) => ({
      id: String(row._id),
      code: row.code,
      name: row.name,
      program: String(row.program),
      category: row.category || 'regular',
      admissionAcademicYear: row.admissionAcademicYear ? String(row.admissionAcademicYear) : null,
      status: row.status,
    })),
    academicYears: years.map((row) => ({
      id: String(row._id),
      label: row.label,
      isCurrent: row.isCurrent,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
    })),
  });
});

export const graduatedCohortsSummary = asyncHandler(async (_req, res) => {
  const cohortAggregation = await Student.aggregate([
    { $match: { studentStatus: 'graduated' } },
    {
      $group: {
        _id: {
          department: '$department',
          program: '$program',
          batch: '$batch',
        },
        count: { $sum: 1 },
        latestCompletionDate: { $max: '$completionDate' },
        updatedAt: { $max: '$updatedAt' },
      },
    },
    { $sort: { latestCompletionDate: -1, updatedAt: -1 } },
  ]);

  const deptIds = [...new Set(cohortAggregation.map((c) => String(c._id.department)).filter(Boolean))];
  const progIds = [...new Set(cohortAggregation.map((c) => String(c._id.program)).filter(Boolean))];
  const batchIds = [...new Set(cohortAggregation.map((c) => String(c._id.batch)).filter(Boolean))];

  const [departments, programs, batches] = await Promise.all([
    Department.find({ _id: { $in: deptIds } }).lean(),
    Program.find({ _id: { $in: progIds } }).lean(),
    Batch.find({ _id: { $in: batchIds } }).lean(),
  ]);

  const deptMap = new Map(departments.map((d) => [String(d._id), d]));
  const progMap = new Map(programs.map((p) => [String(p._id), p]));
  const batchMap = new Map(batches.map((b) => [String(b._id), b]));

  const deptGroups = new Map();

  for (const item of cohortAggregation) {
    const deptId = String(item._id.department || '');
    const progId = String(item._id.program || '');
    const batchId = String(item._id.batch || '');

    const dept = deptMap.get(deptId) || { _id: deptId, name: 'General / Other', code: 'GEN' };
    const prog = progMap.get(progId) || { _id: progId, name: 'General Programme', code: 'PROG' };
    const batch = batchMap.get(batchId) || { _id: batchId, code: 'General', category: 'regular' };

    const key = String(dept._id);
    if (!deptGroups.has(key)) {
      deptGroups.set(key, {
        departmentId: String(dept._id),
        departmentName: dept.name,
        departmentCode: dept.code,
        cohorts: [],
      });
    }

    deptGroups.get(key).cohorts.push({
      id: `${progId}_${batchId}`,
      slug: `${prog.code || 'PROG'}-${batch.code || 'BATCH'}`,
      departmentId: String(dept._id),
      departmentName: dept.name,
      departmentCode: dept.code,
      programId: String(prog._id),
      programName: prog.name,
      programCode: prog.code,
      qualificationType: prog.qualificationType,
      batchId: String(batch._id),
      batchCode: batch.code,
      batchCategory: batch.category || 'regular',
      count: item.count,
      latestCompletionDate: item.latestCompletionDate,
    });
  }

  res.json({
    departments: departments.map((d) => ({ id: String(d._id), code: d.code, name: d.name })),
    programs: programs.map((p) => ({
      id: String(p._id),
      code: p.code,
      name: p.name,
      department: String(p.department),
      qualificationType: p.qualificationType,
    })),
    batches: batches.map((b) => ({
      id: String(b._id),
      code: b.code,
      name: b.name,
      program: String(b.program),
      category: b.category || 'regular',
    })),
    departmentGroups: Array.from(deptGroups.values()),
    totalGraduated: cohortAggregation.reduce((acc, c) => acc + c.count, 0),
  });
});




