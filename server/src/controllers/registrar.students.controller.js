import { Student, Enrollment } from '../models/Student.js';
import { Program, Department, Batch, AcademicYear } from '../models/AcademicStructure.js';
import { CourseRegistration } from '../models/Offering.js';
import { Result } from '../models/Records.js';
import { Certificate } from '../models/Documents.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signedImageUrl, uploadImage, deleteImage, validateImage } from '../services/imagekit.service.js';
import { logger } from '../utils/logger.js';
import { pageOf, sortOf, searchFilter, mergeFilters, paged, ownFilter } from '../services/registrar.helpers.js';

const STUDENT_SORT = ['createdAt', 'updatedAt', 'studentId', 'fullName', 'level', 'admissionDate'];

function photoView(photo) {
  if (!photo) return null;
  const url = photo.filePath ? signedImageUrl(photo.filePath, { expiresIn: 3600 }) : photo.url;
  const thumbnailUrl = photo.filePath
    ? signedImageUrl(photo.filePath, {
        transformation: [{ width: 160, height: 160, crop: 'maintain_ratio', focus: 'face' }],
        expiresIn: 3600,
      })
    : photo.thumbnailUrl;
  return { ...photo, url, thumbnailUrl };
}

export const studentView = (student) => ({
  ...student,
  id: String(student._id),
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

async function loadOptions(programId, departmentId, batchId) {
  const program = await Program.findById(programId).lean();
  if (!program || !program.active) throw new AppError(400, 'PROGRAM_INVALID', 'Choose an active programme.');
  const department = await Department.findById(departmentId).lean();
  if (!department || !department.active) throw new AppError(400, 'DEPARTMENT_INVALID', 'Choose an active department.');
  if (String(program.department) !== String(department._id)) {
    throw new AppError(400, 'PROGRAM_DEPARTMENT_MISMATCH', 'That programme does not belong to the selected department.');
  }
  let batch = null;
  if (batchId) {
    batch = await Batch.findById(batchId).lean();
    if (!batch || String(batch.program) !== String(program._id)) {
      throw new AppError(400, 'BATCH_INVALID', 'Choose a batch that belongs to this programme.');
    }
  }
  return { program, department, batch };
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
  const { program, department, batch } = await loadOptions(input.program, input.department, input.batch);
  const existing = await Student.findOne({ studentId: input.studentId.toUpperCase() }).lean();
  if (existing) throw new AppError(409, 'STUDENT_ID_EXISTS', 'That student ID is already in use.');

  let academicYear = null;
  if (input.admissionAcademicYear) {
    academicYear = await AcademicYear.findById(input.admissionAcademicYear).lean();
    if (!academicYear) throw new AppError(400, 'ACADEMIC_YEAR_INVALID', 'Choose a valid academic year.');
  }

  const student = await Student.create({
    ...input,
    studentId: input.studentId.toUpperCase(),
    department: department._id,
    program: program._id,
    qualificationType: program.qualificationType,
    batch: batch?._id ?? null,
    admissionAcademicYear: academicYear?._id ?? null,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  if (academicYear && ['pending', 'active'].includes(student.enrollmentStatus)) {
    await Enrollment.create({
      student: student._id,
      program: program._id,
      department: department._id,
      qualificationType: program.qualificationType,
      academicYear: academicYear._id,
      batch: batch?._id ?? null,
      level: student.level,
      enrollmentDate: student.admissionDate || new Date(),
      status: student.enrollmentStatus,
      statusHistory: [{ status: student.enrollmentStatus, by: req.user.id }],
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });
  }

  audit({
    req,
    action: 'registrar.student.create',
    targetType: 'Student',
    targetId: student._id,
    meta: { studentId: student.studentId, program: program.code },
  });
  res.status(201).json({ student: studentView(student.toObject()) });
});

export const updateStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.valid.params.studentId);
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const input = req.body;
  const programId = input.program ?? student.program;
  const departmentId = input.department ?? student.department;
  const batchId = input.batch === undefined ? student.batch : input.batch;
  const { program, department, batch } = await loadOptions(programId, departmentId, batchId);

  if (input.admissionAcademicYear) {
    const year = await AcademicYear.findById(input.admissionAcademicYear).lean();
    if (!year) throw new AppError(400, 'ACADEMIC_YEAR_INVALID', 'Choose a valid academic year.');
    student.admissionAcademicYear = year._id;
  }
  const fields = [
    'firstName', 'middleName', 'lastName', 'sex', 'dateOfBirth', 'email', 'phone', 'address',
    'level', 'enrollmentStatus', 'studentStatus', 'admissionDate', 'completionDate', 'notes',
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
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const uploaded = await uploadImage(req.body, {
    fileName,
    folder: `/students/${student._id}/profile`,
    contentType: info.contentType,
  });

  const previous = student.photo?.fileId;
  try {
    student.photo = {
      ...uploaded,
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
  await deleteImage(student.photo.fileId);
  student.photo = {};
  await student.save();
  audit({
    req,
    action: 'registrar.student.photo.remove',
    targetType: 'Student',
    targetId: student._id,
  });
  res.json({ photo: null });
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
      durationYears: row.durationYears,
      levels: row.levels,
    })),
    batches: batches.map((row) => ({
      id: String(row._id),
      code: row.code,
      name: row.name,
      program: String(row.program),
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
