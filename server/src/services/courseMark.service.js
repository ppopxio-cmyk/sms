import { AppError } from '../utils/AppError.js';
import { CourseMarkPolicy, MARK_COMPONENTS } from '../models/CourseMarkPolicy.js';
import { GradingPolicy, Result, findBand } from '../models/Records.js';
import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { buildExport } from './export.service.js';
import { notifyRole } from './notification.service.js';
import { ownFilter } from './registrar.helpers.js';
import {
  ASSIGNMENT_POPULATE,
  activeEnrollments,
  assignmentDto,
  assignmentForTeacher,
  assignmentIdsForTeacher,
  readAssignmentIdsForTeacher,
  enrollmentDto,
} from './teacherScope.service.js';

const ROUND = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const MARK_TOTAL = 100;

function policyDto(policy) {
  if (!policy) return null;
  const weights = Object.fromEntries(MARK_COMPONENTS.map(({ key }) => [key, Number(policy.weights?.[key] || 0)]));
  return {
    id: String(policy._id),
    weights,
    components: MARK_COMPONENTS.map(({ key, label }) => ({ key, label, max: weights[key] })),
    total: MARK_COMPONENTS.reduce((sum, { key }) => sum + weights[key], 0),
    updatedAt: policy.updatedAt,
  };
}

function componentScores(policy, row = {}) {
  return MARK_COMPONENTS.map(({ key, label }) => {
    const raw = row?.[key];
    return {
      name: label,
      max: Number(policy.weights?.[key] || 0),
      score: raw === '' || raw === undefined || raw === null ? null : Number(raw),
    };
  });
}

function resultScores(policy, result) {
  const byName = new Map((result?.components || []).map((component) => [component.name, component.score]));
  return Object.fromEntries(MARK_COMPONENTS.map(({ key, label }) => [key, byName.get(label) ?? null]));
}

function componentScore(result, label) {
  const component = (result?.components || []).find((row) => row.name === label);
  return component?.score ?? null;
}

function completeResult(policy, result) {
  if (!result) return false;
  return MARK_COMPONENTS.every(({ key, label }) => {
    const weight = Number(policy.weights?.[key] || 0);
    if (weight === 0) return true;
    const score = componentScore(result, label);
    if (score === null || score === undefined || score === '') return false;
    const value = Number(score);
    return Number.isFinite(value) && value >= 0 && value <= weight;
  });
}

async function gradingPolicy() {
  const policy = await GradingPolicy.findOne({ key: 'global' }).lean();
  if (!policy?.bands?.length) {
    throw new AppError(409, 'GRADING_POLICY_MISSING', 'The registrar has not configured a grading policy yet.');
  }
  return policy;
}

function gradedTotal(policy, grading, result) {
  if (!completeResult(policy, result)) return null;
  const raw = MARK_COMPONENTS.reduce((sum, { key, label }) => {
    const weight = Number(policy.weights?.[key] || 0);
    return weight > 0 ? sum + Number(componentScore(result, label) || 0) : sum;
  }, 0);
  const total = ROUND(raw, grading.rounding ?? 2);
  const band = findBand(grading, total);
  return {
    total,
    letter: band?.letter ?? null,
    point: band?.points ?? null,
    passed: Boolean(band?.pass),
    version: grading.version,
  };
}

async function requirePolicy(assignmentId) {
  const policy = await CourseMarkPolicy.findOne({ offering: assignmentId }).lean();
  if (!policy) {
    throw new AppError(409, 'MARK_POLICY_REQUIRED', 'Set the course mark policy before entering marks.');
  }
  return policy;
}

async function ensureEditable(assignmentId) {
  const locked = await Result.findOne(
    ownFilter({
      offering: assignmentId,
      status: { $in: ['submitted', 'under_review', 'approved', 'published'] },
    }),
  )
    .select('_id')
    .lean();
  if (locked) {
    throw new AppError(409, 'MARKS_SUBMITTED', 'These course marks have already been sent to the registrar.');
  }
}

