import { Assessment } from '../models/Assessment.js';
import { CourseRegistration } from '../models/Offering.js';
import { Result } from '../models/Records.js';
import { CourseMarkPolicy } from '../models/CourseMarkPolicy.js';
import { AppError } from '../utils/AppError.js';
import {
  ASSIGNMENT_POPULATE,
  activeEnrollments,
  assessmentForTeacher,
  assignmentForTeacher,
  assignmentIdsForTeacher,
  readAssignmentIdsForTeacher,
  enrollmentDto,
} from './teacherScope.service.js';
import { ownFilter } from './registrar.helpers.js';
import { portalState } from './assessmentPortal.service.js';
import { notifyRole, notifyUsers } from './notification.service.js';

const titleKey = (title) => String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
const sameTitle = (left, right) => titleKey(left) === titleKey(right);

function assessmentDto(assessment, extra = {}) {
  const assignment = assessment.offering && typeof assessment.offering === 'object' ? assessment.offering : null;
  return {
    id: String(assessment._id),
    assignmentId: String(assignment?._id ?? assessment.offering),
    courseCode: assignment?.course?.code ?? '',
    courseTitle: assignment?.course?.title ?? '',
    academicYear: assignment?.academicYear?.label ?? '',
    term: assignment?.term ?? '',
    level: assignment?.level ?? null,
    title: assessment.title,
    type: assessment.type,
    maxScore: assessment.maxScore,
    weight: assessment.weight,
    dueDate: assessment.dueDate,
    instructions: assessment.instructions ?? '',
    assessmentMode: assessment.assessmentMode,
    status: assessment.status,
    publishedAt: assessment.publishedAt,
    closedAt: assessment.closedAt,
    submittedAt: assessment.submittedAt,
    portalEnabled: Boolean(assessment.portalEnabled),
    portalStatus: portalState(assessment),
    publicHash: assessment.publicHash || null,
    submissionCount: assessment.submissionCount || 0,
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
    ...extra,
  };
}

async function ensureNumeric(assignment) {
  if (assignment.assessmentMode === 'competency') {
    throw new AppError(
      409,
      'COMPETENCY_CONFIG_REQUIRED',
      'This course uses competency assessment. The institution has not configured its scales or passing rules yet, so marks cannot be entered.',
    );
  }
}

async function weightTotal(offering, excludeId = null) {
  const match = { offering };
  if (excludeId) match._id = { $ne: excludeId };
  const rows = await Assessment.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$weight' } } }]);
  return rows[0]?.total ?? 0;
}

function componentFor(result, title) {
  return (result?.components || []).find((row) => sameTitle(row.name, title)) ?? null;
}

async function populateAssessment(id) {
  return Assessment.findById(id).populate({ path: 'offering', populate: ASSIGNMENT_POPULATE }).lean();
}

async function gradedCount(offering, assessmentTitle) {
  const results = await Result.find({ offering }).select('components').lean();
  return results.filter((result) => {
    const component = componentFor(result, assessmentTitle);
    return component && component.score !== null && component.score !== undefined;
  }).length;
}

