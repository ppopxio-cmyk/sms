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
  const [departments, programs, courses, plans] = await Promise.all([
    Department.find().sort({ name: 1 }).lean(),
    Program.find().populate('department', 'code name').sort({ name: 1 }).lean(),
    Course.find().populate('department', 'code name').sort({ code: 1 }).lean(),
    CurriculumPlan.find({ status: 'published' })
      .populate('program', 'code name qualificationType')
      .populate('academicYear', 'label')
      .sort({ createdAt: -1 })
      .lean(),
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
      department: row.department
        ? { id: String(row.department._id), code: row.department.code, name: row.department.name }
        : null,
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

export const listBatches = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  const filter = mergeFilters(
    query.program ? { program: query.program } : null,
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
  const program = await Program.findById(input.program).lean();
  if (!program) throw new AppError(400, 'PROGRAM_INVALID', 'Choose a valid programme.');
  const year = await AcademicYear.findById(input.admissionAcademicYear).lean();
  if (!year) throw new AppError(400, 'ACADEMIC_YEAR_INVALID', 'Choose a valid academic year.');
  const batch = await Batch.create({
    ...input,
    department: program.department,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  audit({ req, action: 'registrar.batch.create', targetType: 'Batch', targetId: batch._id, meta: { code: batch.code } });
  res.status(201).json({ batch });
});

export const updateBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.valid.params.id);
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'That batch was not found.');
  const input = req.body;
  if (input.program && String(input.program) !== String(batch.program)) {
    const program = await Program.findById(input.program).lean();
    if (!program) throw new AppError(400, 'PROGRAM_INVALID', 'Choose a valid programme.');
    batch.program = program._id;
    batch.department = program.department;
  }
  Object.assign(batch, input, { updatedBy: req.user.id });
  await batch.save();
  audit({ req, action: 'registrar.batch.update', targetType: 'Batch', targetId: batch._id });
  res.json({ batch });
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
  const filter = mergeFilters(
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
  const [programs, years, courses] = await Promise.all([
    Program.find({ active: true }).populate('department', 'code name').sort({ name: 1 }).lean(),
    AcademicYear.find().sort({ startDate: -1 }).lean(),
    Course.find({ active: true }).populate('department', 'code name').sort({ code: 1 }).lean(),
  ]);
  res.json({
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
    courses: courses.map((row) => ({
      id: String(row._id),
      code: row.code,
      title: row.title,
      creditHours: row.creditHours,
      department: row.department ? { id: String(row.department._id), code: row.department.code, name: row.department.name } : null,
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
    title: title || `${program.name} — ${year.label}`,
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
      prerequisites: (row.prerequisites || []).map((course) => ({ id: String(course._id), code: course.code, title: course.title })),
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
  audit({ req, action: 'registrar.curriculum.plan.publish', targetType: 'CurriculumPlan', targetId: plan._id, meta: { totalCredits } });
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
    query.status && query.status !== 'all' ? { status: query.status } : null,
  );
  const [rows, total] = await Promise.all([
    CourseOffering.find(filter)
      .populate('course', 'code title creditHours')
      .populate('program', 'code name qualificationType')
      .populate('academicYear', 'label')
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
        program: row.program ? { id: String(row.program._id), code: row.program.code, name: row.program.name } : null,
        academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
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
  const [programs, years, teachers, plans] = await Promise.all([
    Program.find({ active: true }).sort({ name: 1 }).lean(),
    AcademicYear.find().sort({ startDate: -1 }).lean(),
    User.find({ role: 'TEACHER', status: 'active', deletedAt: null }).select('name email').sort({ name: 1 }).lean(),
    CurriculumPlan.find({ status: 'published' })
      .populate('program', 'code name')
      .populate('academicYear', 'label')
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  res.json({
    programs: programs.map((row) => ({ id: String(row._id), code: row.code, name: row.name })),
    academicYears: years.map((row) => ({ id: String(row._id), label: row.label, isCurrent: row.isCurrent })),
    teachers: teachers.map((row) => ({ id: String(row._id), name: row.name || row.email, email: row.email })),
    plans: plans.map((row) => ({
      id: String(row._id),
      title: row.title,
      program: row.program ? { id: String(row.program._id), code: row.program.code, name: row.program.name } : null,
      academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
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
  const existing = await CourseOffering.findOne({
    course: entry.course._id,
    program: plan.program,
    academicYear: plan.academicYear,
    term: entry.term,
    level: entry.level,
  }).lean();
  if (existing) throw new AppError(409, 'OFFERING_EXISTS', 'An offering already exists for that course, term and level.');
  const offering = await CourseOffering.create({
    course: entry.course._id,
    curriculumPlan: plan._id,
    curriculumCourse: entry._id,
    program: plan.program,
    department: plan.department,
    academicYear: plan.academicYear,
    term: entry.term,
    level: entry.level,
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
    CourseOffering.find({ program: student.program, academicYear: yearId, term, level: student.level })
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
  const rows = offerings.map((offering) => {
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
      throw new AppError(400, 'OFFERING_MISMATCH', 'Every selected course must belong to this student’s programme and level.');
    }
    if (offering.status !== 'open') throw new AppError(409, 'OFFERING_NOT_OPEN', 'One or more selected courses are not open for registration.');
    if (!(await registrationWindow(offering.academicYear, offering.term))) {
      throw new AppError(409, 'REGISTRATION_CLOSED', 'The registration window is not open for that term.');
    }
  }
  const plan = await CurriculumPlan.findById(offerings[0].curriculumPlan).lean();
  if (!plan || plan.status !== 'published') throw new AppError(409, 'PLAN_NOT_PUBLISHED', 'The curriculum plan is not published.');
  const entries = await CurriculumCourse.find(ownFilter({ plan: plan._id, course: { $in: offerings.map((row) => row.course._id) } })).lean();
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