export async function listCourseMarkSummary(teacherId, query) {
  const visibleIds = await readAssignmentIdsForTeacher(teacherId, { includeCompleted: true });
  const assignments = await CourseOffering.find(ownFilter({ _id: { $in: visibleIds } }))
    .populate(ASSIGNMENT_POPULATE)
    .sort({ createdAt: -1 })
    .lean();
  const ids = assignments.map((row) => row._id);
  const [policies, counts, calculated, submitted] = await Promise.all([
    CourseMarkPolicy.find(ownFilter({ offering: { $in: ids } })).lean(),
    CourseRegistration.aggregate([
      { $match: { offering: { $in: ids }, status: 'registered' } },
      { $group: { _id: '$offering', count: { $sum: 1 } } },
    ]),
    Result.aggregate([
      { $match: { offering: { $in: ids }, totalMark: { $ne: null } } },
      {
        $lookup: {
          from: CourseRegistration.collection.name,
          let: { offeringId: '$offering', studentId: '$student' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$offering', '$$offeringId'] },
                    { $eq: ['$student', '$$studentId'] },
                    { $eq: ['$status', 'registered'] },
                  ],
                },
              },
            },
          ],
          as: 'registration',
        },
      },
      { $match: { registration: { $ne: [] } } },
      { $group: { _id: '$offering', count: { $sum: 1 } } },
    ]),
    Result.aggregate([
      { $match: { offering: { $in: ids }, status: 'submitted' } },
      { $group: { _id: '$offering', count: { $sum: 1 } } },
    ]),
  ]);
  const policyMap = new Map(policies.map((row) => [String(row.offering), row]));
  const countMap = new Map(counts.map((row) => [String(row._id), row.count]));
  const calculatedMap = new Map(calculated.map((row) => [String(row._id), row.count]));
  const submittedMap = new Map(submitted.map((row) => [String(row._id), row.count]));

  return {
    courses: assignments
      .filter((row) => !query.program || String(row.program?._id ?? row.program) === query.program)
      .map((row) => {
        const policy = policyDto(policyMap.get(String(row._id)));
        const studentCount = countMap.get(String(row._id)) || 0;
        const calculatedStudents = calculatedMap.get(String(row._id)) || 0;
        const submittedStudents = submittedMap.get(String(row._id)) || 0;
        return {
          assignment: assignmentDto(row),
          policy,
          studentCount,
          calculatedStudents,
          submittedStudents,
          ready: Boolean(policy && studentCount > 0 && calculatedStudents === studentCount && submittedStudents === 0),
        };
      }),
    components: MARK_COMPONENTS,
  };
}

export async function getCourseMarkPolicy(teacherId, assignmentId) {
  const assignment = await assignmentForTeacher(teacherId, assignmentId);
  const policy = await CourseMarkPolicy.findOne({ offering: assignmentId }).lean();
  return { assignment: assignmentDto(assignment), policy: policyDto(policy), components: MARK_COMPONENTS };
}