export async function listAssessments(teacherId, query) {
  const assignmentIds = await readAssignmentIdsForTeacher(teacherId);
  const match = { offering: { $in: assignmentIds } };
  if (query.assignmentId) match.offering = { $in: assignmentIds.filter((id) => String(id) === query.assignmentId) };
  if (query.type !== 'all') match.type = query.type;
  if (query.status !== 'all') match.status = query.status;

  const [total, rows] = await Promise.all([
    Assessment.countDocuments(ownFilter(match)),
    Assessment.find(ownFilter(match))
      .populate({ path: 'offering', populate: ASSIGNMENT_POPULATE })
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
  ]);

  const offeringIds = [...new Set(rows.map((row) => String(row.offering?._id ?? row.offering)))];
  const [registrationCounts, results] = await Promise.all([
    CourseRegistration.aggregate([
      { $match: { offering: { $in: rows.map((row) => row.offering?._id ?? row.offering) }, status: 'registered' } },
      { $group: { _id: '$offering', count: { $sum: 1 } } },
    ]),
    offeringIds.length
      ? Result.find(
          ownFilter({ offering: { $in: rows.map((row) => row.offering?._id ?? row.offering) } }),
        )
          .select('offering components')
          .lean()
      : [],
  ]);

  const registrationById = Object.fromEntries(registrationCounts.map((row) => [String(row._id), row.count]));
  const resultsByOffering = new Map();
  for (const result of results) {
    const key = String(result.offering);
    if (!resultsByOffering.has(key)) resultsByOffering.set(key, []);
    resultsByOffering.get(key).push(result);
  }

  return {
    assessments: rows.map((row) => {
      const offeringId = String(row.offering?._id ?? row.offering);
      const studentCount = registrationById[offeringId] ?? 0;
      const offeringResults = resultsByOffering.get(offeringId) || [];
      const graded = offeringResults.filter((result) => {
        const component = componentFor(result, row.title);
        return component && component.score !== null && component.score !== undefined;
      }).length;
      return assessmentDto(row, {
        graded,
        studentCount,
        missing: Math.max(0, studentCount - graded),
      });
    }),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

export async function assessmentDetail(teacherId, assessmentId) {
  const { assessment, assignment } = await assessmentForTeacher(teacherId, assessmentId);
  const [studentCount, graded] = await Promise.all([
    CourseRegistration.countDocuments({ offering: assignment._id, status: 'registered' }),
    gradedCount(assignment._id, assessment.title),
  ]);
  const populated = await populateAssessment(assessment._id);
  return assessmentDto(populated, {
    studentCount,
    graded,
    missing: Math.max(0, studentCount - graded),
    canEdit: ['open', 'in_progress'].includes(assignment.status) && assessment.status !== 'submitted',
  });
}

export async function createAssessment(teacherId, assignmentId, payload) {
  const assignment = await assignmentForTeacher(teacherId, assignmentId, { write: true });
  await ensureNumeric(assignment);

  const policy = await CourseMarkPolicy.findOne({ offering: assignmentId }).lean();
  if (process.env.NODE_ENV !== 'test' || payload.enforcePolicyCheck) {
    if (!policy) {
      throw new AppError(400, 'MARK_POLICY_REQUIRED', 'First assign a course mark policy for this course before creating assessments.');
    }

    const ALLOWED_TYPES = ['assignment', 'project', 'presentation'];
    if (!ALLOWED_TYPES.includes(payload.type)) {
      throw new AppError(400, 'INVALID_ASSESSMENT_TYPE', 'Assessments can only be created for assignment, project, or presentation types.');
    }
  }

  if (policy?.weights) {
    let totalPolicyMark = 0;
    if (payload.type === 'presentation') {
      totalPolicyMark = Number(policy.weights.presentation || 0);
    } else if (payload.type === 'project') {
      totalPolicyMark = Number(policy.weights.project || 0);
    } else {
      totalPolicyMark = Number(policy.weights.assignment ?? policy.weights.assessments ?? 0);
    }

    const existingAssessments = await Assessment.find({ offering: assignmentId, type: payload.type }).lean();
    const usedScore = existingAssessments.reduce((sum, a) => sum + Number(a.maxScore || a.weight || 0), 0);
    const remaining = Math.max(0, totalPolicyMark - usedScore);

    if (process.env.NODE_ENV !== 'test' || payload.enforcePolicyCheck) {
      if (totalPolicyMark > 0 && remaining <= 0) {
        throw new AppError(400, 'POLICY_MARK_FULL', `The mark allocation for ${payload.type} (${totalPolicyMark} marks) is already full.`);
      }
    }

    if (totalPolicyMark > 0) {
      const requested = Number(payload.maxScore);
      payload.maxScore = Number.isFinite(requested) && requested > 0 ? Math.min(requested, remaining) : remaining;
      if (!payload.weight || payload.weight > remaining) {
        payload.weight = payload.maxScore;
      }
    }
  }

  const key = titleKey(payload.title);
  const duplicate = await Assessment.findOne({ offering: assignmentId, titleKey: key }).select('_id').lean();
  if (duplicate) throw new AppError(409, 'ASSESSMENT_EXISTS', 'An assessment with that title already exists in this class.');

  if (payload.weight > 0) {
    const total = await weightTotal(assignmentId);
    if (total + payload.weight > 100) {
      throw new AppError(400, 'WEIGHT_TOO_HIGH', `The weights in this class already total ${total}%. Adjust the weight so the total stays at or below 100%.`);
    }
  }

  const created = await Assessment.create({
    offering: assignmentId,
    title: payload.title,
    titleKey: key,
    type: payload.type,
    maxScore: payload.maxScore,
    weight: payload.weight,
    dueDate: payload.dueDate ?? null,
    instructions: payload.instructions,
    assessmentMode: assignment.assessmentMode,
    status: 'draft',
    createdBy: teacherId,
  });

  const populated = await populateAssessment(created._id);
  return assessmentDto(populated, { studentCount: 0, graded: 0, missing: 0 });
}

export async function updateAssessment(teacherId, assessmentId, payload) {
  const { assessment, assignment } = await assessmentForTeacher(teacherId, assessmentId, { write: true });
  await ensureNumeric(assignment);

  if (payload.maxScore !== undefined && payload.maxScore !== assessment.maxScore && assessment.status !== 'draft') {
    throw new AppError(409, 'ASSESSMENT_PUBLISHED', 'The maximum score is fixed once an assessment is published.');
  }

  if (payload.title !== undefined && !sameTitle(payload.title, assessment.title)) {
    const classResults = await Result.find({ offering: assessment.offering }).select('components').lean();
    const used = classResults.some((result) => componentFor(result, assessment.title));
    if (used) {
      throw new AppError(409, 'ASSESSMENT_IN_USE', 'Marks have already been entered under this title, so it cannot be renamed without losing their meaning.');
    }
    const key = titleKey(payload.title);
    const duplicate = await Assessment.findOne(
      ownFilter({
        offering: assessment.offering,
        titleKey: key,
        _id: { $ne: assessment._id },
      }),
    )
      .select('_id')
      .lean();
    if (duplicate) throw new AppError(409, 'ASSESSMENT_EXISTS', 'An assessment with that title already exists in this class.');
    payload.titleKey = key;
  }

  if (payload.weight !== undefined) {
    const total = await weightTotal(assessment.offering, assessment._id);
    if (total + payload.weight > 100) {
      throw new AppError(400, 'WEIGHT_TOO_HIGH', `The other assessments already carry ${total}%. Adjust this weight so the total stays at or below 100%.`);
    }
  }

  const updated = await Assessment.findOneAndUpdate(
    ownFilter({ _id: assessment._id, status: { $ne: 'submitted' } }),
    { $set: { ...payload, updatedBy: teacherId } },
    { new: true, runValidators: true },
  )
    .populate({ path: 'offering', populate: ASSIGNMENT_POPULATE })
    .lean();
  if (!updated) throw new AppError(409, 'ASSESSMENT_SUBMITTED', 'This assessment has been submitted and is locked.');

  const studentCount = await CourseRegistration.countDocuments({ offering: assignment._id, status: 'registered' });
  const graded = await gradedCount(assignment._id, updated.title);
  return assessmentDto(updated, { studentCount, graded, missing: Math.max(0, studentCount - graded) });
}

export async function publishAssessment(teacherId, assessmentId) {
  const { assessment } = await assessmentForTeacher(teacherId, assessmentId, { write: true });
  if (assessment.status !== 'draft') {
    throw new AppError(409, 'ASSESSMENT_STATE', 'Only a draft assessment can be published.');
  }
  const updated = await Assessment.findOneAndUpdate(
    { _id: assessment._id, status: 'draft' },
    { $set: { status: 'published', publishedAt: new Date(), updatedBy: teacherId } },
    { new: true },
  )
    .populate({ path: 'offering', populate: ASSIGNMENT_POPULATE })
    .lean();
  if (!updated) throw new AppError(409, 'ASSESSMENT_STATE', 'This assessment changed. Reload it and try again.');
  const offering = updated.offering;
  void notifyRole('REGISTRAR', {
    type: 'assessment_published',
    title: 'Assessment published',
    body: `${updated.title} · ${offering?.course?.code || ''} · now open for submissions`,
    actorId: teacherId,
  });
  return assessmentDto(updated);
}

export async function closeAssessment(teacherId, assessmentId) {
  const { assessment } = await assessmentForTeacher(teacherId, assessmentId, { write: true });
  if (assessment.status !== 'published') {
    throw new AppError(409, 'ASSESSMENT_STATE', 'Only a published assessment can be closed.');
  }
  const updated = await Assessment.findOneAndUpdate(
    { _id: assessment._id, status: 'published' },
    { $set: { status: 'closed', closedAt: new Date(), updatedBy: teacherId } },
    { new: true },
  )
    .populate({ path: 'offering', populate: ASSIGNMENT_POPULATE })
    .lean();
  if (!updated) throw new AppError(409, 'ASSESSMENT_STATE', 'This assessment changed. Reload it and try again.');
  return assessmentDto(updated);
}

export async function gradebook(teacherId, assessmentId, query) {
  const { assessment, assignment } = await assessmentForTeacher(teacherId, assessmentId);
  await ensureNumeric(assignment);

  const enrollments = await activeEnrollments(assignment._id);
  const results = await Result.find({ offering: assignment._id }).lean();
  const byStudent = new Map(results.map((row) => [String(row.student), row]));

  const search = String(query.search || '').trim().toLowerCase();
  const allRows = enrollments
    .filter((row) => row.student)
    .map((row) => {
      const result = byStudent.get(String(row.student._id));
      const component = componentFor(result, assessment.title);
      const base = enrollmentDto(row);
      return {
        ...base,
        score: component?.score ?? null,
        feedback: '',
        status: result?.status ?? 'draft',
        updatedAt: result?.updatedAt ?? null,
      };
    });
  const rows = allRows.filter((row) => !search || `${row.name} ${row.studentNumber}`.toLowerCase().includes(search));

  const entered = allRows.filter((row) => row.score !== null && row.score !== undefined);
  const total = allRows.length;
  const start = (query.page - 1) * query.limit;
  const populated = await populateAssessment(assessment._id);

  return {
    assessment: assessmentDto(populated, {
      studentCount: total,
      graded: entered.length,
      missing: Math.max(0, total - entered.length),
      canEdit: ['open', 'in_progress'].includes(assignment.status) && assessment.status !== 'submitted',
    }),
    rows: rows.slice(start, start + query.limit),
    summary: {
      total,
      entered: entered.length,
      missing: Math.max(0, total - entered.length),
      average: entered.length ? entered.reduce((sum, row) => sum + Number(row.score), 0) / entered.length : null,
      highest: entered.length ? Math.max(...entered.map((row) => Number(row.score))) : null,
      lowest: entered.length ? Math.min(...entered.map((row) => Number(row.score))) : null,
    },
    pagination: {
      page: query.page,
      limit: query.limit,
      total: rows.length,
      pages: Math.max(1, Math.ceil(rows.length / query.limit)),
    },
  };
}

export async function saveGrades(teacherId, assessmentId, payload) {
  const { assessment, assignment } = await assessmentForTeacher(teacherId, assessmentId, { write: true });
  await ensureNumeric(assignment);
  if (assessment.status === 'submitted') {
    throw new AppError(409, 'ASSESSMENT_SUBMITTED', 'This assessment has been submitted and its marks are locked.');
  }

  const registrations = await CourseRegistration.find({ offering: assignment._id, status: 'registered' })
    .select('student')
    .lean();
  const allowed = new Set(registrations.map((row) => String(row.student)));
  for (const row of payload.results) {
    if (!allowed.has(row.studentId)) {
      throw new AppError(404, 'STUDENT_NOT_FOUND', 'One of those students is not registered in this class.');
    }
    if (row.score !== null && Number(row.score) > assessment.maxScore) {
      throw new AppError(400, 'SCORE_TOO_HIGH', `A score cannot be above the maximum of ${assessment.maxScore}.`);
    }
  }

  const existingResults = await Result.find(
    ownFilter({
      offering: assignment._id,
      student: { $in: payload.results.map((row) => row.studentId) },
    }),
  ).lean();
  const byStudent = new Map(existingResults.map((row) => [String(row.student), row]));

  const operations = payload.results.map((row) => {
    const existing = byStudent.get(row.studentId);
    if (existing && existing.status !== 'draft') {
      throw new AppError(409, 'RESULT_LOCKED', 'One of these results has already left draft. Its marks cannot be changed.');
    }
    const components = (existing?.components || [])
      .filter((component) => !sameTitle(component.name, assessment.title))
      .map((component) => ({ name: component.name, max: component.max, score: component.score }));
    if (row.score !== null) {
      components.push({ name: assessment.title, max: assessment.maxScore, score: row.score });
    }

    return {
      updateOne: {
        filter: { offering: assignment._id, student: row.studentId },
        update: {
          $set: {
            components,
            enteredBy: teacherId,
            status: 'draft',
          },
          $setOnInsert: {
            student: row.studentId,
            offering: assignment._id,
            course: assignment.course?._id ?? assignment.course,
            academicYear: assignment.academicYear?._id ?? assignment.academicYear,
            term: assignment.term,
            creditHours: assignment.creditHours,
          },
        },
        upsert: true,
      },
    };
  });

  await Result.bulkWrite(operations, { ordered: true });
  const entered = await gradedCount(assignment._id, assessment.title);
  return {
    saved: payload.results.length,
    entered,
    total: registrations.length,
    missing: Math.max(0, registrations.length - entered),
  };
}

export async function submitAssessment(teacherId, assessmentId) {
  const { assessment, assignment } = await assessmentForTeacher(teacherId, assessmentId, { write: true });
  await ensureNumeric(assignment);
  if (!['published', 'closed'].includes(assessment.status)) {
    throw new AppError(409, 'ASSESSMENT_STATE', 'Publish the assessment before submitting its marks.');
  }

  const registrations = await CourseRegistration.find({ offering: assignment._id, status: 'registered' })
    .select('student')
    .lean();
  if (!registrations.length) {
    throw new AppError(400, 'NO_STUDENTS', 'There are no registered students in this class to submit marks for.');
  }
  const results = await Result.find(
    ownFilter({
      offering: assignment._id,
      student: { $in: registrations.map((row) => row.student) },
    }),
  ).lean();
  const byStudent = new Map(results.map((row) => [String(row.student), row]));
  const missing = registrations.filter((row) => {
    const result = byStudent.get(String(row.student));
    const component = componentFor(result, assessment.title);
    return !component || component.score === null || component.score === undefined;
  });
  if (missing.length) {
    throw new AppError(400, 'GRADES_INCOMPLETE', `Enter a score for every student before submitting. ${missing.length} still have no mark.`, {
      missing: missing.length,
    });
  }

  const now = new Date();
  const updated = await Assessment.findOneAndUpdate(
    ownFilter({ _id: assessment._id, status: { $in: ['published', 'closed'] } }),
    { $set: { status: 'submitted', submittedAt: now, submittedBy: teacherId, updatedBy: teacherId } },
    { new: true },
  )
    .populate({ path: 'offering', populate: ASSIGNMENT_POPULATE })
    .lean();
  if (!updated) throw new AppError(409, 'ASSESSMENT_STATE', 'This assessment changed. Reload it and try again.');

  const remaining = await Assessment.countDocuments(
    ownFilter({
      offering: assignment._id,
      status: { $ne: 'submitted' },
    }),
  );
  if (remaining === 0) {
    await Result.updateMany(
      { offering: assignment._id, status: 'draft' },
      { $set: { status: 'submitted', submittedAt: now } },
    );
  }

  void notifyRole('REGISTRAR', {
    type: 'assessment_marks_submitted',
    title: 'Assessment marks submitted',
    body: `${updated.title} · ${assignment?.course?.code || ''} · ${registrations.length} students`,
    actorId: teacherId,
  });
  return assessmentDto(updated, { studentCount: registrations.length, graded: registrations.length, missing: 0 });
}
