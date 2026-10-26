import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { Assessment } from '../models/Assessment.js';
import { AttendanceSheet } from '../models/AttendanceSheet.js';
import { Batch, Course, AcademicYear } from '../models/AcademicStructure.js';
import { CourseResource } from '../models/CourseResource.js';
import { CurriculumPlan } from '../models/Curriculum.js';
import {
  ASSIGNMENT_POPULATE,
  READ_STATUSES,
  WRITE_STATUSES,
  assignmentDto,
  assignmentForTeacherRead,
} from './teacherScope.service.js';
import { activeProgramIdsForTeacher, activeProgramsForTeacher, teacherOfferingFilter } from './teacherAccess.service.js';
import { ownFilter } from './registrar.helpers.js';

export async function ensureOfferingsForTeacherPrograms(teacherId) {
  try {
    const programs = await activeProgramsForTeacher(teacherId);
    if (!programs.length) return;

    const progIds = programs.map((p) => p._id);
    const [batches, resources, plans, existingOfferings, currentYear] = await Promise.all([
      Batch.find(ownFilter({ program: { $in: progIds } })).lean(),
      CourseResource.find(ownFilter({ program: { $in: progIds }, deletedAt: null })).lean(),
      CurriculumPlan.find(ownFilter({ program: { $in: progIds } })).populate('courses.course').lean(),
      CourseOffering.find(ownFilter({ program: { $in: progIds } })).lean(),
      AcademicYear.findOne(ownFilter({ isCurrent: true })).lean() || AcademicYear.findOne().sort({ createdAt: -1 }).lean(),
    ]);

    const defaultYearId = currentYear?._id;

    for (const prog of programs) {
      const progBatches = batches.filter((b) => String(b.program) === String(prog._id));
      const progResources = resources.filter((r) => String(r.program) === String(prog._id));
      const progPlans = plans.filter((p) => String(p.program) === String(prog._id));

      const coursesToEnsure = [];

      for (const res of progResources) {
        if (res.courseCode) {
          coursesToEnsure.push({
            code: res.courseCode.toUpperCase(),
            title: res.courseName || res.courseCode,
            creditHours: res.creditHours || 3,
            level: res.level || 1,
            batches: res.batches || [],
          });
        }
      }

      for (const plan of progPlans) {
        for (const entry of plan.courses || []) {
          const cObj = entry.course;
          if (cObj && cObj.code) {
            coursesToEnsure.push({
              code: cObj.code.toUpperCase(),
              title: cObj.title || cObj.name || cObj.code,
              creditHours: entry.creditHours || cObj.creditHours || 3,
              level: entry.level || 1,
            });
          }
        }
      }

      const uniqueCourses = new Map();
      for (const c of coursesToEnsure) {
        if (!uniqueCourses.has(c.code)) {
          uniqueCourses.set(c.code, c);
        }
      }

      if (uniqueCourses.size === 0 && prog.department) {
        const deptId = prog.department?._id || prog.department;
        const deptCourses = await Course.find(ownFilter({ department: deptId, active: true })).limit(10).lean();
        for (const dc of deptCourses) {
          if (!uniqueCourses.has(dc.code)) {
            uniqueCourses.set(dc.code, {
              code: dc.code.toUpperCase(),
              title: dc.title || dc.name || dc.code,
              creditHours: dc.creditHours || 3,
              level: 1,
            });
          }
        }
      }

      for (const courseItem of uniqueCourses.values()) {
        const courseDoc = await Course.findOneAndUpdate(
          { code: courseItem.code },
          {
            $setOnInsert: {
              code: courseItem.code,
              title: courseItem.title,
              department: prog.department?._id || prog.department,
              creditHours: courseItem.creditHours || 3,
              active: true,
              createdBy: teacherId,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        const targetBatches = progBatches.length > 0 ? progBatches : [null];

        for (const b of targetBatches) {
          const batchId = b ? b._id : null;
          const category = b?.category || 'regular';
          const yearId = b?.admissionAcademicYear || defaultYearId;

          const match = existingOfferings.find(
            (o) =>
              String(o.program) === String(prog._id) &&
              String(o.course) === String(courseDoc._id) &&
              (!batchId || !o.batch || String(o.batch) === String(batchId)),
          );

          if (!match) {
            await CourseOffering.create({
              course: courseDoc._id,
              program: prog._id,
              department: prog.department?._id || prog.department,
              academicYear: yearId,
              term: 'Semester 1',
              level: courseItem.level || 1,
              creditHours: courseItem.creditHours || 3,
              teacher: teacherId,
              batch: batchId,
              category,
              capacity: 60,
              registeredCount: 0,
              status: 'open',
              createdBy: teacherId,
              updatedBy: teacherId,
            }).catch(() => {});
          } else if (!match.teacher) {
            await CourseOffering.updateOne(
              { _id: match._id },
              { $set: { teacher: teacherId, status: 'open' } },
            ).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    // Non-blocking sync
  }
}

const matches = (row, term) => {
  if (!term) return true;
  const haystack = [
    row.courseCode,
    row.courseTitle,
    row.program,
    row.level ? `level ${row.level}` : '',
    row.academicYear,
    row.term,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
};

export async function listTeacherAssignments(teacherId, query) {
  await ensureOfferingsForTeacherPrograms(teacherId);
  const statuses =
    query.status === 'all'
      ? ['open', 'in_progress', 'completed', 'draft', 'pending']
      : query.status === 'active'
        ? WRITE_STATUSES
        : query.status === 'pending'
          ? ['draft', 'pending']
          : query.status === 'completed'
            ? ['completed']
            : READ_STATUSES;
  const access = await teacherOfferingFilter(teacherId);
  const clauses = [access, { status: { $in: statuses } }];
  if (query.program) clauses.push({ program: query.program });
  if (query.batch) clauses.push({ batch: query.batch });
  if (query.category) clauses.push({ category: query.category });

  const rows = await CourseOffering.find(ownFilter({ $and: clauses }))
    .populate(ASSIGNMENT_POPULATE)
    .sort({ createdAt: -1 })
    .lean();

  const ids = rows.map((row) => row._id);
  const [registrationCounts, assessmentCounts, attendanceCounts] = await Promise.all([
    CourseRegistration.aggregate([
      { $match: { offering: { $in: ids }, status: 'registered' } },
      { $group: { _id: '$offering', count: { $sum: 1 } } },
    ]),
    Assessment.aggregate([
      { $match: { offering: { $in: ids } } },
      {
        $group: {
          _id: '$offering',
          count: { $sum: 1 },
          awaiting: { $sum: { $cond: [{ $in: ['$status', ['published', 'closed']] }, 1, 0] } },
        },
      },
    ]),
    AttendanceSheet.aggregate([
      { $match: { offering: { $in: ids }, status: 'draft' } },
      { $group: { _id: '$offering', count: { $sum: 1 } } },
    ]),
  ]);

  const registrations = Object.fromEntries(registrationCounts.map((row) => [String(row._id), row.count]));
  const assessments = Object.fromEntries(
    assessmentCounts.map((row) => [String(row._id), { total: row.count, awaiting: row.awaiting }]),
  );
  const attendance = Object.fromEntries(attendanceCounts.map((row) => [String(row._id), row.count]));

  const search = String(query.search || '').trim().toLowerCase();
  const filtered = rows
    .map((row) =>
      assignmentDto(
        row,
        {
          studentCount: registrations[String(row._id)] || 0,
          assessmentCount: assessments[String(row._id)]?.total || 0,
          assessmentsAwaitingSubmission: assessments[String(row._id)]?.awaiting || 0,
          attendanceDrafts: attendance[String(row._id)] || 0,
        },
        teacherId,
      ),
    )
    .filter((row) => matches(row, search));

  const total = filtered.length;
  const start = (query.page - 1) * query.limit;
  const programs = await activeProgramsForTeacher(teacherId);
  const teacherProgramIds = new Set(programs.map((p) => String(p._id)));

  // Enrich with teacherProgramIds for manage permissions
  const enrichedAssignments = filtered.slice(start, start + query.limit).map((dto) => {
    if (dto.programId && teacherProgramIds.has(String(dto.programId))) {
      return { ...dto, canManage: true };
    }
    return dto;
  });

  const progIds = programs.map((p) => p._id);
  const batches = progIds.length
    ? await Batch.find(ownFilter({ program: { $in: progIds } })).sort({ code: 1, category: 1 }).lean()
    : [];

  return {
    assignments: enrichedAssignments,
    programs: programs.map((row) => ({
      id: String(row._id),
      code: row.code,
      name: row.name,
      qualificationType: row.qualificationType,
      department: row.department ? { id: String(row.department._id), code: row.department.code, name: row.department.name } : null,
    })),
    batches: batches.map((b) => ({
      id: String(b._id),
      code: b.code,
      name: b.name,
      category: b.category || 'regular',
      program: String(b.program),
      status: b.status,
    })),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function teacherAssignmentDetail(teacherId, assignmentId) {
  const row = await assignmentForTeacherRead(teacherId, assignmentId).catch(() => null);
  if (!row) return null;

  const [students, assessments, attendance] = await Promise.all([
    CourseRegistration.countDocuments({ offering: assignmentId, status: 'registered' }),
    Assessment.aggregate([
      { $match: { offering: row._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    AttendanceSheet.find({ offering: assignmentId })
      .sort({ date: -1, createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  const assessmentCounts = { draft: 0, published: 0, closed: 0, submitted: 0 };
  for (const group of assessments) assessmentCounts[group._id] = group.count;

  const teacherProgIds = new Set(await activeProgramIdsForTeacher(teacherId));

  return assignmentDto(
    row,
    {
      studentCount: students,
      assessmentCounts,
      recentAttendance: attendance.map((sheet) => ({
        id: String(sheet._id),
        dateKey: sheet.dateKey,
        period: sheet.period,
        status: sheet.status,
      })),
    },
    teacherId,
    teacherProgIds,
  );
}