export async function saveCourseMarkPolicy(teacherId, assignmentId, payload) {
  const assignment = await assignmentForTeacher(teacherId, assignmentId, { write: true });
  const weights = Object.fromEntries(MARK_COMPONENTS.map(({ key }) => [key, Number(payload[key] || 0)]));
  const total = MARK_COMPONENTS.reduce((sum, { key }) => sum + weights[key], 0);
  if (Math.abs(total - MARK_TOTAL) > 0.001) {
    throw new AppError(400, 'MARK_POLICY_TOTAL', 'The course mark policy must add up to exactly 100.');
  }
  await ensureEditable(assignmentId);
  const previous = await CourseMarkPolicy.findOne({ offering: assignmentId }).lean();
  const changed =
    !previous ||
    MARK_COMPONENTS.some(({ key }) => Number(previous.weights?.[key] || 0) !== weights[key]);
  const policy = await CourseMarkPolicy.findOneAndUpdate(
    ownFilter({ offering: assignmentId }),
    { $set: { teacher: teacherId, weights, updatedBy: teacherId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  if (changed) {
    // A changed weight makes every stored total stale. Keep the component marks so
    // the teacher only has to calculate again, but never leave an old grade visible.
    await Result.updateMany(
      { offering: assignmentId },
      {
        $set: {
          totalMark: null,
          letterGrade: null,
          gradePoint: null,
          passed: false,
          gradingPolicyVersion: null,
          status: 'draft',
        },
      },
    );
  }
  return { assignment: assignmentDto(assignment), policy: policyDto(policy), components: MARK_COMPONENTS };
}

export async function courseMarksDetail(teacherId, assignmentId) {
  const assignment = await assignmentForTeacher(teacherId, assignmentId);
  const [policy, grading, enrollments, results] = await Promise.all([
    requirePolicy(assignmentId),
    gradingPolicy(),
    activeEnrollments(assignmentId),
    Result.find({ offering: assignmentId }).lean(),
  ]);
  const byStudent = new Map(results.map((row) => [String(row.student), row]));
  const rows = enrollments
    .filter((row) => row.student)
    .map((row) => {
      const result = byStudent.get(String(row.student._id));
      const scores = resultScores(policy, result);
      return {
        ...enrollmentDto(row),
        scores,
        total: result?.totalMark ?? null,
        letter: result?.letterGrade ?? null,
        point: result?.gradePoint ?? null,
        passed: result?.passed ?? false,
        calculated: result?.totalMark !== null && result?.totalMark !== undefined,
        status: result?.status ?? 'draft',
      };
    });
  return {
    assignment: assignmentDto(assignment),
    policy: policyDto(policy),
    grading: {
      version: grading.version,
      bands: grading.bands,
      rounding: grading.rounding,
    },
    components: MARK_COMPONENTS,
    rows,
    summary: {
      total: rows.length,
      calculated: rows.filter((row) => row.calculated).length,
      missing: rows.filter((row) => !row.calculated).length,
      submitted: rows.filter((row) => row.status === 'submitted').length,
    },
  };
}

export async function saveCourseMarks(teacherId, assignmentId, payload) {
  const assignment = await assignmentForTeacher(teacherId, assignmentId, { write: true });
  const policy = await requirePolicy(assignmentId);
  await ensureEditable(assignmentId);
  const registrations = await CourseRegistration.find({ offering: assignmentId, status: 'registered' })
    .select('student')
    .lean();
  const allowed = new Set(registrations.map((row) => String(row.student)));
  const current = await Result.find({ offering: assignmentId }).select('student status').lean();
  const locked = new Set(
    current.filter((row) => ['submitted', 'under_review', 'approved', 'published'].includes(row.status)).map((row) => String(row.student)),
  );

  for (const row of payload.students) {
    if (!allowed.has(row.studentId)) {
      throw new AppError(404, 'STUDENT_NOT_ENROLLED', 'One of the selected students is not registered in this course.');
    }
    if (locked.has(row.studentId)) {
      throw new AppError(409, 'MARKS_SUBMITTED', 'Submitted marks cannot be changed.');
    }
    for (const { key, label } of MARK_COMPONENTS) {
      const max = Number(policy.weights?.[key] || 0);
      const score = row[key];
      if (score !== null && score !== undefined && score !== '' && (Number(score) < 0 || Number(score) > max)) {
        throw new AppError(400, 'MARK_OUT_OF_RANGE', `${label} must be between 0 and ${max}.`);
      }
    }
  }

  await Promise.all(
    payload.students.map((row) => {
      const components = componentScores(policy, row);
      return Result.updateOne(
        { student: row.studentId, offering: assignmentId },
        {
          $set: {
            course: assignment.course?._id ?? assignment.course,
            academicYear: assignment.academicYear?._id ?? assignment.academicYear,
            term: assignment.term,
            creditHours: assignment.creditHours,
            components,
            totalMark: null,
            letterGrade: null,
            gradePoint: null,
            passed: false,
            status: 'draft',
            enteredBy: teacherId,
          },
          $setOnInsert: { student: row.studentId, offering: assignmentId },
        },
        { upsert: true, runValidators: true },
      );
    }),
  );

  return courseMarksDetail(teacherId, assignmentId);
}

export async function calculateCourseMarks(teacherId, assignmentId) {
  await assignmentForTeacher(teacherId, assignmentId, { write: true });
  const [policy, grading, registrations] = await Promise.all([
    requirePolicy(assignmentId),
    gradingPolicy(),
    CourseRegistration.find({ offering: assignmentId, status: 'registered' }).select('student').lean(),
  ]);
  await ensureEditable(assignmentId);
  const studentIds = registrations.map((row) => row.student);
  const results = await Result.find(ownFilter({ offering: assignmentId, student: { $in: studentIds } })).lean();
  const operations = [];
  for (const result of results) {
    const graded = gradedTotal(policy, grading, result);
    operations.push({
      updateOne: {
        filter: { _id: result._id },
        update: {
          $set: graded
            ? {
                totalMark: graded.total,
                letterGrade: graded.letter,
                gradePoint: graded.point,
                passed: graded.passed,
                gradingPolicyVersion: graded.version,
                status: 'draft',
              }
            : { totalMark: null, letterGrade: null, gradePoint: null, passed: false, status: 'draft' },
        },
      },
    });
  }
  if (operations.length) await Result.bulkWrite(operations, { ordered: false });
  return courseMarksDetail(teacherId, assignmentId);
}

async function prepareSubmission(teacherId, assignmentId) {
  const assignment = await assignmentForTeacher(teacherId, assignmentId, { write: true });
  const policy = await requirePolicy(assignmentId);
  const grading = await gradingPolicy();
  const registrations = await CourseRegistration.find({ offering: assignmentId, status: 'registered' })
    .select('student')
    .lean();
  const studentIds = registrations.map((row) => row.student);
  const results = await Result.find(ownFilter({ offering: assignmentId, student: { $in: studentIds } })).lean();
  if (!registrations.length) throw new AppError(409, 'NO_STUDENTS', 'There are no registered students in this course.');
  if (results.length !== registrations.length) {
    throw new AppError(409, 'MARKS_INCOMPLETE', 'Enter marks for every registered student before submitting.');
  }
  const incomplete = results.filter((row) => !completeResult(policy, row) || row.totalMark === null);
  if (incomplete.length) {
    throw new AppError(409, 'MARKS_INCOMPLETE', 'Calculate every student’s total before submitting.');
  }
  return { assignment, results, grading };
}

export async function submitCourseMarks(teacherId, offeringIds) {
  const prepared = [];
  for (const offeringId of offeringIds) {
    prepared.push(await prepareSubmission(teacherId, offeringId));
  }
  const submittedAt = new Date();
  for (const { assignment, results, grading } of prepared) {
    await Result.updateMany(
      ownFilter({ _id: { $in: results.map((row) => row._id) } }),
      {
        $set: {
          status: 'submitted',
          submittedAt,
          enteredBy: teacherId,
          gradingPolicyVersion: grading.version,
        },
      },
    );
    const course = [assignment.course?.code, assignment.course?.title].filter(Boolean).join(' · ');
    await notifyRole('REGISTRAR', {
      type: 'course_marks_submitted',
      title: 'Course marks submitted',
      body: `${course || 'A course'} · ${results.length} student${results.length === 1 ? '' : 's'} ready for review.`,
      actorId: teacherId,
      actorName: '',
      meta: { offeringId: String(assignment._id), course: course, students: results.length },
    });
  }
  return {
    submittedAt,
    courses: prepared.map(({ assignment, results }) => ({
      offeringId: String(assignment._id),
      course: assignmentDto(assignment),
      students: results.length,
    })),
    totalStudents: prepared.reduce((sum, row) => sum + row.results.length, 0),
  };
}

export async function exportCourseMarks(teacherId, assignmentId, format) {
  const detail = await courseMarksDetail(teacherId, assignmentId);
  const columns = [
    { key: 'studentNumber', label: 'Student ID', width: 18 },
    { key: 'name', label: 'Student', width: 30 },
    { key: 'program', label: 'Programme', width: 24 },
    ...detail.policy.components.map((component) => ({
      key: component.key,
      label: `${component.label} (${component.max})`,
      width: 16,
      numeric: true,
    })),
    { key: 'total', label: 'Total', width: 12, numeric: true },
    { key: 'letter', label: 'Grade', width: 10 },
  ];
  const rows = detail.rows.map((row) => ({
    ...row.scores,
    studentNumber: row.studentNumber,
    name: row.name,
    program: row.program,
    total: row.total,
    letter: row.letter,
  }));
  const assignment = detail.assignment;
  return buildExport({
    format,
    filenamePrefix: `course-marks-${assignment.courseCode || 'course'}`,
    title: 'Course marks',
    subtitle: [assignment.courseCode, assignment.courseTitle, assignment.program, assignment.academicYear, assignment.term]
      .filter(Boolean)
      .join(' · '),
    summary: [
      ['Students', detail.rows.length],
      ['Calculated', detail.summary.calculated],
      ['Missing', detail.summary.missing],
    ],
    columns,
    rows,
  });
}
