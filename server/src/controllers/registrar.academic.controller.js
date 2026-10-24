import { Department, Program, Course, AcademicYear, AcademicTerm, CalendarEvent, Batch } from '../models/AcademicStructure.js';
import { Student, Enrollment, ProgressionRecord } from '../models/Student.js';
import { CurriculumPlan, CurriculumCourse } from '../models/Curriculum.js';
import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { Result } from '../models/Records.js';
import { User } from '../models/User.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { pageOf, sortOf, searchFilter, mergeFilters, paged, ownFilter } from '../services/registrar.helpers.js';
import { planCredits } from '../services/eligibility.service.js';
import { buildExport, EXPORT_LIMIT } from '../services/export.service.js';
import { notifyProgramTeachers, notifyUser } from '../services/notification.service.js';
import { syncProgramTeachers } from '../services/teacherAccess.service.js';
import { TeacherProgramAssignment } from '../models/Teaching.js';
import { CourseResource } from '../models/CourseResource.js';
import { sendCode } from '../services/codeDelivery.js';
import { checkCode } from '../services/code.service.js';
import { sendCurriculumOfferingEmail } from '../services/mail.service.js';

async function recalcPlan(planId) {
  const total = await planCredits(planId);
  await CurriculumPlan.updateOne({ _id: planId }, { $set: { totalCredits: total } });
  return total;
}

async function requirePlan(planId, { status } = {}) {
  const plan = await CurriculumPlan.findById(planId);
  if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'That curriculum plan was not found.');
  if (status && plan.status !== status) {
    throw new AppError(409, 'PLAN_STATE', `This plan is ${plan.status}; that action needs a ${status} plan.`);
  }
  return plan;
}

export const structure = asyncHandler(async (_req, res) => {
  const [departments, programs, courses, plans, teachers, academicYears] = await Promise.all([
    Department.find().sort({ name: 1 }).lean(),
    Program.find()
      .populate('department', 'code name')
      .populate('teachers', 'name email')
      .sort({ name: 1 })
      .lean(),
    Course.find().populate('department', 'code name').sort({ code: 1 }).lean(),
    CurriculumPlan.find({ status: 'published' })
      .populate('program', 'code name qualificationType')
      .populate('academicYear', 'label')
      .sort({ createdAt: -1 })
      .lean(),
    User.find({ role: 'TEACHER', status: 'active', deletedAt: null }).select('name email').sort({ name: 1 }).lean(),
    AcademicYear.find().sort({ startDate: -1 }).lean(),
  ]);
  const [programCounts, courseCounts] = await Promise.all([
    Program.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }]),
    Course.aggregate([{ $group: { _id: '$department', count: { $sum: 1 } } }]),
  ]);
  const programMap = new Map(programCounts.map((row) => [String(row._id), row.count]));
  const courseMap = new Map(courseCounts.map((row) => [String(row._id), row.count]));
  res.json({
    departments: departments.map((row) => ({
      ...row,
      id: String(row._id),
      programCount: programMap.get(String(row._id)) || 0,
      courseCount: courseMap.get(String(row._id)) || 0,
      _id: undefined,
    })),
    programs: programs.map((row) => ({
      ...row,
      id: String(row._id),
      categories: row.categories?.length ? row.categories : ['regular', 'extension'],
      department: row.department
        ? { id: String(row.department._id), code: row.department.code, name: row.department.name }
        : null,
      teachers: (row.teachers || []).filter(Boolean).map((teacher) => ({
        id: String(teacher._id),
        name: teacher.name || teacher.email,
        email: teacher.email,
      })),
      academicYears: (row.academicYears || []).map(String),
      _id: undefined,
    })),
    courses: courses.map((row) => ({
      ...row,
      id: String(row._id),
      department: row.department
        ? { id: String(row.department._id), code: row.department.code, name: row.department.name }
        : null,
      _id: undefined,
    })),
    plans: plans.map((row) => ({
      ...row,
      id: String(row._id),
      program: row.program
        ? { id: String(row.program._id), code: row.program.code, name: row.program.name, qualificationType: row.program.qualificationType }
        : null,
      academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
      _id: undefined,
    })),
    teachers: teachers.map((row) => ({
      id: String(row._id),
      name: row.name || row.email,
      email: row.email,
    })),
    academicYears: academicYears.map((row) => ({
      id: String(row._id),
      label: row.label,
      isCurrent: row.isCurrent,
      status: row.status,
    })),
  });
});

async function requireDepartment(departmentId) {
  const department = await Department.findById(departmentId).lean();
  if (!department) throw new AppError(400, 'DEPARTMENT_INVALID', 'Choose a valid department.');
  return department;
}

async function requireTeachers(teacherIds = []) {
  if (!teacherIds.length) return [];
  const teachers = await User.find(
    ownFilter({ _id: { $in: [...new Set(teacherIds)] }, role: 'TEACHER', status: 'active', deletedAt: null }),
  ).select('_id').lean();
  if (teachers.length !== new Set(teacherIds).size) {
    throw new AppError(400, 'TEACHER_INVALID', 'Choose teachers with an active teacher account.');
  }
  return teachers.map((row) => row._id);
}

export const createDepartment = asyncHandler(async (req, res) => {
  const input = req.body;
  const code = input.code.toUpperCase();
  const existing = await Department.findOne({ code }).lean();
  if (existing) throw new AppError(409, 'DEPARTMENT_CODE_EXISTS', 'That department code is already in use.');
  const department = await Department.create({
    ...input,
    code,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  audit({ req, action: 'registrar.department.create', targetType: 'Department', targetId: department._id, meta: { code } });
  res.status(201).json({ department });
});

export const updateDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.valid.params.id);
  if (!department) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'That department was not found.');
  const input = req.body;
  if (input.code) {
    const code = input.code.toUpperCase();
    const duplicate = await Department.findOne(ownFilter({ code, _id: { $ne: department._id } })).lean();
    if (duplicate) throw new AppError(409, 'DEPARTMENT_CODE_EXISTS', 'That department code is already in use.');
    input.code = code;
  }
  Object.assign(department, input, { updatedBy: req.user.id });
  await department.save();
  audit({ req, action: 'registrar.department.update', targetType: 'Department', targetId: department._id });
  res.json({ department });
});

export const deleteDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.valid.params.id).lean();
  if (!department) throw new AppError(404, 'DEPARTMENT_NOT_FOUND', 'That department was not found.');
  const [programs, courses, batches, students] = await Promise.all([
    Program.countDocuments({ department: department._id }),
    Course.countDocuments({ department: department._id }),
    Batch.countDocuments({ department: department._id }),
    Student.countDocuments({ department: department._id }),
  ]);
  if (programs || courses || batches || students) {
    throw new AppError(
      409,
      'DEPARTMENT_IN_USE',
      'This department still has programmes, courses, batches or students. Remove them before deleting the department.',
    );
  }
  await Department.deleteOne({ _id: department._id });
  audit({ req, action: 'registrar.department.delete', targetType: 'Department', targetId: department._id, meta: { code: department.code } });
  res.status(204).end();
});

