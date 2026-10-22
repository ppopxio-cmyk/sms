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
import { checkCode } from '../services/code.service.js';
import { notifyAdmins } from '../services/notification.service.js';
import { buildStudentProfileExport } from '../services/studentExport.service.js';
import { logger } from '../utils/logger.js';
import { pageOf, sortOf, searchFilter, mergeFilters, paged, ownFilter } from '../services/registrar.helpers.js';

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

export const studentView = (student) => ({
  ...student,
  id: String(student._id),
  studentCategory: student.studentCategory || 'regular',
  photo: photoView(student.photo),
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
});

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
  // When the Registrar has not picked one, the current planned/active intake is used.
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
    batch = await Batch.findOne(ownFilter({ program: program._id, category, status: { $in: ['planned', 'active'] } }))
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

async function nextStudentId({ program, batch, category }) {
  if (!batch) throw new AppError(409, 'BATCH_REQUIRED', 'Create a batch for this programme and stream before admitting students.');
  const stream = category === 'extension' ? 'EXT' : 'REG';
  const batchCode = String(batch.code || '').toUpperCase().startsWith('BAT')
    ? String(batch.code).toUpperCase()
    : `BAT${String(batch.code || '').toUpperCase()}`;
  const fullPrefix = `${program.code}-${batchCode}-${stream}`;
  const prefix = fullPrefix.length > 35 ? fullPrefix.slice(0, 35).replace(/-+$/, '') : fullPrefix;
  const counter = await Counter.findOneAndUpdate(
    { key: `sid:${program._id}:${batch._id}:${stream}` },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return `${prefix}-${String(counter.value).padStart(3, '0')}`;
}

async function assertCapacity(program) {
  if (!program.capacity) return;
  const current = await Student.countDocuments({ program: program._id, studentStatus: 'active' });
  if (current >= program.capacity) {
    throw new AppError(409, 'PROGRAM_FULL', `${program.name} has reached its capacity of ${program.capacity} students.`);
  }
}

export const listStudents = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  const filter = mergeFilters(
    query.status && query.status !== 'all' ? { studentStatus: query.status } : null,
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

  let academicYear = null;
  const yearId = input.admissionAcademicYear || batch?.admissionAcademicYear;
  if (yearId) {
    academicYear = await AcademicYear.findById(yearId).lean();
    if (!academicYear) throw new AppError(400, 'ACADEMIC_YEAR_INVALID', 'Choose a valid academic year.');
  }

  const studentId = await nextStudentId({ program, batch, category });
  const student = await Student.create({
    ...input,
    studentId,
    studentCategory: category,
    department: department._id,
    program: program._id,
    qualificationType: program.qualificationType,
    batch: batch?._id ?? null,
    admissionAcademicYear: academicYear?._id ?? null,
    admissionDate: input.admissionDate || new Date(),
    enrollmentStatus: 'active',
    studentStatus: input.studentStatus || 'active',
    notes: '',
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

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

  audit({
    req,
    action: 'registrar.student.create',
    targetType: 'Student',
    targetId: student._id,
    meta: { studentId: student.studentId, program: program.code, category, batch: batch?.code ?? null },
  });
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
  if (!sent) throw new AppError(429, 'WAIT_BEFORE_RESEND', 'Please wait before asking for another code.');
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
    body: `${student.studentId} · ${student.program?.name || 'Programme not set'} · deleted by ${user.name || user.email}`,
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

export const studentOptions = asyncHandler(async (_req, res) => {
  const [departments, programs, batches, years] = await Promise.all([
    Department.find({ active: true }).sort({ name: 1 }).lean(),
    Program.find({ active: true }).sort({ name: 1 }).lean(),
    Batch.find(ownFilter({ status: { $in: ['planned', 'active'] } })).sort({ code: 1 }).lean(),
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
      startDate: row.startDate,
      endDate: row.endDate,
    })),
  });
});
