import { Student, Enrollment } from '../models/Student.js';
import { Program, Department, Batch, AcademicYear } from '../models/AcademicStructure.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { pageOf, sortOf, searchFilter, mergeFilters, paged, ownFilter } from '../services/registrar.helpers.js';

export const listEnrollments = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  let studentIds = null;
  if (query.search) {
    const students = await Student.find(searchFilter(query.search, ['studentId', 'fullName', 'email']))
      .select('_id')
      .limit(2000)
      .lean();
    studentIds = students.map((row) => row._id);
  }
  const filter = mergeFilters(
    query.status && query.status !== 'all' ? { status: query.status } : null,
    query.academicYear ? { academicYear: query.academicYear } : null,
    query.program ? { program: query.program } : null,
    query.student ? { student: query.student } : null,
    studentIds ? { student: { $in: studentIds } } : null,
  );
  const [rows, total] = await Promise.all([
    Enrollment.find(filter)
      .populate('student', 'studentId fullName level studentStatus photo')
      .populate('program', 'code name qualificationType')
      .populate('department', 'code name')
      .populate('academicYear', 'label')
      .populate('batch', 'code name')
      .sort(sortOf(query, ['createdAt', 'enrollmentDate', 'status'], 'createdAt'))
      .skip(skip)
      .limit(limit)
      .lean(),
    Enrollment.countDocuments(filter),
  ]);
  res.json({
    ...paged(
      rows.map((row) => ({
        ...row,
        id: String(row._id),
        student: row.student
          ? { id: String(row.student._id), studentId: row.student.studentId, fullName: row.student.fullName, level: row.student.level, studentStatus: row.student.studentStatus }
          : null,
        program: row.program ? { id: String(row.program._id), code: row.program.code, name: row.program.name, qualificationType: row.program.qualificationType } : null,
        department: row.department ? { id: String(row.department._id), code: row.department.code, name: row.department.name } : null,
        academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
        batch: row.batch ? { id: String(row.batch._id), code: row.batch.code, name: row.batch.name } : null,
        _id: undefined,
      })),
      total,
      page,
      limit,
    ),
  });
});

export const createEnrollment = asyncHandler(async (req, res) => {
  const input = req.body;
  const student = await Student.findById(input.student).lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const [program, department, year, batch] = await Promise.all([
    Program.findById(student.program).lean(),
    Department.findById(student.department).lean(),
    AcademicYear.findById(input.academicYear).lean(),
    input.batch ? Batch.findById(input.batch).lean() : null,
  ]);
  if (!program || !department) throw new AppError(409, 'STUDENT_STRUCTURE_MISSING', 'The student programme or department is no longer available.');
  if (!year) throw new AppError(400, 'ACADEMIC_YEAR_INVALID', 'Choose a valid academic year.');
  if (batch && String(batch.program) !== String(program._id)) {
    throw new AppError(400, 'BATCH_INVALID', 'That batch does not belong to the student programme.');
  }
  const duplicate = await Enrollment.findOne(ownFilter({
    student: student._id,
    program: program._id,
    academicYear: year._id,
    status: { $in: ['pending', 'active'] },
  })).lean();
  if (duplicate) throw new AppError(409, 'ENROLLMENT_EXISTS', 'An active enrollment already exists for this student and year.');

  const enrollment = await Enrollment.create({
    student: student._id,
    program: program._id,
    department: department._id,
    qualificationType: program.qualificationType,
    academicYear: year._id,
    batch: batch?._id ?? student.batch ?? null,
    level: input.level,
    enrollmentDate: input.enrollmentDate,
    status: input.status,
    statusHistory: [{ status: input.status, by: req.user.id }],
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  if (input.status === 'active') {
    await Student.updateOne(
      { _id: student._id },
      { $set: { level: input.level, batch: enrollment.batch, enrollmentStatus: 'active', admissionAcademicYear: year._id, updatedBy: req.user.id } },
    );
  }
  audit({ req, action: 'registrar.enrollment.create', targetType: 'Enrollment', targetId: enrollment._id, meta: { student: student.studentId, year: year.label } });
  res.status(201).json({ enrollment });
});

export const updateEnrollmentStatus = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.valid.params.id);
  if (!enrollment) throw new AppError(404, 'ENROLLMENT_NOT_FOUND', 'That enrollment was not found.');
  const { status, reason } = req.body;
  if (enrollment.status === status) return res.json({ enrollment });
  enrollment.status = status;
  enrollment.statusHistory.push({ status, by: req.user.id, reason });
  enrollment.updatedBy = req.user.id;
  await enrollment.save();
  if (['active', 'completed', 'withdrawn', 'cancelled'].includes(status)) {
    const map = { active: 'active', completed: 'completed', withdrawn: 'withdrawn', cancelled: 'cancelled' };
    await Student.updateOne({ _id: enrollment.student }, { $set: { enrollmentStatus: map[status], updatedBy: req.user.id } });
  }
  audit({ req, action: 'registrar.enrollment.status', targetType: 'Enrollment', targetId: enrollment._id, meta: { status } });
  res.json({ enrollment });
});