export const createProgram = asyncHandler(async (req, res) => {
  const input = req.body;
  await requireDepartment(input.department);
  const code = input.code.toUpperCase();
  const existing = await Program.findOne({ code }).lean();
  if (existing) throw new AppError(409, 'PROGRAM_CODE_EXISTS', 'That programme code is already in use.');
  const teachers = await requireTeachers(input.teachers);
  const program = await Program.create({
    ...input,
    code,
    teachers,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  await syncProgramTeachers({
    program,
    teacherIds: teachers,
    actorId: req.user.id,
    source: 'program',
  });
  audit({
    req,
    action: 'registrar.program.create',
    targetType: 'Program',
    targetId: program._id,
    meta: { code, teachers: teachers.length },
  });
  res.status(201).json({ program });
});

export const updateProgram = asyncHandler(async (req, res) => {
  const program = await Program.findById(req.valid.params.id);
  if (!program) throw new AppError(404, 'PROGRAM_NOT_FOUND', 'That programme was not found.');
  const input = req.body;
  if (input.department) await requireDepartment(input.department);
  if (input.code) {
    const code = input.code.toUpperCase();
    const duplicate = await Program.findOne(ownFilter({ code, _id: { $ne: program._id } })).lean();
    if (duplicate) throw new AppError(409, 'PROGRAM_CODE_EXISTS', 'That programme code is already in use.');
    input.code = code;
  }
  if (input.teachers) input.teachers = await requireTeachers(input.teachers);
  if (input.capacity !== undefined && input.capacity !== null) {
    const current = await Student.countDocuments({ program: program._id, studentStatus: 'active' });
    if (input.capacity < current) {
      throw new AppError(409, 'CAPACITY_BELOW_ENROLMENT', `This programme already has ${current} active students.`);
    }
  }
  Object.assign(program, input, { updatedBy: req.user.id });
  await program.save();
  if (input.teachers !== undefined) {
    await syncProgramTeachers({
      program,
      teacherIds: program.teachers,
      actorId: req.user.id,
      source: 'program',
    });
  }
  audit({
    req,
    action: 'registrar.program.update',
    targetType: 'Program',
    targetId: program._id,
    meta: { active: program.active, teachers: program.teachers?.length ?? 0 },
  });
  res.json({ program });
});

export const deleteProgram = asyncHandler(async (req, res) => {
  const program = await Program.findById(req.valid.params.id).lean();
  if (!program) throw new AppError(404, 'PROGRAM_NOT_FOUND', 'That programme was not found.');
  const [batches, students, plans, offerings] = await Promise.all([
    Batch.countDocuments({ program: program._id }),
    Student.countDocuments({ program: program._id }),
    CurriculumPlan.countDocuments({ program: program._id }),
    CourseOffering.countDocuments({ program: program._id }),
  ]);
  if (batches || students || plans || offerings) {
    throw new AppError(
      409,
      'PROGRAM_IN_USE',
      'This programme still has batches, students, curriculum plans or course offerings. Inactivate it instead of deleting it.',
    );
  }
  await Program.deleteOne({ _id: program._id });
  audit({ req, action: 'registrar.program.delete', targetType: 'Program', targetId: program._id, meta: { code: program.code } });
  res.status(204).end();
});

export const programDetail = asyncHandler(async (req, res) => {
  const program = await Program.findById(req.valid.params.id)
    .populate('department', 'code name')
    .populate('teachers', 'name email role')
    .lean();
  if (!program) throw new AppError(404, 'PROGRAM_NOT_FOUND', 'That programme was not found.');
  const [batches, courses, plans, assignments, studentCount] = await Promise.all([
    Batch.find({ program: program._id }).sort({ code: 1, category: 1 }).lean(),
    Course.find({ department: program.department }).sort({ code: 1 }).lean(),
    CurriculumPlan.find({ program: program._id }).sort({ version: -1 }).lean(),
    TeacherProgramAssignment.find(ownFilter({ program: program._id, status: 'active' }))
      .populate('teacher', 'name email')
      .sort({ assignedAt: -1 })
      .lean(),
    Student.countDocuments({ program: program._id, studentStatus: 'active' }),
  ]);
  res.json({
    program: {
      ...program,
      id: String(program._id),
      department: program.department ? { id: String(program.department._id), code: program.department.code, name: program.department.name } : null,
      teachers: (program.teachers || []).map((teacher) => ({ id: String(teacher._id), name: teacher.name || teacher.email, email: teacher.email })),
      _id: undefined,
    },
    assignments: assignments.map((row) => ({
      id: String(row._id),
      teacher: row.teacher ? { id: String(row.teacher._id), name: row.teacher.name || row.teacher.email, email: row.teacher.email } : null,
      status: row.status,
      source: row.source,
      assignedAt: row.assignedAt,
      assignedBy: row.assignedBy,
    })),
    batches: batches.map((row) => ({ ...row, id: String(row._id), _id: undefined })),
    courses: courses.map((row) => ({ ...row, id: String(row._id), _id: undefined })),
    plans: plans.map((row) => ({ ...row, id: String(row._id), _id: undefined })),
    studentCount,
  });
});

export const calendar = asyncHandler(async (_req, res) => {
  const [years, terms, events] = await Promise.all([
    AcademicYear.find().sort({ startDate: -1 }).lean(),
    AcademicTerm.find().populate('academicYear', 'label').sort({ startDate: 1 }).lean(),
    CalendarEvent.find().populate('academicYear', 'label').populate('term', 'name').sort({ startDate: 1 }).lean(),
  ]);
  res.json({
    years: years.map((row) => ({ ...row, id: String(row._id), _id: undefined })),
    terms: terms.map((row) => ({
      ...row,
      id: String(row._id),
      academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
      _id: undefined,
    })),
    events: events.map((row) => ({
      ...row,
      id: String(row._id),
      academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
      term: row.term ? { id: String(row.term._id), name: row.term.name } : null,
      _id: undefined,
    })),
  });
});

export const createAcademicYear = asyncHandler(async (req, res) => {
  const input = req.body;
  const overlap = await AcademicYear.findOne(ownFilter({
    startDate: { $lte: input.endDate },
    endDate: { $gte: input.startDate },
  })).lean();
  if (overlap) throw new AppError(409, 'ACADEMIC_YEAR_OVERLAP', 'That academic year overlaps an existing year.');
  if (input.isCurrent) await AcademicYear.updateMany({}, { $set: { isCurrent: false } });
  const year = await AcademicYear.create({ ...input, createdBy: req.user.id, updatedBy: req.user.id });
  audit({ req, action: 'registrar.calendar.year.create', targetType: 'AcademicYear', targetId: year._id, meta: { label: year.label } });
  res.status(201).json({ year });
});

export const updateAcademicYear = asyncHandler(async (req, res) => {
  const year = await AcademicYear.findById(req.valid.params.id);
  if (!year) throw new AppError(404, 'ACADEMIC_YEAR_NOT_FOUND', 'That academic year was not found.');
  const input = req.body;
  if (input.isCurrent) await AcademicYear.updateMany(ownFilter({ _id: { $ne: year._id } }), { $set: { isCurrent: false } });
  Object.assign(year, input, { updatedBy: req.user.id });
  await year.save();
  audit({ req, action: 'registrar.calendar.year.update', targetType: 'AcademicYear', targetId: year._id });
  res.json({ year });
});

export const createTerm = asyncHandler(async (req, res) => {
  const term = await AcademicTerm.create({ ...req.body, createdBy: req.user.id, updatedBy: req.user.id });
  audit({ req, action: 'registrar.calendar.term.create', targetType: 'AcademicTerm', targetId: term._id });
  res.status(201).json({ term });
});

export const updateTerm = asyncHandler(async (req, res) => {
  const term = await AcademicTerm.findById(req.valid.params.id);
  if (!term) throw new AppError(404, 'TERM_NOT_FOUND', 'That term was not found.');
  Object.assign(term, req.body, { updatedBy: req.user.id });
  await term.save();
  audit({ req, action: 'registrar.calendar.term.update', targetType: 'AcademicTerm', targetId: term._id });
  res.json({ term });
});

export const createCalendarEvent = asyncHandler(async (req, res) => {
  const input = req.body;
  const year = await AcademicYear.findById(input.academicYear).lean();
  if (!year) throw new AppError(400, 'ACADEMIC_YEAR_INVALID', 'Choose a valid academic year.');
  if (input.startDate < year.startDate || input.endDate > year.endDate) {
    throw new AppError(400, 'EVENT_OUTSIDE_YEAR', 'The event must fall inside the academic year.');
  }
  if (['registration', 'exam'].includes(input.type)) {
    const overlap = await CalendarEvent.findOne(ownFilter({
      academicYear: input.academicYear,
      type: input.type,
      startDate: { $lte: input.endDate },
      endDate: { $gte: input.startDate },
    })).lean();
    if (overlap) throw new AppError(409, 'EVENT_OVERLAP', `Another ${input.type} period overlaps those dates.`);
  }
  const event = await CalendarEvent.create({ ...input, createdBy: req.user.id, updatedBy: req.user.id });
  audit({ req, action: 'registrar.calendar.event.create', targetType: 'CalendarEvent', targetId: event._id, meta: { type: event.type } });
  res.status(201).json({ event });
});

export const updateCalendarEvent = asyncHandler(async (req, res) => {
  const event = await CalendarEvent.findById(req.valid.params.id);
  if (!event) throw new AppError(404, 'EVENT_NOT_FOUND', 'That calendar event was not found.');
  Object.assign(event, req.body, { updatedBy: req.user.id });
  await event.save();
  audit({ req, action: 'registrar.calendar.event.update', targetType: 'CalendarEvent', targetId: event._id });
  res.json({ event });
});

export const deleteCalendarEvent = asyncHandler(async (req, res) => {
  const event = await CalendarEvent.findByIdAndDelete(req.valid.params.id);
  if (!event) throw new AppError(404, 'EVENT_NOT_FOUND', 'That calendar event was not found.');
  audit({ req, action: 'registrar.calendar.event.delete', targetType: 'CalendarEvent', targetId: event._id });
  res.status(204).end();
});

export const listBatchGroups = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit } = pageOf(query);
  const filter = mergeFilters(
    query.program ? { program: query.program } : null,
    query.department ? { department: query.department } : null,
    query.category ? { category: query.category } : null,
    query.status && query.status !== 'all' ? { status: query.status } : null,
    searchFilter(query.search, ['code', 'name']),
  );
  const [rows, studentCounts] = await Promise.all([
    Batch.find(filter)
      .populate('program', 'code name qualificationType')
      .populate('department', 'code name')
      .populate('admissionAcademicYear', 'label')
      .sort({ code: 1, category: 1, createdAt: 1 })
      .lean(),
    Student.aggregate([{ $match: { batch: { $ne: null } } }, { $group: { _id: '$batch', count: { $sum: 1 } } }]),
  ]);
  const counts = new Map(studentCounts.map((row) => [String(row._id), row.count]));
  const groups = new Map();

  for (const row of rows) {
    const yearId = String(row.admissionAcademicYear?._id ?? row.admissionAcademicYear ?? '');
    const category = row.category || 'regular';
    const key = `${row.code}|${yearId}|${category}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        code: row.code,
        name: row.name,
        category,
        admissionAcademicYear: row.admissionAcademicYear
          ? { id: String(row.admissionAcademicYear._id), label: row.admissionAcademicYear.label }
          : null,
        status: row.status,
        currentLevel: row.currentLevel,
        batchIds: [],
        programs: [],
        studentCount: 0,
      });
    }
    const group = groups.get(key);
    group.batchIds.push(String(row._id));
    group.programIds = group.programIds || [];
    group.programIds.push(String(row.program?._id ?? row.program));
    group.programs.push(
      row.program
        ? {
            id: String(row.program._id),
            code: row.program.code,
            name: row.program.name,
            qualificationType: row.program.qualificationType,
            studentCount: counts.get(String(row._id)) || 0,
          }
        : null,
    );
    group.studentCount += counts.get(String(row._id)) || 0;
  }

  const all = [...groups.values()].sort(
    (a, b) =>
      String(a.code).localeCompare(String(b.code)) ||
      String(a.admissionAcademicYear?.label || '').localeCompare(String(b.admissionAcademicYear?.label || '')) ||
      a.category.localeCompare(b.category),
  );
  const start = (page - 1) * limit;
  res.json({
    groups: all.slice(start, start + limit).map((group) => ({
      ...group,
      id: group.key,
      programs: group.programs.filter(Boolean),
      batchCount: group.batchIds.length,
    })),
    pagination: {
      page,
      limit,
      total: all.length,
      pages: Math.max(1, Math.ceil(all.length / limit)),
    },
  });
});

export const requestBatchDeleteCode = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) throw new AppError(401, 'SESSION_ENDED', 'Please sign in again.');
  const sent = await sendCode(user, 'batch_delete');
  if (!sent) throw new AppError(429, 'WAIT_BEFORE_RESEND', 'Please wait before asking for another code.');
  audit({ req, action: 'registrar.batch.delete_code_sent', targetType: 'Batch', targetId: req.user.id });
  res.json({ message: `We emailed a 6-digit code to ${user.email}.`, email: user.email });
});

export const deleteBatchGroup = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) throw new AppError(401, 'SESSION_ENDED', 'Please sign in again.');
  await checkCode(user._id, 'batch_delete', req.body.code);

  const batches = await Batch.find(ownFilter({ _id: { $in: req.body.batchIds } })).lean();
  if (batches.length !== req.body.batchIds.length) {
    throw new AppError(404, 'BATCH_NOT_FOUND', 'One or more batches were not found.');
  }
  const signature = new Set(
    batches.map((row) => `${row.code}|${String(row.admissionAcademicYear)}|${row.category || 'regular'}`),
  );
  if (signature.size !== 1) {
    throw new AppError(400, 'BATCH_GROUP_MISMATCH', 'Select every programme row in one batch group.');
  }
  const batchIds = batches.map((row) => row._id);
  const [students, offerings] = await Promise.all([
    Student.countDocuments({ batch: { $in: batchIds } }),
    CourseOffering.countDocuments({ batch: { $in: batchIds } }),
  ]);
  if (students) {
    throw new AppError(
      409,
      'BATCH_HAS_STUDENTS',
      'This batch still has students. Move them to another batch or archive the batch instead.',
    );
  }
  if (offerings) {
    throw new AppError(
      409,
      'BATCH_HAS_OFFERINGS',
      'This batch still has course offerings. Remove those offerings before deleting the batch.',
    );
  }

  await Batch.deleteMany({ _id: { $in: batchIds } });
  audit({
    req,
    action: 'registrar.batch.delete',
    targetType: 'Batch',
    targetId: batchIds[0],
    meta: { code: batches[0].code, category: batches[0].category, count: batchIds.length },
  });
  res.json({ message: `${batches[0].code} ${batches[0].category} batch deleted.`, deleted: batchIds.length });
});

export const listBatches = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  const filter = mergeFilters(
    query.program ? { program: query.program } : null,
    query.department ? { department: query.department } : null,
    query.category ? { category: query.category } : null,
    query.status && query.status !== 'all' ? { status: query.status } : null,
    searchFilter(query.search, ['code', 'name']),
  );
  const [rows, total, studentCounts] = await Promise.all([
    Batch.find(filter)
      .populate('program', 'code name qualificationType')
      .populate('department', 'code name')
      .populate('admissionAcademicYear', 'label')
      .sort(sortOf(query, ['createdAt', 'code', 'name', 'currentLevel'], 'createdAt'))
      .skip(skip)
      .limit(limit)
      .lean(),
    Batch.countDocuments(filter),
    Student.aggregate([{ $match: { batch: { $ne: null } } }, { $group: { _id: '$batch', count: { $sum: 1 } } }]),
  ]);
  const counts = new Map(studentCounts.map((row) => [String(row._id), row.count]));
  res.json({
    ...paged(
      rows.map((row) => ({
        ...row,
        id: String(row._id),
        studentCount: counts.get(String(row._id)) || 0,
        program: row.program
          ? { id: String(row.program._id), code: row.program.code, name: row.program.name, qualificationType: row.program.qualificationType }
          : null,
        department: row.department ? { id: String(row.department._id), code: row.department.code, name: row.department.name } : null,
        admissionAcademicYear: row.admissionAcademicYear
          ? { id: String(row.admissionAcademicYear._id), label: row.admissionAcademicYear.label }
          : null,
        _id: undefined,
      })),
      total,
      page,
      limit,
    ),
  });
});

export const createBatch = asyncHandler(async (req, res) => {
  const input = req.body;
  const programIds = [...new Set((input.programs?.length ? input.programs : []).filter(Boolean).map(String))];
  if (!programIds.length) throw new AppError(400, 'PROGRAM_REQUIRED', 'Choose at least one programme for this batch.');

  const programmes = await Program.find(ownFilter({ _id: { $in: programIds } })).lean();
  if (programmes.length !== programIds.length) throw new AppError(400, 'PROGRAM_INVALID', 'Choose valid programmes.');
  const category = input.category || 'regular';
  for (const program of programmes) {
    if (!program.active) throw new AppError(409, 'PROGRAM_INACTIVE', 'That programme is inactive and cannot receive a new batch.');
    if (!(program.categories?.length ? program.categories : ['regular', 'extension']).includes(category)) {
      throw new AppError(409, 'PROGRAM_CATEGORY', 'This programme is not offered in the selected regular/extension stream.');
    }
  }

  const year = await AcademicYear.findById(input.admissionAcademicYear).lean();
  if (!year) throw new AppError(400, 'ACADEMIC_YEAR_INVALID', 'Choose a valid academic year.');
  const startYear = new Date(year.startDate).getFullYear();
  const code = String(input.code || `REG-BAT-${startYear}`).trim().toUpperCase();
  const name =
    String(input.name || '').trim() ||
    `${startYear} ${category === 'extension' ? 'Extension' : 'Regular'} Students`;
  const existing = await Batch.findOne(
    ownFilter({
      code,
      category,
      program: { $in: programIds },
    }),
  )
    .select('program code category')
    .lean();
  if (existing) {
    throw new AppError(
      409,
      'BATCH_EXISTS',
      'One of the chosen programmes already has a batch with this code and stream.',
    );
  }
  const durationYears = input.durationYears ? Number(input.durationYears) : null;
  const expectedCompletionYear = durationYears
    ? startYear + durationYears
    : input.expectedCompletionYear ?? null;
  const shared = {
    code,
    name,
    category,
    admissionAcademicYear: year._id,
    durationYears,
    expectedCompletionYear,
    currentLevel: input.currentLevel || 1,
    status: input.status || 'planned',
    createdBy: req.user.id,
    updatedBy: req.user.id,
  };

  const batches = await Batch.create(
    programmes.map((program) => ({
      ...shared,
      program: program._id,
      department: program.department,
      status: input.status || 'planned',
    })),
  );
  audit({
    req,
    action: 'registrar.batch.create',
    targetType: 'Batch',
    targetId: batches[0]._id,
    meta: { code: batches[0].code, count: batches.length, programs: programmes.map((program) => program.code) },
  });
  res.status(201).json({ batch: batches[0], batches });
});

export const updateBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.valid.params.id);
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'That batch was not found.');
  const input = req.body;

  // Allow status to be changed (e.g. to archived).
  if (input.status) {
    batch.status = input.status;
  }
  if (input.category) {
    const program = await Program.findById(batch.program).lean();
    if (!program) throw new AppError(400, 'PROGRAM_INVALID', 'Choose a valid programme.');
    if (!(program.categories?.length ? program.categories : ['regular', 'extension']).includes(input.category)) {
      throw new AppError(409, 'PROGRAM_CATEGORY', 'This programme is not offered in the selected regular/extension stream.');
    }
    batch.category = input.category;
  }
  // Allow adding/updating programmes by re-creating rows for new programmes and updating existing ones.
  if (input.programs?.length) {
    const existingProgramIds = new Set([String(batch.program)]);
    const newProgramIds = input.programs.filter((id) => !existingProgramIds.has(id)).map(String);
    if (newProgramIds.length) {
      const newPrograms = await Program.find(ownFilter({ _id: { $in: newProgramIds } })).lean();
      if (newPrograms.length !== newProgramIds.length) {
        throw new AppError(400, 'PROGRAM_INVALID', 'One or more selected programmes were not found.');
      }
      const category = input.category || batch.category || 'regular';
      for (const program of newPrograms) {
        if (!(program.categories?.length ? program.categories : ['regular', 'extension']).includes(category)) {
          throw new AppError(409, 'PROGRAM_CATEGORY', `Programme ${program.code} is not offered in the ${category} stream.`);
        }
      }
      await Batch.insertMany(
        newPrograms.map((program) => ({
          ...batch.toObject(),
          _id: undefined,
          program: program._id,
          department: program.department,
          createdAt: undefined,
          createdBy: req.user.id,
          updatedBy: req.user.id,
        })),
      );
    }
    batch.program = newProgramIds.length ? newPrograms?.[0]?._id ?? batch.program : batch.program;
  }
  if (input.durationYears) {
    const year = await AcademicYear.findById(input.admissionAcademicYear || batch.admissionAcademicYear).lean();
    if (year) {
      batch.admissionAcademicYear = year._id;
      batch.expectedCompletionYear = new Date(year.startDate).getFullYear() + Number(input.durationYears);
    }
  }
  if (input.code || input.name) {
    batch.code = input.code || batch.code;
    batch.name = input.name || batch.name;
  }
  batch.updatedBy = req.user.id;
  await batch.save();
  audit({ req, action: 'registrar.batch.update', targetType: 'Batch', targetId: batch._id });
  res.json({ batch });
});

export const getBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.valid.params.id)
    .populate('program', 'code name qualificationType durationYears')
    .populate('department', 'code name')
    .populate('admissionAcademicYear', 'label startDate endDate')
    .lean();
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'That batch was not found.');

  const [students, statusCounts, total] = await Promise.all([
    Student.find({ batch: batch._id })
      .select('studentId fullName sex email phone level studentStatus studentCategory admissionDate')
      .sort({ fullName: 1 })
      .limit(EXPORT_LIMIT)
      .lean(),
    Student.aggregate([{ $match: { batch: batch._id } }, { $group: { _id: '$studentStatus', count: { $sum: 1 } } }]),
    Student.countDocuments({ batch: batch._id }),
  ]);
  const counts = { all: total };
  for (const row of statusCounts) counts[row._id] = row.count;

  res.json({
    batch: {
      ...batch,
      id: String(batch._id),
      program: batch.program
        ? { id: String(batch.program._id), code: batch.program.code, name: batch.program.name, qualificationType: batch.program.qualificationType }
        : null,
      department: batch.department
        ? { id: String(batch.department._id), code: batch.department.code, name: batch.department.name }
        : null,
      admissionAcademicYear: batch.admissionAcademicYear
        ? { id: String(batch.admissionAcademicYear._id), label: batch.admissionAcademicYear.label }
        : null,
      _id: undefined,
    },
    students: students.map((student) => ({ ...student, id: String(student._id), _id: undefined })),
    counts,
    total,
    truncated: total > students.length,
  });
});

export const exportBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.valid.params.id)
    .populate('program', 'code name qualificationType')
    .populate('department', 'code name')
    .populate('admissionAcademicYear', 'label')
    .lean();
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'That batch was not found.');
  const students = await Student.find({ batch: batch._id })
    .select('studentId fullName sex email phone level studentStatus studentCategory admissionDate')
    .sort({ fullName: 1 })
    .limit(EXPORT_LIMIT)
    .lean();

  const result = await buildExport({
    format: req.valid.query.format,
    filenamePrefix: `batch-${batch.code}`,
    title: `${batch.code} batch register`,
    subtitle: [batch.name, batch.program?.name, batch.department?.name, batch.admissionAcademicYear?.label].filter(Boolean).join(' Â· '),
    summary: [
      { label: 'Students', value: students.length },
      { label: 'Stream', value: batch.category === 'extension' ? 'Extension' : 'Regular' },
      { label: 'Level', value: batch.currentLevel },
    ],
    columns: [
      { header: 'Student ID', key: 'studentId', width: 20 },
      { header: 'Full name', key: 'fullName', width: 30 },
      { header: 'Sex', key: 'sex', width: 10 },
      { header: 'Level', key: 'level', width: 8 },
      { header: 'Stream', key: 'category', width: 12 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Status', key: 'status', width: 14 },
    ],
    rows: students.map((student) => ({
      studentId: student.studentId,
      fullName: student.fullName,
      sex: student.sex,
      level: student.level,
      category: student.studentCategory,
      phone: student.phone,
      email: student.email,
      status: student.studentStatus,
    })),
  });

  audit({ req, action: 'registrar.batch.export', targetType: 'Batch', targetId: batch._id, meta: { format: req.valid.query.format, rows: result.rowCount } });
  res.status(200);
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Length', String(result.buffer.length));
  res.setHeader('X-Export-Rows', String(result.rowCount));
  res.setHeader('Cache-Control', 'no-store');
  res.send(result.buffer);
});

export const batchAssignmentPreview = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.valid.params.id).lean();
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'That batch was not found.');
  const input = req.body;
  const students = await Student.find(ownFilter({ _id: { $in: input.studentIds } })).select('studentId fullName program batch level').lean();
  const wrongProgram = students.filter((row) => String(row.program) !== String(batch.program));
  const already = students.filter((row) => String(row.batch) === String(batch._id));
  res.json({
    count: students.length - wrongProgram.length,
    wrongProgram: wrongProgram.map((row) => ({ id: String(row._id), studentId: row.studentId, fullName: row.fullName })),
    alreadyAssigned: already.map((row) => ({ id: String(row._id), studentId: row.studentId, fullName: row.fullName })),
  });
});

export const assignBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.valid.params.id).lean();
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'That batch was not found.');
  const { studentIds, level } = req.body;
  const students = await Student.find(ownFilter({ _id: { $in: studentIds }, program: batch.program }));
  let affected = 0;
  for (const student of students) {
    const fromLevel = student.level;
    student.batch = batch._id;
    if (level) student.level = level;
    student.updatedBy = req.user.id;
    await student.save();
    if (level && fromLevel !== level) {
      await ProgressionRecord.create({
        student: student._id,
        batch: batch._id,
        fromLevel,
        toLevel: level,
        effectiveDate: new Date(),
        reason: 'Batch assignment',
        actor: req.user.id,
      });
    }
    affected += 1;
  }
  audit({ req, action: 'registrar.batch.assign', targetType: 'Batch', targetId: batch._id, meta: { affected, level: level ?? null } });
  res.json({ affected });
});

export const progressBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.valid.params.id);
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'That batch was not found.');
  const { studentIds, toLevel, complete, effectiveDate, reason } = req.body;
  const students = await Student.find(ownFilter({ _id: { $in: studentIds }, batch: batch._id }));
  let affected = 0;
  for (const student of students) {
    const fromLevel = student.level;
    const nextLevel = complete ? student.level : toLevel || student.level + 1;
    if (!complete) {
      student.level = nextLevel;
      if (nextLevel > (batch.currentLevel || 1)) batch.currentLevel = nextLevel;
      await student.save();
      await ProgressionRecord.create({
        student: student._id,
        batch: batch._id,
        fromLevel,
        toLevel: nextLevel,
        effectiveDate: effectiveDate || new Date(),
        reason: reason || 'Level progression',
        actor: req.user.id,
      });
      await Enrollment.updateMany(
        { student: student._id, status: 'active' },
        { $set: { level: nextLevel, updatedBy: req.user.id } },
      );
    } else {
      student.studentStatus = 'graduated';
      student.enrollmentStatus = 'completed';
      student.completionDate = effectiveDate || new Date();
      await student.save();
      await Enrollment.updateMany(
        { student: student._id, status: 'active' },
        { $set: { status: 'completed', updatedBy: req.user.id }, $push: { statusHistory: { status: 'completed', by: req.user.id, reason: reason || 'Batch completion' } } },
      );
      await ProgressionRecord.create({
        student: student._id,
        batch: batch._id,
        fromLevel,
        toLevel: fromLevel,
        effectiveDate: effectiveDate || new Date(),
        reason: reason || 'Completed programme',
        actor: req.user.id,
      });
    }
    affected += 1;
  }
  batch.updatedBy = req.user.id;
  await batch.save();
  audit({ req, action: complete ? 'registrar.batch.complete' : 'registrar.batch.progress', targetType: 'Batch', targetId: batch._id, meta: { affected } });
  res.json({ affected });
});

export const listPlans = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);

  let departmentFilter = null;
  if (query.department) {
    const progIds = await Program.find({ department: query.department }).distinct('_id');
    departmentFilter = {
      $or: [
        { department: query.department },
        { program: { $in: progIds } },
      ],
    };
  }

  const filter = mergeFilters(
    departmentFilter,
    query.program ? { program: query.program } : null,
    query.academicYear ? { academicYear: query.academicYear } : null,
    query.status && query.status !== 'all' ? { status: query.status } : null,
  );
  const [rows, total] = await Promise.all([
    CurriculumPlan.find(filter)
      .populate('program', 'code name qualificationType durationYears levels')
      .populate('department', 'code name')
      .populate('academicYear', 'label')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CurriculumPlan.countDocuments(filter),
  ]);
  res.json({
    ...paged(
      rows.map((row) => ({
        ...row,
        id: String(row._id),
        program: row.program
          ? {
              id: String(row.program._id),
              code: row.program.code,
              name: row.program.name,
              qualificationType: row.program.qualificationType,
              durationYears: row.program.durationYears,
              levels: row.program.levels,
            }
          : null,
        department: row.department ? { id: String(row.department._id), code: row.department.code, name: row.department.name } : null,
        academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
        _id: undefined,
      })),
      total,
      page,
      limit,
    ),
  });
});

export const planOptions = asyncHandler(async (_req, res) => {
  // Sync any CourseResource records into Course collection so uploaded course materials appear in catalogue
  try {
    const resources = await CourseResource.find({ deletedAt: null })
      .populate('program', 'code name department')
      .populate('department', 'code name')
      .lean();
    for (const r of resources) {
      if (r.courseCode) {
        let deptId = r.department?._id || r.department || r.program?.department?._id || r.program?.department;
        if (!deptId) {
          const fallbackDept = await Department.findOne({ active: true }).lean();
          deptId = fallbackDept?._id;
        }
        if (deptId) {
          await Course.findOneAndUpdate(
            { code: r.courseCode.trim().toUpperCase() },
            {
              $setOnInsert: {
                code: r.courseCode.trim().toUpperCase(),
                createdBy: r.uploadedBy || null,
              },
              $set: {
                title: r.courseName ? r.courseName.trim() : r.courseCode,
                department: deptId,
                creditHours: Number(r.creditHours) || 3,
                active: true,
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          ).catch(() => {});
        }
      }
    }
  } catch {}

  // Ensure any inactive/legacy courses that have no active flag set default to active
  await Course.updateMany({ active: { $exists: false } }, { $set: { active: true } }).catch(() => {});

  const [departments, programs, years, courses, terms, resources] = await Promise.all([
    Department.find({ active: true }).sort({ name: 1 }).lean(),
    Program.find({ active: true }).populate('department', 'code name').sort({ name: 1 }).lean(),
    AcademicYear.find().sort({ startDate: -1 }).lean(),
    Course.find({ active: { $ne: false } })
      .populate('department', 'code name')
      .populate('prerequisites', 'code title')
      .sort({ code: 1 })
      .lean(),
    AcademicTerm.find().populate('academicYear', 'label').sort({ sequence: 1 }).lean(),
    CourseResource.find({ deletedAt: null })
      .populate('program', 'code name department')
      .populate('department', 'code name')
      .lean(),
  ]);

  // Build a lookup of program metadata by courseCode from CourseResource
  const resourceProgByCourseCode = new Map();
  for (const r of resources) {
    if (r.courseCode && r.program) {
      const p = r.program;
      resourceProgByCourseCode.set(r.courseCode.trim().toUpperCase(), {
        id: String(p._id || p.id || p),
        code: p.code || '',
        name: p.name || '',
      });
    }
  }

  res.json({
    departments: departments.map((row) => ({ id: String(row._id), code: row.code, name: row.name })),
    programs: programs.map((row) => ({
      id: String(row._id),
      code: row.code,
      name: row.name,
      qualificationType: row.qualificationType,
      durationYears: row.durationYears,
      levels: row.levels,
      department: row.department ? { id: String(row.department._id), code: row.department.code, name: row.department.name } : null,
    })),
    academicYears: years.map((row) => ({ id: String(row._id), label: row.label, isCurrent: row.isCurrent })),
    courses: courses.map((row) => {
      const codeUpper = String(row.code || '').trim().toUpperCase();
      const progMeta = resourceProgByCourseCode.get(codeUpper) || null;
      return {
        id: String(row._id),
        code: row.code,
        title: row.title,
        creditHours: row.creditHours,
        program: progMeta,
        prerequisites: (row.prerequisites || []).map((course) =>
          course && typeof course === 'object'
            ? { id: String(course._id), code: course.code, title: course.title }
            : { id: String(course), code: '', title: '' },
        ),
        department: row.department ? { id: String(row.department._id), code: row.department.code, name: row.department.name } : null,
      };
    }),
    terms: terms.map((row) => ({
      id: String(row._id),
      name: row.name,
      sequence: row.sequence,
      type: row.type,
      academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
    })),
  });
});

export const createPlan = asyncHandler(async (req, res) => {
  const { program: programId, academicYear: yearId, title, notes, cloneFrom } = req.body;
  const [program, year] = await Promise.all([Program.findById(programId).lean(), AcademicYear.findById(yearId).lean()]);
  if (!program) throw new AppError(400, 'PROGRAM_INVALID', 'Choose a valid programme.');
  if (!year) throw new AppError(400, 'ACADEMIC_YEAR_INVALID', 'Choose a valid academic year.');
  const draft = await CurriculumPlan.findOne({ program: programId, academicYear: yearId, status: 'draft' }).lean();
  if (draft) throw new AppError(409, 'DRAFT_EXISTS', 'A draft plan already exists for this programme and year.');
  const latest = await CurriculumPlan.findOne({ program: programId, academicYear: yearId }).sort({ version: -1 }).lean();
  const plan = await CurriculumPlan.create({
    program: program._id,
    department: program.department,
    qualificationType: program.qualificationType,
    academicYear: year._id,
    version: (latest?.version || 0) + 1,
    title: title || `${program.name} â€” ${year.label}`,
    notes: notes || '',
    sourcePlan: cloneFrom || null,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  if (cloneFrom) {
    const source = await CurriculumCourse.find({ plan: cloneFrom, active: true }).lean();
    if (source.length) {
      await CurriculumCourse.insertMany(
        source.map((row) => ({
          plan: plan._id,
          course: row.course,
          academicYear: year._id,
          term: row.term,
          level: row.level,
          creditHours: row.creditHours,
          category: row.category,
          prerequisites: row.prerequisites,
          order: row.order,
          active: true,
          createdBy: req.user.id,
        })),
      );
      await recalcPlan(plan._id);
    }
  }
  audit({ req, action: 'registrar.curriculum.plan.create', targetType: 'CurriculumPlan', targetId: plan._id, meta: { program: program.code, version: plan.version } });
  void notifyProgramTeachers(program._id, {
    type: 'curriculum_plan',
    title: `New curriculum draft for ${program.code}`,
    body: `${plan.title} was created. Open the curriculum page to review it.`,
    actorId: req.user.id,
    actorName: req.user.name || 'Registrar',
    meta: { planId: String(plan._id), program: program.code, version: plan.version },
  });
  res.status(201).json({ plan });
});

export const getPlan = asyncHandler(async (req, res) => {
  const plan = await CurriculumPlan.findById(req.valid.params.id)
    .populate('program', 'code name qualificationType durationYears levels graduationPolicy')
    .populate('department', 'code name')
    .populate('academicYear', 'label')
    .lean();
  if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'That curriculum plan was not found.');
  const courses = await CurriculumCourse.find({ plan: plan._id, active: true })
    .populate('course', 'code title creditHours department')
    .populate('prerequisites', 'code title')
    .sort({ level: 1, order: 1, createdAt: 1 })
    .lean();
  res.json({
    plan: {
      ...plan,
      id: String(plan._id),
      program: plan.program
        ? { ...plan.program, id: String(plan.program._id), _id: undefined }
        : null,
      department: plan.department ? { ...plan.department, id: String(plan.department._id), _id: undefined } : null,
      academicYear: plan.academicYear ? { ...plan.academicYear, id: String(plan.academicYear._id), _id: undefined } : null,
      _id: undefined,
    },
    courses: courses.map((row) => ({
      ...row,
      id: String(row._id),
      course: row.course
        ? { id: String(row.course._id), code: row.course.code, title: row.course.title, creditHours: row.course.creditHours }
        : null,
      prerequisites: (row.prerequisites || [])
        .filter((course) => course && course._id)
        .map((course) => ({ id: String(course._id), code: course.code, title: course.title })),
      _id: undefined,
    })),
  });
});

export const updatePlan = asyncHandler(async (req, res) => {
  const plan = await requirePlan(req.valid.params.id, { status: 'draft' });
  Object.assign(plan, req.body, { updatedBy: req.user.id });
  await plan.save();
  audit({ req, action: 'registrar.curriculum.plan.update', targetType: 'CurriculumPlan', targetId: plan._id });
  res.json({ plan });
});

export const addPlanCourse = asyncHandler(async (req, res) => {
  const plan = await requirePlan(req.valid.params.id, { status: 'draft' });
  const input = req.body;
  const course = await Course.findById(input.course).lean();
  if (!course || !course.active) throw new AppError(400, 'COURSE_INVALID', 'Choose an active course.');
  if (input.prerequisites?.length) {
    const count = await Course.countDocuments(ownFilter({ _id: { $in: input.prerequisites } }));
    if (count !== input.prerequisites.length) throw new AppError(400, 'PREREQUISITE_INVALID', 'One or more prerequisite courses were not found.');
    if (input.prerequisites.map(String).includes(String(course._id))) {
      throw new AppError(400, 'PREREQUISITE_SELF', 'A course cannot be its own prerequisite.');
    }
  }
  const duplicate = await CurriculumCourse.findOne({
    plan: plan._id,
    course: course._id,
    term: input.term,
    level: input.level,
  }).lean();
  if (duplicate) throw new AppError(409, 'COURSE_DUPLICATE', 'That course is already in this plan for that term and level.');
  const entry = await CurriculumCourse.create({
    ...input,
    plan: plan._id,
    course: course._id,
    academicYear: plan.academicYear,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  const totalCredits = await recalcPlan(plan._id);
  audit({ req, action: 'registrar.curriculum.course.add', targetType: 'CurriculumPlan', targetId: plan._id, meta: { course: course.code } });
  void notifyProgramTeachers(plan.program, {
    type: 'curriculum_course',
    title: `New course added to ${plan.title}`,
    body: `${course.code} Â· ${course.title} was added at level ${entry.level}${entry.term ? `, ${entry.term}` : ''}.`,
    actorId: req.user.id,
    actorName: req.user.name || 'Registrar',
    meta: { planId: String(plan._id), course: course.code, level: entry.level, term: entry.term },
  });
  res.status(201).json({ entry, totalCredits });
});

export const updatePlanCourse = asyncHandler(async (req, res) => {
  const plan = await requirePlan(req.valid.params.id, { status: 'draft' });
  const entry = await CurriculumCourse.findOne({ _id: req.valid.params.courseId, plan: plan._id });
  if (!entry) throw new AppError(404, 'PLAN_COURSE_NOT_FOUND', 'That curriculum course was not found.');
  if (req.body.prerequisites?.length) {
    const count = await Course.countDocuments(ownFilter({ _id: { $in: req.body.prerequisites } }));
    if (count !== req.body.prerequisites.length) throw new AppError(400, 'PREREQUISITE_INVALID', 'One or more prerequisite courses were not found.');
  }
  Object.assign(entry, req.body, { updatedBy: req.user.id });
  await entry.save();
  const totalCredits = await recalcPlan(plan._id);
  audit({ req, action: 'registrar.curriculum.course.update', targetType: 'CurriculumCourse', targetId: entry._id });
  res.json({ entry, totalCredits });
});

export const removePlanCourse = asyncHandler(async (req, res) => {
  const plan = await requirePlan(req.valid.params.id, { status: 'draft' });
  const entry = await CurriculumCourse.findOneAndDelete({ _id: req.valid.params.courseId, plan: plan._id });
  if (!entry) throw new AppError(404, 'PLAN_COURSE_NOT_FOUND', 'That curriculum course was not found.');
  const totalCredits = await recalcPlan(plan._id);
  audit({ req, action: 'registrar.curriculum.course.remove', targetType: 'CurriculumCourse', targetId: entry._id });
  res.json({ totalCredits });
});

export const reorderPlanCourses = asyncHandler(async (req, res) => {
  const plan = await requirePlan(req.valid.params.id, { status: 'draft' });
  await Promise.all(
    req.body.items.map((item) =>
      CurriculumCourse.updateOne({ _id: item.id, plan: plan._id }, { $set: { order: item.order, updatedBy: req.user.id } }),
    ),
  );
  audit({ req, action: 'registrar.curriculum.course.reorder', targetType: 'CurriculumPlan', targetId: plan._id });
  res.json({ ok: true });
});

export const publishPlan = asyncHandler(async (req, res) => {
  const plan = await requirePlan(req.valid.params.id);
  if (!['draft', 'published'].includes(plan.status)) throw new AppError(409, 'PLAN_STATE', 'Only a draft or published plan can be published.');
  const entries = await CurriculumCourse.find({ plan: plan._id, active: true }).populate('course', 'code title').lean();
  if (!entries.length) throw new AppError(400, 'PLAN_EMPTY', 'Add at least one course before publishing.');
  const seen = new Set();
  for (const entry of entries) {
    const key = `${entry.course?._id}-${entry.term}-${entry.level}`;
    if (seen.has(key)) throw new AppError(400, 'PLAN_DUPLICATE', 'The plan contains a duplicate course.');
    seen.add(key);
    if (!entry.creditHours || entry.creditHours <= 0) throw new AppError(400, 'PLAN_CREDITS', 'Every course needs a positive credit value.');
  }
  const totalCredits = entries.reduce((sum, row) => sum + Number(row.creditHours), 0);
  const previous = await CurriculumPlan.findOne(ownFilter({
    program: plan.program,
    academicYear: plan.academicYear,
    status: 'published',
    _id: { $ne: plan._id },
  }));
  if (previous) {
    previous.status = 'archived';
    previous.archivedAt = new Date();
    previous.archivedBy = req.user.id;
    await previous.save();
  }
  try {
    plan.status = 'published';
    plan.totalCredits = totalCredits;
    plan.publishedAt = new Date();
    plan.publishedBy = req.user.id;
    plan.updatedBy = req.user.id;
    await plan.save();
  } catch (err) {
    if (previous) {
      previous.status = 'published';
      previous.archivedAt = null;
      previous.archivedBy = null;
      await previous.save().catch(() => {});
    }
    throw err;
  }
  // Get programme and assigned teachers
  const program = await Program.findById(plan.program).populate('teachers', 'name email').lean();
  let programTeachers = (program?.teachers || []).filter(Boolean);

  // If no direct teachers on program, check active TeacherProgramAssignment records
  if (!programTeachers.length) {
    const assignments = await TeacherProgramAssignment.find({ program: plan.program, status: 'active' })
      .populate('teacher', 'name email')
      .lean();
    programTeachers = assignments.map((a) => a.teacher).filter(Boolean);
  }

  // If still none, check teachers belonging to this department
  const deptId = program?.department || plan.department;
  if (!programTeachers.length && deptId) {
    programTeachers = await User.find({
      role: { $in: ['TEACHER', 'teacher'] },
      department: deptId,
      status: { $ne: 'disabled' },
      deletedAt: null,
    }).select('name email').lean();
  }

  // Fallback to any active teachers if needed so classes have an instructor
  if (!programTeachers.length) {
    programTeachers = await User.find({
      role: { $in: ['TEACHER', 'teacher'] },
      status: { $ne: 'disabled' },
      deletedAt: null,
    }).limit(5).select('name email').lean();
  }

  const primaryTeacherId = programTeachers[0]?._id || null;

  // Make programme active and ensure teacher assignment sync
  if (programTeachers.length > 0) {
    await syncProgramTeachers({
      programId: plan.program,
      teacherIds: programTeachers.map((t) => t._id),
      source: 'program',
      actorId: req.user.id,
    }).catch(() => {});

    await Program.updateOne(
      { _id: plan.program },
      { $addToSet: { teachers: { $each: programTeachers.map((t) => t._id) } }, $set: { active: true } },
    ).catch(() => {});
  } else {
    await Program.updateOne({ _id: plan.program }, { $set: { active: true } }).catch(() => {});
  }

  // Make programme pending to active class: activate batches, student enrollments, and course offerings
  await Batch.updateMany(
    ownFilter({ program: plan.program, status: { $in: ['planned', 'pending'] } }),
    { $set: { status: 'active' } },
  ).catch(() => {});

  await Student.updateMany(
    ownFilter({ program: plan.program, enrollmentStatus: { $in: ['pending', 'planned'] } }),
    { $set: { enrollmentStatus: 'active' } },
  ).catch(() => {});

  await CourseOffering.updateMany(
    ownFilter({ program: plan.program, status: { $in: ['draft', 'pending'] } }),
    { $set: { status: 'open', ...(primaryTeacherId ? { teacher: primaryTeacherId } : {}) } },
  ).catch(() => {});

  // Auto-create/upsert course offerings for each curriculum course in this published plan
  for (const entry of entries) {
    if (!entry.course?._id) continue;
    try {
      const term = entry.term || 'Semester 1';
      const level = entry.level || 1;
      const creditHours = entry.creditHours || 3;

      const existingOffering = await CourseOffering.findOne(ownFilter({
        course: entry.course._id,
        program: plan.program,
        academicYear: plan.academicYear,
        term,
        level,
      }));

      if (!existingOffering) {
        await CourseOffering.create({
          course: entry.course._id,
          curriculumPlan: plan._id,
          curriculumCourse: entry._id,
          program: plan.program,
          department: plan.department || program?.department,
          academicYear: plan.academicYear,
          term,
          level,
          creditHours,
          teacher: primaryTeacherId,
          capacity: 60,
          registeredCount: 0,
          status: 'open',
          createdBy: req.user.id,
          updatedBy: req.user.id,
        });
      } else {
        existingOffering.status = 'open';
        if (!existingOffering.teacher && primaryTeacherId) {
          existingOffering.teacher = primaryTeacherId;
        }
        await existingOffering.save();
      }
    } catch {
      // Continue with other courses
    }
  }

  audit({ req, action: 'registrar.curriculum.plan.publish', targetType: 'CurriculumPlan', targetId: plan._id, meta: { totalCredits } });

  // In-app notifications to each teacher
  for (const teacher of programTeachers) {
    if (teacher?._id) {
      void notifyUser(teacher._id, {
        type: 'curriculum_published',
        title: `Course Offerings Assigned: ${plan.title}`,
        body: `${entries.length} course offerings have been assigned to your classes in ${program?.name || 'programme'}. Check teacher/classes.`,
        actorId: req.user.id,
        actorName: req.user.name || 'Registrar',
        meta: { planId: String(plan._id), program: String(plan.program), courseCount: entries.length },
      }).catch(() => {});
    }
  }
  void notifyProgramTeachers(plan.program, {
    type: 'curriculum_published',
    title: `Course Offerings Assigned: ${plan.title}`,
    body: `${entries.length} course offerings have been assigned to your classes in ${program?.name || 'programme'}. Check teacher/classes.`,
    actorId: req.user.id,
    actorName: req.user.name || 'Registrar',
    meta: { planId: String(plan._id), program: String(plan.program), courseCount: entries.length },
  }).catch(() => {});

  // Send email to each programme teacher
  for (const teacher of programTeachers) {
    if (teacher?.email) {
      void sendCurriculumOfferingEmail({
        to: teacher.email,
        name: teacher.name || 'Teacher',
        planTitle: plan.title,
        programName: program?.name || 'Programme',
        courseCount: entries.length,
      }).catch(() => {});
    }
  }

  res.json({ plan });
});

export const archivePlan = asyncHandler(async (req, res) => {
  const plan = await requirePlan(req.valid.params.id);
  plan.status = 'archived';
  plan.archivedAt = new Date();
  plan.archivedBy = req.user.id;
  plan.updatedBy = req.user.id;
  await plan.save();
  audit({ req, action: 'registrar.curriculum.plan.archive', targetType: 'CurriculumPlan', targetId: plan._id });
  res.json({ plan });
});

export const clonePlan = asyncHandler(async (req, res) => {
  const source = await requirePlan(req.valid.params.id);
  const draft = await CurriculumPlan.findOne({ program: source.program, academicYear: source.academicYear, status: 'draft' }).lean();
  if (draft) throw new AppError(409, 'DRAFT_EXISTS', 'A draft plan already exists for this programme and year.');
  const latest = await CurriculumPlan.findOne({ program: source.program, academicYear: source.academicYear }).sort({ version: -1 }).lean();
  const plan = await CurriculumPlan.create({
    program: source.program,
    department: source.department,
    qualificationType: source.qualificationType,
    academicYear: source.academicYear,
    version: (latest?.version || 0) + 1,
    title: `${source.title} (copy)`,
    notes: source.notes,
    sourcePlan: source._id,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  const sourceCourses = await CurriculumCourse.find({ plan: source._id, active: true }).lean();
  if (sourceCourses.length) {
    await CurriculumCourse.insertMany(sourceCourses.map((row) => ({
      plan: plan._id, course: row.course, academicYear: source.academicYear, term: row.term, level: row.level,
      creditHours: row.creditHours, category: row.category, prerequisites: row.prerequisites, order: row.order,
      active: true, createdBy: req.user.id,
    })));
    await recalcPlan(plan._id);
  }
  audit({ req, action: 'registrar.curriculum.plan.clone', targetType: 'CurriculumPlan', targetId: plan._id, meta: { source: String(source._id) } });
  res.status(201).json({ plan });
});

export const listOfferings = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  const filter = mergeFilters(
    query.academicYear ? { academicYear: query.academicYear } : null,
    query.term ? { term: query.term } : null,
    query.program ? { program: query.program } : null,
    query.level ? { level: query.level } : null,
    query.batch ? { batch: query.batch } : null,
    query.category ? { category: query.category } : null,
    query.status && query.status !== 'all' ? { status: query.status } : null,
  );
  const [rows, total] = await Promise.all([
    CourseOffering.find(filter)
      .populate('course', 'code title creditHours')
      .populate('program', 'code name qualificationType')
      .populate('academicYear', 'label')
      .populate('batch', 'code name category')
      .populate('teacher', 'name email role')
      .sort(sortOf(query, ['createdAt', 'term', 'level'], 'createdAt'))
      .skip(skip)
      .limit(limit)
      .lean(),
    CourseOffering.countDocuments(filter),
  ]);
  res.json({
    ...paged(
      rows.map((row) => ({
        ...row,
        id: String(row._id),
        course: row.course ? { id: String(row.course._id), code: row.course.code, title: row.course.title } : null,
        program: row.program
          ? { id: String(row.program._id), code: row.program.code, name: row.program.name, qualificationType: row.program.qualificationType }
          : null,
        academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
        batch: row.batch
          ? { id: String(row.batch._id), code: row.batch.code, name: row.batch.name, category: row.batch.category }
          : null,
        category: row.category || row.batch?.category || 'regular',
        teacher: row.teacher ? { id: String(row.teacher._id), name: row.teacher.name, email: row.teacher.email } : null,
        _id: undefined,
      })),
      total,
      page,
      limit,
    ),
  });
});

export const offeringOptions = asyncHandler(async (_req, res) => {
  const [departments, programs, years, teachers, plans, batches] = await Promise.all([
    Department.find({ active: true }).sort({ name: 1 }).lean(),
    Program.find({ active: true }).sort({ name: 1 }).lean(),
    AcademicYear.find().sort({ startDate: -1 }).lean(),
    User.find({ role: 'TEACHER', status: 'active', deletedAt: null }).select('name email').sort({ name: 1 }).lean(),
    CurriculumPlan.find({ status: 'published' })
      .populate('program', 'code name qualificationType')
      .populate('academicYear', 'label')
      .sort({ createdAt: -1 })
      .lean(),
    Batch.find(ownFilter({ status: { $ne: 'archived' } }))
      .select('code name program category admissionAcademicYear currentLevel status')
      .sort({ code: 1, category: 1 })
      .lean(),
  ]);
  res.json({
    departments: departments.map((row) => ({ id: String(row._id), code: row.code, name: row.name })),
    programs: programs.map((row) => ({ id: String(row._id), code: row.code, name: row.name, department: String(row.department) })),
    academicYears: years.map((row) => ({ id: String(row._id), label: row.label, isCurrent: row.isCurrent, status: row.status })),
    teachers: teachers.map((row) => ({ id: String(row._id), name: row.name || row.email, email: row.email })),
    plans: plans.map((row) => ({
      id: String(row._id),
      title: row.title,
      program: row.program
        ? {
            id: String(row.program._id),
            code: row.program.code,
            name: row.program.name,
            qualificationType: row.program.qualificationType,
          }
        : null,
      academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
    })),
    batches: batches.map((row) => ({
      id: String(row._id),
      code: row.code,
      name: row.name,
      program: String(row.program),
      category: row.category || 'regular',
      admissionAcademicYear: row.admissionAcademicYear ? String(row.admissionAcademicYear) : null,
      currentLevel: row.currentLevel ?? null,
      status: row.status ?? null,
    })),
  });
});

export const planOfferings = asyncHandler(async (req, res) => {
  const plan = await CurriculumPlan.findById(req.valid.params.id).lean();
  if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'That curriculum plan was not found.');
  const entries = await CurriculumCourse.find({ plan: plan._id, active: true })
    .populate('course', 'code title creditHours')
    .sort({ level: 1, order: 1 })
    .lean();
  const offerings = await CourseOffering.find({ curriculumPlan: plan._id }).select('curriculumCourse').lean();
  const created = new Set(offerings.map((row) => String(row.curriculumCourse)));
  res.json({
    entries: entries.map((row) => ({
      id: String(row._id),
      term: row.term,
      level: row.level,
      creditHours: row.creditHours,
      category: row.category,
      course: row.course ? { id: String(row.course._id), code: row.course.code, title: row.course.title } : null,
      hasOffering: created.has(String(row._id)),
    })),
  });
});

export const createOffering = asyncHandler(async (req, res) => {
  const entry = await CurriculumCourse.findById(req.body.curriculumCourse).populate('course').lean();
  if (!entry) throw new AppError(400, 'CURRICULUM_COURSE_INVALID', 'Choose a curriculum course.');
  const plan = await CurriculumPlan.findById(entry.plan).lean();
  if (!plan || plan.status !== 'published') throw new AppError(409, 'PLAN_NOT_PUBLISHED', 'Offerings can only be created from a published plan.');
  if (!entry.term) throw new AppError(400, 'TERM_MISSING', 'This curriculum course has no term. Set a term before creating an offering.');
  let teacher = null;
  if (req.body.teacher) {
    teacher = await User.findOne({ _id: req.body.teacher, role: 'TEACHER', status: 'active', deletedAt: null }).lean();
    if (!teacher) throw new AppError(400, 'TEACHER_INVALID', 'Choose an active teacher.');
  }
  let batch = null;
  if (req.body.batch) {
    batch = await Batch.findById(req.body.batch).lean();
    if (!batch) throw new AppError(400, 'BATCH_INVALID', 'Choose a valid batch.');
    if (String(batch.program) !== String(plan.program)) {
      throw new AppError(400, 'BATCH_PROGRAM_MISMATCH', 'The batch must belong to the programme of this offering.');
    }
    if (batch.status === 'archived') {
      throw new AppError(409, 'BATCH_ARCHIVED', 'An archived batch cannot receive a new offering.');
    }
  }
  const category = req.body.category || batch?.category || entry.category || 'regular';
  if (batch && batch.category !== category) {
    throw new AppError(400, 'BATCH_CATEGORY_MISMATCH', 'The selected batch belongs to a different stream.');
  }
  const existing = await CourseOffering.findOne({
    course: entry.course._id,
    program: plan.program,
    academicYear: plan.academicYear,
    term: entry.term,
    level: entry.level,
    batch: batch?._id ?? null,
    category,
  }).lean();
  if (existing) {
    throw new AppError(
      409,
      'OFFERING_EXISTS',
      'An offering already exists for that course, term, level, batch and stream.',
    );
  }
  const offering = await CourseOffering.create({
    course: entry.course._id,
    curriculumPlan: plan._id,
    curriculumCourse: entry._id,
    program: plan.program,
    department: plan.department,
    academicYear: plan.academicYear,
    term: entry.term,
    level: entry.level,
    batch: batch?._id ?? null,
    category,
    meetingDays: req.body.meetingDays || [],
    creditHours: entry.creditHours,
    teacher: teacher?._id ?? null,
    capacity: req.body.capacity,
    schedule: req.body.schedule || '',
    status: req.body.status || 'draft',
    teacherHistory: teacher ? [{ teacher: teacher._id, by: req.user.id }] : [],
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  audit({ req, action: 'registrar.offering.create', targetType: 'CourseOffering', targetId: offering._id });
  res.status(201).json({ offering });
});

export const updateOffering = asyncHandler(async (req, res) => {
  const offering = await CourseOffering.findById(req.valid.params.id);
  if (!offering) throw new AppError(404, 'OFFERING_NOT_FOUND', 'That offering was not found.');
  const input = req.body;
  if (input.teacher !== undefined && String(input.teacher || '') !== String(offering.teacher || '')) {
    if (input.teacher) {
      const teacher = await User.findOne({ _id: input.teacher, role: 'TEACHER', status: 'active', deletedAt: null }).lean();
      if (!teacher) throw new AppError(400, 'TEACHER_INVALID', 'Choose an active teacher.');
      offering.teacherHistory.push({ teacher: teacher._id, by: req.user.id, reason: 'Teacher reassignment' });
    }
    offering.teacher = input.teacher || null;
  }
  if (input.capacity !== undefined && input.capacity < offering.registeredCount) {
    throw new AppError(400, 'CAPACITY_TOO_LOW', 'Capacity cannot be below the number already registered.');
  }
  if (input.batch !== undefined) {
    if (input.batch) {
      const batch = await Batch.findById(input.batch).lean();
      if (!batch) throw new AppError(400, 'BATCH_INVALID', 'Choose a valid batch.');
      if (String(batch.program) !== String(offering.program)) {
        throw new AppError(400, 'BATCH_PROGRAM_MISMATCH', 'The batch must belong to the offering programme.');
      }
      offering.batch = batch._id;
      if (input.category === undefined && batch.category) offering.category = batch.category;
    } else {
      offering.batch = null;
    }
  }
  if (input.category !== undefined) offering.category = input.category;
  if (offering.batch) {
    const batch = await Batch.findById(offering.batch).lean();
    if (batch && batch.category !== offering.category) {
      throw new AppError(400, 'BATCH_CATEGORY_MISMATCH', 'The selected batch belongs to a different stream.');
    }
  }
  if (input.meetingDays !== undefined) offering.meetingDays = input.meetingDays;
  if (input.capacity !== undefined) offering.capacity = input.capacity;
  if (input.schedule !== undefined) offering.schedule = input.schedule;
  if (input.status !== undefined) offering.status = input.status;
  offering.updatedBy = req.user.id;
  await offering.save();
  audit({ req, action: 'registrar.offering.update', targetType: 'CourseOffering', targetId: offering._id });
  res.json({ offering });
});

async function registrationWindow(academicYearId, term) {
  const now = new Date();
  const query = ownFilter({ academicYear: academicYearId, type: 'registration', startDate: { $lte: now }, endDate: { $gte: now } });
  const events = await CalendarEvent.find(query).populate('term', 'name').lean();
  if (!events.length) return false;
  return events.some((event) => !event.term || event.term.name === term);
}

export const registrationEligible = asyncHandler(async (req, res) => {
  const { student: studentId, academicYear: yearId, term } = req.valid.query;
  const student = await Student.findById(studentId).lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const plan = await CurriculumPlan.findOne({ program: student.program, academicYear: yearId, status: 'published' }).lean();
  if (!plan) throw new AppError(409, 'PLAN_NOT_PUBLISHED', 'No published curriculum plan applies to this student and year.');
  const [entries, offerings, registrations, results, windowOpen] = await Promise.all([
    CurriculumCourse.find({ plan: plan._id, active: true }).populate('course', 'code title creditHours').lean(),
    CourseOffering.find(
      ownFilter({
        program: student.program,
        academicYear: yearId,
        term,
        level: student.level,
        category: student.studentCategory || 'regular',
        $or: [{ batch: null }, { batch: student.batch }],
      }),
    )
      .populate('course', 'code title creditHours')
      .populate('teacher', 'name email')
      .lean(),
    CourseRegistration.find(ownFilter({ student: studentId, academicYear: yearId, term, status: { $in: ['registered', 'completed'] } })).lean(),
    Result.find({ student: studentId, status: 'published' }).populate('course', 'code').lean(),
    registrationWindow(yearId, term),
  ]);
  const passed = new Set(results.filter((row) => row.passed).map((row) => String(row.course?._id ?? row.course)));
  const registered = new Set(registrations.map((row) => String(row.offering)));
  const entryByCourse = new Map(entries.map((row) => [String(row.course?._id ?? row.course), row]));
  const rows = offerings.filter((offering) => offering.course).map((offering) => {
    const entry = entryByCourse.get(String(offering.course?._id ?? offering.course));
    const prerequisites = entry?.prerequisites || [];
    const missingPrerequisites = prerequisites.filter((course) => !passed.has(String(course)));
    return {
      id: String(offering._id),
      course: offering.course
        ? { id: String(offering.course._id), code: offering.course.code, title: offering.course.title }
        : null,
      teacher: offering.teacher ? { id: String(offering.teacher._id), name: offering.teacher.name } : null,
      term: offering.term,
      level: offering.level,
      credits: offering.creditHours,
      capacity: offering.capacity,
      registeredCount: offering.registeredCount,
      seats: Math.max(0, offering.capacity - offering.registeredCount),
      status: offering.status,
      alreadyRegistered: registered.has(String(offering._id)),
      eligible:
        windowOpen &&
        offering.status === 'open' &&
        offering.registeredCount < offering.capacity &&
        !registered.has(String(offering._id)) &&
        missingPrerequisites.length === 0,
      missingPrerequisites,
    };
  });
  res.json({
    student: { id: String(student._id), studentId: student.studentId, fullName: student.fullName, level: student.level },
    plan: { id: String(plan._id), title: plan.title, version: plan.version, totalCredits: plan.totalCredits },
    windowOpen,
    offerings: rows,
  });
});

export const createRegistrations = asyncHandler(async (req, res) => {
  const { student: studentId, offeringIds } = req.body;
  const student = await Student.findById(studentId).lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  if (!['active', 'pending'].includes(student.enrollmentStatus)) {
    throw new AppError(409, 'STUDENT_NOT_ACTIVE', 'This student is not active for registration.');
  }
  const offerings = await CourseOffering.find(ownFilter({ _id: { $in: offeringIds } })).populate('course', 'code title').lean();
  if (offerings.length !== offeringIds.length) throw new AppError(400, 'OFFERING_INVALID', 'One or more offerings were not found.');
  const term = offerings[0].term;
  if (offerings.some((row) => row.term !== term)) throw new AppError(400, 'TERM_MIXED', 'Register courses from one term at a time.');
  for (const offering of offerings) {
    if (String(offering.program) !== String(student.program) || offering.level !== student.level) {
      throw new AppError(400, 'OFFERING_MISMATCH', 'Every selected course must belong to this studentâ€™s programme and level.');
    }
    if (offering.status !== 'open') throw new AppError(409, 'OFFERING_NOT_OPEN', 'One or more selected courses are not open for registration.');
    if (!(await registrationWindow(offering.academicYear, offering.term))) {
      throw new AppError(409, 'REGISTRATION_CLOSED', 'The registration window is not open for that term.');
    }
  }
  const plan = await CurriculumPlan.findById(offerings[0].curriculumPlan).lean();
  if (!plan || plan.status !== 'published') throw new AppError(409, 'PLAN_NOT_PUBLISHED', 'The curriculum plan is not published.');
  const courseIds = offerings.map((row) => row.course?._id).filter(Boolean);
  if (courseIds.length !== offerings.length) {
    throw new AppError(409, 'COURSE_UNAVAILABLE', 'One or more offerings no longer have a course and cannot be registered.');
  }
  const entries = await CurriculumCourse.find(ownFilter({ plan: plan._id, course: { $in: courseIds } })).lean();
  const entryByCourse = new Map(entries.map((row) => [String(row.course), row]));
  const results = await Result.find({ student: studentId, status: 'published' }).populate('course', 'code').lean();
  const passed = new Set(results.filter((row) => row.passed).map((row) => String(row.course?._id ?? row.course)));
  for (const offering of offerings) {
    const entry = entryByCourse.get(String(offering.course._id));
    const missing = (entry?.prerequisites || []).filter((course) => !passed.has(String(course)));
    if (missing.length) throw new AppError(409, 'PREREQUISITE_MISSING', 'A prerequisite has not been passed for one or more selected courses.');
  }

  const created = [];
  const fresh = [];
  const reserved = [];
  try {
  for (const offering of offerings) {
    const seat = await CourseOffering.findOneAndUpdate(
      ownFilter({ _id: offering._id, status: 'open', $expr: { $lt: ['$registeredCount', '$capacity'] } }),
      { $inc: { registeredCount: 1 }, $set: { updatedBy: req.user.id } },
      { new: true },
    );
    if (!seat) throw new AppError(409, 'OFFERING_FULL', 'One or more selected courses have no seats left.');
    try {
      const existing = await CourseRegistration.findOne({ student: studentId, offering: offering._id });
      if (existing) {
        if (existing.status === 'registered') {
          await CourseOffering.updateOne({ _id: offering._id }, { $inc: { registeredCount: -1 } });
          throw new AppError(409, 'ALREADY_REGISTERED', 'The student is already registered for one or more selected courses.');
        }
        existing.status = 'registered';
        existing.statusHistory.push({ status: 'registered', by: req.user.id, reason: 'Re-registered' });
        existing.registeredBy = req.user.id;
        existing.registeredAt = new Date();
        await existing.save();
        created.push(existing);
      } else {
        const registration = await CourseRegistration.create({
          student: studentId,
          offering: offering._id,
          course: offering.course._id,
          academicYear: offering.academicYear,
          term: offering.term,
          creditHours: offering.creditHours,
          status: 'registered',
          registeredBy: req.user.id,
          statusHistory: [{ status: 'registered', by: req.user.id }],
        });
        created.push(registration);
        fresh.push(registration._id);
      }
      reserved.push(offering._id);
    } catch (err) {
      await CourseOffering.updateOne({ _id: offering._id }, { $inc: { registeredCount: -1 } }).catch(() => {});
      throw err;
    }
  }
  } catch (err) {
    await CourseRegistration.deleteMany(ownFilter({ _id: { $in: fresh } })).catch(() => {});
    await CourseOffering.updateMany(ownFilter({ _id: { $in: reserved } }), { $inc: { registeredCount: -1 } }).catch(() => {});
    throw err;
  }
  audit({ req, action: 'registrar.registration.create', targetType: 'Student', targetId: studentId, meta: { count: created.length, term } });
  res.status(201).json({ registrations: created.map((row) => ({ id: String(row._id), offering: String(row.offering), status: row.status })) });
});

export const offeringCandidates = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  const offering = await CourseOffering.findById(req.valid.params.offering)
    .populate('course', 'code title creditHours')
    .populate('program', 'code name qualificationType')
    .populate('academicYear', 'label')
    .populate('teacher', 'name email')
    .lean();
  if (!offering) throw new AppError(404, 'OFFERING_NOT_FOUND', 'That course offering was not found.');
  if (!offering.course) throw new AppError(409, 'COURSE_UNAVAILABLE', 'This offering no longer has a course.');
  const plan = await CurriculumPlan.findOne({
    _id: offering.curriculumPlan,
    status: 'published',
  }).lean();
  if (!plan) throw new AppError(409, 'PLAN_NOT_PUBLISHED', 'No published curriculum plan applies to this offering.');
  const entry = await CurriculumCourse.findOne({ plan: plan._id, course: offering.course._id, active: true }).lean();
  if (!entry) throw new AppError(409, 'COURSE_NOT_IN_PLAN', 'This course is no longer part of the published plan.');
  const prerequisites = entry.prerequisites || [];
  const filter = mergeFilters(
    {
      program: offering.program?._id ?? offering.program,
      level: offering.level,
      enrollmentStatus: { $in: ['active', 'pending'] },
      studentStatus: 'active',
    },
    query.category ? { studentCategory: query.category } : null,
    query.batch ? { batch: query.batch } : null,
    searchFilter(query.search, ['studentId', 'fullName', 'email', 'phone']),
  );
  const [students, total] = await Promise.all([
    Student.find(filter)
      .populate('batch', 'code name')
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Student.countDocuments(filter),
  ]);
  const studentIds = students.map((row) => row._id);
  const [registrations, passed, windowOpen] = await Promise.all([
    studentIds.length
      ? CourseRegistration.find(ownFilter({ student: { $in: studentIds }, offering: offering._id, status: 'registered' }))
          .select('student')
          .lean()
      : [],
    studentIds.length && prerequisites.length
      ? Result.find(ownFilter({
          student: { $in: studentIds },
          course: { $in: prerequisites },
          status: 'published',
          passed: true,
        })).select('student course').lean()
      : [],
    registrationWindow(offering.academicYear?._id ?? offering.academicYear, offering.term),
  ]);
  const registered = new Set(registrations.map((row) => String(row.student)));
  const passedByStudent = new Map();
  for (const row of passed) {
    const key = String(row.student);
    if (!passedByStudent.has(key)) passedByStudent.set(key, new Set());
    passedByStudent.get(key).add(String(row.course));
  }
  const seats = Math.max(0, offering.capacity - offering.registeredCount);
  res.json({
    offering: {
      id: String(offering._id),
      course: { id: String(offering.course._id), code: offering.course.code, title: offering.course.title },
      program: offering.program
        ? { id: String(offering.program._id), code: offering.program.code, name: offering.program.name }
        : null,
      academicYear: offering.academicYear
        ? { id: String(offering.academicYear._id), label: offering.academicYear.label }
        : null,
      term: offering.term,
      level: offering.level,
      teacher: offering.teacher ? { id: String(offering.teacher._id), name: offering.teacher.name } : null,
      capacity: offering.capacity,
      registeredCount: offering.registeredCount,
      seats,
      status: offering.status,
    },
    plan: { id: String(plan._id), title: plan.title, version: plan.version },
    windowOpen,
    prerequisites: prerequisites.map(String),
    ...paged(
      students.map((student) => {
        const alreadyRegistered = registered.has(String(student._id));
        const studentPassed = passedByStudent.get(String(student._id)) || new Set();
        const missingPrerequisites = prerequisites.filter((course) => !studentPassed.has(String(course)));
        return {
          id: String(student._id),
          studentId: student.studentId,
          fullName: student.fullName,
          level: student.level,
          studentCategory: student.studentCategory || 'regular',
          batch: student.batch ? { id: String(student.batch._id), code: student.batch.code } : null,
          alreadyRegistered,
          missingPrerequisites,
          eligible:
            windowOpen &&
            offering.status === 'open' &&
            seats > 0 &&
            !alreadyRegistered &&
            missingPrerequisites.length === 0,
        };
      }),
      total,
      page,
      limit,
    ),
  });
});

export const registerOfferingStudents = asyncHandler(async (req, res) => {
  const { studentIds } = req.body;
  const offering = await CourseOffering.findById(req.valid.params.offering).populate('course', 'code title').lean();
  if (!offering) throw new AppError(404, 'OFFERING_NOT_FOUND', 'That course offering was not found.');
  if (!offering.course) throw new AppError(409, 'COURSE_UNAVAILABLE', 'This offering no longer has a course.');
  if (offering.status !== 'open') throw new AppError(409, 'OFFERING_NOT_OPEN', 'This course is not open for registration.');
  if (!(await registrationWindow(offering.academicYear, offering.term))) {
    throw new AppError(409, 'REGISTRATION_CLOSED', 'The registration window is not open for this term.');
  }
  const plan = await CurriculumPlan.findOne({
    _id: offering.curriculumPlan,
    status: 'published',
  }).lean();
  if (!plan) throw new AppError(409, 'PLAN_NOT_PUBLISHED', 'The curriculum plan is not published.');
  const entry = await CurriculumCourse.findOne({ plan: plan._id, course: offering.course._id, active: true }).lean();
  if (!entry) throw new AppError(409, 'COURSE_NOT_IN_PLAN', 'This course is no longer part of the published plan.');
  const prerequisites = entry.prerequisites || [];
  const students = await Student.find(ownFilter({
    _id: { $in: studentIds },
    program: offering.program,
    level: offering.level,
    enrollmentStatus: { $in: ['active', 'pending'] },
    studentStatus: 'active',
  })).select('_id studentId fullName').lean();
  if (students.length !== new Set(studentIds).size) {
    throw new AppError(400, 'STUDENT_MISMATCH', 'Every selected student must be active in this programme and level.');
  }
  if (prerequisites.length) {
    const passed = await Result.find(ownFilter({
      student: { $in: studentIds },
      course: { $in: prerequisites },
      status: 'published',
      passed: true,
    })).select('student course').lean();
    const passedByStudent = new Map();
    for (const row of passed) {
      const key = String(row.student);
      if (!passedByStudent.has(key)) passedByStudent.set(key, new Set());
      passedByStudent.get(key).add(String(row.course));
    }
    for (const student of students) {
      const studentPassed = passedByStudent.get(String(student._id)) || new Set();
      const missing = prerequisites.filter((course) => !studentPassed.has(String(course)));
      if (missing.length) {
        throw new AppError(409, 'PREREQUISITE_MISSING', `${student.fullName} has not passed every prerequisite for this course.`);
      }
    }
  }
  const already = await CourseRegistration.find(ownFilter({
    student: { $in: studentIds },
    offering: offering._id,
    status: 'registered',
  })).select('student').lean();
  if (already.length) {
    throw new AppError(409, 'ALREADY_REGISTERED', `${already.length} selected student${already.length === 1 ? ' is' : 's are'} already registered for this course.`);
  }

  const fresh = [];
  const reserved = [];
  const reregistered = [];
  let registered = 0;
  try {
    for (const student of students) {
      const seat = await CourseOffering.findOneAndUpdate(
        ownFilter({ _id: offering._id, status: 'open', $expr: { $lt: ['$registeredCount', '$capacity'] } }),
        { $inc: { registeredCount: 1 }, $set: { updatedBy: req.user.id } },
        { new: true },
      );
      if (!seat) throw new AppError(409, 'OFFERING_FULL', 'This course has no seats left.');
      try {
        const existing = await CourseRegistration.findOne({ student: student._id, offering: offering._id });
        if (existing) {
          reregistered.push({
            registration: existing,
            status: existing.status,
            registeredBy: existing.registeredBy,
            registeredAt: existing.registeredAt,
          });
          existing.status = 'registered';
          existing.statusHistory.push({ status: 'registered', by: req.user.id, reason: 'Bulk re-registration' });
          existing.registeredBy = req.user.id;
          existing.registeredAt = new Date();
          await existing.save();
        } else {
          const registration = await CourseRegistration.create({
            student: student._id,
            offering: offering._id,
            course: offering.course._id,
            academicYear: offering.academicYear,
            term: offering.term,
            creditHours: offering.creditHours,
            status: 'registered',
            registeredBy: req.user.id,
            statusHistory: [{ status: 'registered', by: req.user.id }],
          });
          fresh.push(registration._id);
        }
        reserved.push(offering._id);
        registered += 1;
      } catch (err) {
        await CourseOffering.updateOne({ _id: offering._id }, { $inc: { registeredCount: -1 } }).catch(() => {});
        throw err;
      }
    }
  } catch (err) {
    await CourseRegistration.deleteMany(ownFilter({ _id: { $in: fresh } })).catch(() => {});
    for (const row of reregistered) {
      if (row.registration.status !== 'registered') continue;
      row.registration.status = row.status;
      row.registration.registeredBy = row.registeredBy;
      row.registration.registeredAt = row.registeredAt;
      row.registration.statusHistory.pop();
      await row.registration.save().catch(() => {});
    }
    await CourseOffering.updateMany(ownFilter({ _id: { $in: reserved } }), { $inc: { registeredCount: -1 } }).catch(() => {});
    throw err;
  }
  audit({
    req,
    action: 'registrar.registration.bulk',
    targetType: 'CourseOffering',
    targetId: offering._id,
    meta: { count: registered, term: offering.term, course: offering.course.code },
  });
  res.status(201).json({ registered, offering: String(offering._id) });
});

export const listRegistrations = asyncHandler(async (req, res) => {
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
  const countFilter = mergeFilters(
    studentIds ? { student: { $in: studentIds } } : query.student ? { student: query.student } : null,
    query.academicYear ? { academicYear: query.academicYear } : null,
    query.term ? { term: query.term } : null,
  );
  const filter = mergeFilters(
    countFilter,
    query.status && query.status !== 'all' ? { status: query.status } : null,
  );
  const [rows, total, statusGroups] = await Promise.all([
    CourseRegistration.find(filter)
      .populate('student', 'studentId fullName level studentCategory')
      .populate({ path: 'offering', populate: { path: 'course', select: 'code title' } })
      .populate('academicYear', 'label')
      .sort(sortOf(query, ['createdAt', 'status', 'term'], 'createdAt'))
      .skip(skip)
      .limit(limit)
      .lean(),
    CourseRegistration.countDocuments(filter),
    CourseRegistration.aggregate([
      { $match: countFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  const counts = { all: 0 };
  for (const row of statusGroups) {
    counts[row._id] = row.count;
    counts.all += row.count;
  }
  res.json({
    ...paged(
      rows.map((row) => ({
        ...row,
        id: String(row._id),
        student: row.student
          ? {
              id: String(row.student._id),
              studentId: row.student.studentId,
              fullName: row.student.fullName,
              level: row.student.level,
              studentCategory: row.student.studentCategory || 'regular',
            }
          : null,
        course: row.offering?.course ? { id: String(row.offering.course._id), code: row.offering.course.code, title: row.offering.course.title } : null,
        academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
        _id: undefined,
      })),
      total,
      page,
      limit,
    ),
    counts,
  });
});

export const dropRegistration = asyncHandler(async (req, res) => {
  const registration = await CourseRegistration.findById(req.valid.params.id);
  if (!registration) throw new AppError(404, 'REGISTRATION_NOT_FOUND', 'That registration was not found.');
  if (registration.status !== 'registered') throw new AppError(409, 'REGISTRATION_STATE', 'Only an active registration can be dropped.');
  registration.status = 'dropped';
  registration.statusHistory.push({ status: 'dropped', by: req.user.id, reason: req.body.reason });
  await registration.save();
  await CourseOffering.updateOne(ownFilter({ _id: registration.offering, registeredCount: { $gt: 0 } }), { $inc: { registeredCount: -1 } });
  audit({ req, action: 'registrar.registration.drop', targetType: 'CourseRegistration', targetId: registration._id });
  res.json({ registration });
});


