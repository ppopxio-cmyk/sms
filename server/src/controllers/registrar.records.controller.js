import mongoose from 'mongoose';
import { AttendanceRecord, Result, GradingPolicy } from '../models/Records.js';
import { Student, Enrollment } from '../models/Student.js';
import { CourseOffering } from '../models/Offering.js';
import { AcademicYear } from '../models/AcademicStructure.js';
import { GraduationEvaluation } from '../models/GraduationEvaluation.js';
import { Certificate } from '../models/Documents.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { pageOf, sortOf, searchFilter, mergeFilters, paged, ownFilter } from '../services/registrar.helpers.js';
import { requireGradingPolicy, gradeFor, calculateGpa, getGradingPolicy, cgpaForStudent } from '../services/grading.service.js';
import { evaluateStudent } from '../services/eligibility.service.js';

export const listAttendance = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  let offeringIds = null;
  if (query.academicYear || query.term) {
    const offeringFilter = mergeFilters(query.academicYear ? { academicYear: query.academicYear } : null, query.term ? { term: query.term } : null);
    offeringIds = (await CourseOffering.find(offeringFilter).select('_id').limit(5000).lean()).map((row) => row._id);
  }
  let studentIds = null;
  if (query.search) {
    studentIds = (await Student.find(searchFilter(query.search, ['studentId', 'fullName'])).select('_id').limit(2000).lean())
      .map((row) => row._id);
  }
  const filter = mergeFilters(
    offeringIds ? { offering: { $in: offeringIds } } : null,
    query.offering ? { offering: query.offering } : null,
    query.student ? { student: query.student } : null,
    studentIds ? { student: { $in: studentIds } } : null,
    query.status && query.status !== 'all' ? { status: query.status } : null,
    query.from || query.to
      ? {
          date: {
            ...(query.from ? { $gte: query.from } : {}),
            ...(query.to ? { $lte: query.to } : {}),
          },
        }
      : null,
  );
  const [rows, total] = await Promise.all([
    AttendanceRecord.find(filter)
      .populate('student', 'studentId fullName level')
      .populate({ path: 'offering', populate: [{ path: 'course', select: 'code title' }, { path: 'academicYear', select: 'label' }] })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AttendanceRecord.countDocuments(filter),
  ]);
  res.json({
    ...paged(
      rows.map((row) => ({
        ...row,
        id: String(row._id),
        student: row.student ? { id: String(row.student._id), studentId: row.student.studentId, fullName: row.student.fullName, level: row.student.level } : null,
        course: row.offering?.course ? { code: row.offering.course.code, title: row.offering.course.title } : null,
        academicYear: row.offering?.academicYear?.label ?? '',
        _id: undefined,
      })),
      total,
      page,
      limit,
    ),
  });
});

export const attendanceSummary = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  let summaryOfferingIds = null;
  if (query.academicYear || query.term) {
    summaryOfferingIds = (await CourseOffering.find(mergeFilters(query.academicYear ? { academicYear: query.academicYear } : null, query.term ? { term: query.term } : null)).select('_id').limit(5000).lean()).map((row) => row._id);
  }
  const match = mergeFilters(
    summaryOfferingIds ? { offering: { $in: summaryOfferingIds } } : null,
    query.student ? { student: query.student } : null,
    query.offering ? { offering: query.offering } : null,
  );
  const rows = await AttendanceRecord.aggregate([
    { $lookup: { from: 'courseofferings', localField: 'offering', foreignField: '_id', as: 'offering' } },
    { $unwind: '$offering' },
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const row of rows) counts[row._id] = row.count;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  res.json({ counts, total, attendanceRate: total ? Math.round(((counts.present + counts.late) / total) * 100) : null });
});

export const listResults = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  const studentIds = query.search
    ? (await Student.find(searchFilter(query.search, ['studentId', 'fullName'])).select('_id').limit(2000).lean()).map((row) => row._id)
    : null;
  const filter = mergeFilters(
    query.academicYear ? { academicYear: query.academicYear } : null,
    query.term ? { term: query.term } : null,
    query.status && query.status !== 'all' ? { status: query.status } : null,
    query.offering ? { offering: query.offering } : null,
    query.student ? { student: query.student } : null,
    studentIds ? { student: { $in: studentIds } } : null,
  );
  const [rows, total, statusCounts] = await Promise.all([
    Result.find(filter)
      .populate('student', 'studentId fullName level')
      .populate('course', 'code title')
      .populate({ path: 'offering', select: 'term level academicYear', populate: { path: 'academicYear', select: 'label' } })
      .sort(sortOf(query, ['createdAt', 'totalMark', 'status'], 'createdAt'))
      .skip(skip)
      .limit(limit)
      .lean(),
    Result.countDocuments(filter),
    Result.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const counts = { all: 0 };
  for (const row of statusCounts) {
    counts[row._id] = row.count;
    counts.all += row.count;
  }
  const missing = await missingResults(query);
  res.json({
    ...paged(
      rows.map((row) => ({
        ...row,
        id: String(row._id),
        student: row.student ? { id: String(row.student._id), studentId: row.student.studentId, fullName: row.student.fullName, level: row.student.level } : null,
        course: row.course ? { id: String(row.course._id), code: row.course.code, title: row.course.title } : null,
        academicYear: row.offering?.academicYear?.label ?? '',
        _id: undefined,
      })),
      total,
      page,
      limit,
    ),
    counts,
    missing,
  });
});

async function missingResults(query) {
  const offeringFilter = query.academicYear ? { academicYear: query.academicYear } : {};
  if (query.term) offeringFilter.term = query.term;
  const offerings = await CourseOffering.find(offeringFilter)
    .populate('course', 'code title')
    .populate('academicYear', 'label')
    .limit(100)
    .lean();
  if (!offerings.length) return [];
  const rows = await Result.aggregate([
    { $match: { offering: { $in: offerings.map((row) => row._id) }, status: 'published' } },
    { $group: { _id: '$offering', count: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map((row) => [String(row._id), row.count]));
  return offerings
    .map((offering) => ({
      id: String(offering._id),
      course: { code: offering.course?.code, title: offering.course?.title },
      term: offering.term,
      level: offering.level,
      registered: offering.registeredCount,
      published: counts.get(String(offering._id)) || 0,
      missing: Math.max(0, offering.registeredCount - (counts.get(String(offering._id)) || 0)),
      academicYear: offering.academicYear?.label ?? '',
    }))
    .filter((row) => row.missing > 0);
}

const REVIEWABLE_RESULT_STATUSES = ['submitted', 'under_review', 'approved'];

function resultsForOffering(offeringId, statuses) {
  return Result.find(ownFilter({ offering: offeringId, status: { $in: statuses } }));
}

async function offeringSummary(offeringId) {
  const offering = await CourseOffering.findById(offeringId).populate('course', 'code title').lean();
  return offering
    ? { id: String(offering._id), course: offering.course ? { id: String(offering.course._id), code: offering.course.code, title: offering.course.title } : null }
    : { id: String(offeringId), course: null };
}

export const listResultSubmissions = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const offeringFilter = mergeFilters(
    query.academicYear ? { academicYear: query.academicYear } : null,
    query.term ? { term: query.term } : null,
  );
  const offeringIds = (await CourseOffering.find(offeringFilter).select('_id').limit(5000).lean()).map((row) => row._id);
  if (!offeringIds.length) return res.json({ rows: [] });
  const groups = await Result.aggregate([
    { $match: { offering: { $in: offeringIds }, status: { $in: REVIEWABLE_RESULT_STATUSES } } },
    {
      $group: {
        _id: '$offering',
        total: { $sum: 1 },
        submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
        underReview: { $sum: { $cond: [{ $eq: ['$status', 'under_review'] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        latestSubmittedAt: { $max: '$submittedAt' },
        latestUpdatedAt: { $max: '$updatedAt' },
      },
    },
    { $sort: { latestSubmittedAt: -1, latestUpdatedAt: -1 } },
    { $limit: 200 },
  ]);
  const offerings = await CourseOffering.find(ownFilter({ _id: { $in: groups.map((row) => row._id) } }))
    .populate('course', 'code title')
    .populate('teacher', 'name email')
    .populate('academicYear', 'label')
    .lean();
  const byId = new Map(offerings.map((row) => [String(row._id), row]));
  res.json({
    rows: groups.map((group) => {
      const offering = byId.get(String(group._id));
      const pending = group.submitted + group.underReview;
      return {
        id: String(group._id),
        course: offering?.course ? { id: String(offering.course._id), code: offering.course.code, title: offering.course.title } : null,
        teacher: offering?.teacher ? { id: String(offering.teacher._id), name: offering.teacher.name, email: offering.teacher.email } : null,
        term: offering?.term ?? '',
        level: offering?.level ?? null,
        academicYear: offering?.academicYear?.label ?? '',
        counts: {
          total: group.total,
          submitted: group.submitted,
          underReview: group.underReview,
          approved: group.approved,
          pending,
        },
        status: pending ? (group.underReview ? 'under_review' : 'submitted') : 'approved',
        latestSubmittedAt: group.latestSubmittedAt,
        latestUpdatedAt: group.latestUpdatedAt,
      };
    }),
  });
});

export const approveResultSubmission = asyncHandler(async (req, res) => {
  const offeringId = req.valid.params.offering;
  const results = await resultsForOffering(offeringId, ['submitted', 'under_review']);
  if (!results.length) throw new AppError(409, 'RESULT_STATE', 'There are no submitted results for this offering.');
  const missingMarks = results.filter((row) => row.totalMark === null || row.totalMark === undefined).length;
  if (missingMarks) {
    throw new AppError(400, 'MARK_MISSING', `Enter a total mark for every student before approving. ${missingMarks} result(s) have no mark.`);
  }
  const policy = await requireGradingPolicy();
  const now = new Date();
  const operations = results.map((result) => {
    const band = gradeFor(policy, result.totalMark);
    return {
      updateOne: {
        filter: ownFilter({ _id: result._id, status: { $in: ['submitted', 'under_review'] } }),
        update: {
          $set: {
            letterGrade: band.letter,
            gradePoint: band.points,
            passed: band.pass,
            gradingPolicyVersion: policy.version,
            status: 'approved',
            reviewedBy: req.user.id,
            reviewedAt: now,
          },
        },
      },
    };
  });
  const outcome = await Result.bulkWrite(operations, { ordered: true });
  const offering = await offeringSummary(offeringId);
  audit({ req, action: 'registrar.result.approve.batch', targetType: 'CourseOffering', targetId: offeringId, meta: { course: offering.course?.code, count: outcome.modifiedCount } });
  res.json({ updated: outcome.modifiedCount, offering });
});

export const declineResultSubmission = asyncHandler(async (req, res) => {
  const offeringId = req.valid.params.offering;
  const results = await resultsForOffering(offeringId, REVIEWABLE_RESULT_STATUSES);
  if (!results.length) throw new AppError(409, 'RESULT_STATE', 'There are no results awaiting review for this offering.');
  const now = new Date();
  const operations = results.map((result) => ({
    updateOne: {
      filter: ownFilter({ _id: result._id, status: { $in: REVIEWABLE_RESULT_STATUSES } }),
      update: {
        $set: { status: 'rejected', reviewedBy: req.user.id, reviewedAt: now },
        $push: {
          revisionHistory: {
            at: now,
            by: req.user.id,
            reason: req.body.reason,
            from: { status: result.status },
            to: { status: 'rejected' },
          },
        },
      },
    },
  }));
  const outcome = await Result.bulkWrite(operations, { ordered: true });
  const offering = await offeringSummary(offeringId);
  audit({ req, action: 'registrar.result.decline.batch', targetType: 'CourseOffering', targetId: offeringId, meta: { course: offering.course?.code, count: outcome.modifiedCount } });
  res.json({ updated: outcome.modifiedCount, offering });
});

export const publishResultSubmission = asyncHandler(async (req, res) => {
  const offeringId = req.valid.params.offering;
  const results = await resultsForOffering(offeringId, ['approved']);
  if (!results.length) throw new AppError(409, 'RESULT_STATE', 'There are no approved results for this offering.');
  const missingMarks = results.filter((row) => row.totalMark === null || row.totalMark === undefined).length;
  if (missingMarks) {
    throw new AppError(400, 'MARK_MISSING', `Enter a total mark for every student before publishing. ${missingMarks} result(s) have no mark.`);
  }
  const policy = await requireGradingPolicy();
  const now = new Date();
  const operations = results.map((result) => {
    const band = gradeFor(policy, result.totalMark);
    return {
      updateOne: {
        filter: { _id: result._id, status: 'approved' },
        update: {
          $set: {
            letterGrade: band.letter,
            gradePoint: band.points,
            passed: band.pass,
            gradingPolicyVersion: policy.version,
            status: 'published',
            publishedAt: now,
            publishedBy: req.user.id,
          },
        },
      },
    };
  });
  const outcome = await Result.bulkWrite(operations, { ordered: true });
  const offering = await offeringSummary(offeringId);
  audit({ req, action: 'registrar.result.publish.batch', targetType: 'CourseOffering', targetId: offeringId, meta: { course: offering.course?.code, count: outcome.modifiedCount } });
  res.json({ updated: outcome.modifiedCount, offering });
});

export const getResult = asyncHandler(async (req, res) => {
  const row = await Result.findById(req.valid.params.id)
    .populate('student', 'studentId fullName level program')
    .populate('course', 'code title creditHours')
    .populate({ path: 'offering', populate: [{ path: 'teacher', select: 'name email' }, { path: 'academicYear', select: 'label' }] })
    .lean();
  if (!row) throw new AppError(404, 'RESULT_NOT_FOUND', 'That result was not found.');
  res.json({ result: { ...row, id: String(row._id), _id: undefined } });
});

async function setResultGrade(result) {
  const policy = await requireGradingPolicy();
  if (result.totalMark === null || result.totalMark === undefined) {
    throw new AppError(400, 'MARK_MISSING', 'Enter a total mark before approving this result.');
  }
  const band = gradeFor(policy, result.totalMark);
  result.letterGrade = band.letter;
  result.gradePoint = band.points;
  result.passed = band.pass;
  result.gradingPolicyVersion = policy.version;
  return result;
}

export const reviewResult = asyncHandler(async (req, res) => {
  const result = await Result.findById(req.valid.params.id);
  if (!result) throw new AppError(404, 'RESULT_NOT_FOUND', 'That result was not found.');
  if (!['submitted', 'rejected'].includes(result.status)) {
    throw new AppError(409, 'RESULT_STATE', 'Only a submitted result can be taken under review.');
  }
  result.status = 'under_review';
  result.reviewedBy = req.user.id;
  result.reviewedAt = new Date();
  await result.save();
  audit({ req, action: 'registrar.result.review', targetType: 'Result', targetId: result._id });
  res.json({ result });
});

export const approveResult = asyncHandler(async (req, res) => {
  const result = await Result.findById(req.valid.params.id);
  if (!result) throw new AppError(404, 'RESULT_NOT_FOUND', 'That result was not found.');
  if (!['submitted', 'under_review'].includes(result.status)) {
    throw new AppError(409, 'RESULT_STATE', 'Only a submitted or under-review result can be approved.');
  }
  await setResultGrade(result);
  result.status = 'approved';
  result.reviewedBy = req.user.id;
  result.reviewedAt = new Date();
  await result.save();
  audit({ req, action: 'registrar.result.approve', targetType: 'Result', targetId: result._id, meta: { mark: result.totalMark, grade: result.letterGrade } });
  res.json({ result });
});

export const publishResult = asyncHandler(async (req, res) => {
  const result = await Result.findById(req.valid.params.id);
  if (!result) throw new AppError(404, 'RESULT_NOT_FOUND', 'That result was not found.');
  if (!['approved', 'submitted', 'under_review'].includes(result.status)) {
    throw new AppError(409, 'RESULT_STATE', 'This result cannot be published from its current state.');
  }
  await setResultGrade(result);
  result.status = 'published';
  result.publishedAt = new Date();
  result.publishedBy = req.user.id;
  await result.save();
  audit({ req, action: 'registrar.result.publish', targetType: 'Result', targetId: result._id, meta: { mark: result.totalMark, grade: result.letterGrade } });
  res.json({ result });
});

export const rejectResult = asyncHandler(async (req, res) => {
  const result = await Result.findById(req.valid.params.id);
  if (!result) throw new AppError(404, 'RESULT_NOT_FOUND', 'That result was not found.');
  if (!['submitted', 'under_review', 'approved'].includes(result.status)) {
    throw new AppError(
      409,
      'RESULT_STATE',
      result.status === 'published'
        ? 'A published result cannot be rejected. Use the correction workflow so the change is versioned.'
        : 'Only a submitted, under-review or approved result can be returned for correction.',
    );
  }
  const previousStatus = result.status;
  result.status = 'rejected';
  result.reviewedBy = req.user.id;
  result.reviewedAt = new Date();
  result.revisionHistory.push({ by: req.user.id, reason: req.body.reason || 'Returned for correction', from: { status: previousStatus }, to: { status: 'rejected' } });
  await result.save();
  audit({ req, action: 'registrar.result.reject', targetType: 'Result', targetId: result._id });
  res.json({ result });
});

export const correctResult = asyncHandler(async (req, res) => {
  const result = await Result.findById(req.valid.params.id);
  if (!result) throw new AppError(404, 'RESULT_NOT_FOUND', 'That result was not found.');
  if (!['approved', 'published'].includes(result.status)) {
    throw new AppError(409, 'RESULT_STATE', 'Only an approved or published result can be corrected through this workflow.');
  }
  const before = {
    components: result.components,
    totalMark: result.totalMark,
    letterGrade: result.letterGrade,
    gradePoint: result.gradePoint,
    passed: result.passed,
  };
  if (req.body.components) {
    const invalid = req.body.components.find((row) => Number(row.score) > Number(row.max));
    if (invalid) {
      throw new AppError(400, 'COMPONENT_SCORE_INVALID', 'A component score cannot be higher than its maximum.');
    }
    const componentTotal = req.body.components.reduce((sum, row) => sum + Number(row.score || 0), 0);
    if (componentTotal > 100) {
      throw new AppError(400, 'COMPONENT_TOTAL_INVALID', 'Component scores cannot add up to more than 100.');
    }
    result.components = req.body.components;
  }
  if (req.body.components && req.body.totalMark === undefined) {
    result.totalMark = req.body.components.reduce((sum, row) => sum + Number(row.score || 0), 0);
  } else if (req.body.totalMark !== undefined) {
    result.totalMark = req.body.totalMark;
  }
  result.status = 'under_review';
  result.revisionHistory.push({
    by: req.user.id,
    reason: req.body.reason,
    from: before,
    to: { components: result.components, totalMark: result.totalMark },
  });
  await result.save();
  audit({ req, action: 'registrar.result.correction', targetType: 'Result', targetId: result._id, meta: { reason: req.body.reason } });
  res.json({ result });
});

export const gpaCgpa = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const policy = await getGradingPolicy();
  if (!policy) {
    return res.json({
      configured: false,
      message: 'The grading policy has not been configured, so official GPA and CGPA cannot be calculated.',
      students: [],
    });
  }
  if (query.student) {
    const student = await Student.findById(query.student).populate('program', 'code name').lean();
    if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
    const result = await cgpaForStudent(query.student, policy);
    return res.json({
      configured: true,
      student: { id: String(student._id), studentId: student.studentId, fullName: student.fullName, program: student.program?.name },
      cgpa: result.gpa,
      credits: result.credits,
      qualityPoints: result.qualityPoints,
      courseCount: result.courses,
      courses: result.rows,
    });
  }

  const studentFilter = mergeFilters(
    query.program ? { program: query.program } : null,
    query.batch ? { batch: query.batch } : null,
  );
  const students = await Student.find(studentFilter)
    .populate('program', 'code name')
    .sort({ fullName: 1 })
    .limit(500)
    .lean();
  const rows = [];
  for (const student of students) {
    const result = await cgpaForStudent(student._id, policy);
    if (result.courses) {
      rows.push({
        id: String(student._id),
        studentId: student.studentId,
        fullName: student.fullName,
        program: student.program?.name,
        cgpa: result.gpa,
        credits: result.credits,
        qualityPoints: result.qualityPoints,
        courseCount: result.courses,
        courses: result.rows,
      });
    }
  }
  res.json({ configured: true, rows, policyVersion: policy.version });
});

export const listGraduation = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const { page, limit, skip } = pageOf(query);
  const searchStudentIds = query.search
    ? (await Student.find(searchFilter(query.search, ['studentId', 'fullName'])).select('_id').limit(2000).lean()).map((row) => row._id)
    : null;
  const pipeline = [
    ...(searchStudentIds ? [{ $match: { student: { $in: searchStudentIds } } }] : []),
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$student', evaluation: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$evaluation' } },
    ...(query.program ? [{ $match: { program: new mongoose.Types.ObjectId(query.program) } }] : []),
    ...(query.academicYear ? [{ $match: { academicYear: new mongoose.Types.ObjectId(query.academicYear) } }] : []),
    ...(query.status && query.status !== 'all' ? [{ $match: { status: query.status } }] : []),
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'studentDoc' },
    },
    { $unwind: '$studentDoc' },
    {
      $lookup: { from: 'programs', localField: 'studentDoc.program', foreignField: '_id', as: 'programDoc' },
    },
    { $unwind: { path: '$programDoc', preserveNullAndEmptyArrays: true } },
  ];
  const countPipeline = [
    ...(searchStudentIds ? [{ $match: { student: { $in: searchStudentIds } } }] : []),
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$student', evaluation: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$evaluation' } },
    ...(query.program ? [{ $match: { program: new mongoose.Types.ObjectId(query.program) } }] : []),
    ...(query.academicYear ? [{ $match: { academicYear: new mongoose.Types.ObjectId(query.academicYear) } }] : []),
    ...(query.status && query.status !== 'all' ? [{ $match: { status: query.status } }] : []),
    { $count: 'total' },
  ];
  const [rows, countRows] = await Promise.all([
    GraduationEvaluation.aggregate(pipeline),
    GraduationEvaluation.aggregate(countPipeline),
  ]);
  const total = countRows[0]?.total ?? 0;
  const statusRows = await GraduationEvaluation.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$student', status: { $first: '$status' } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const statusCounts = { all: 0 };
  for (const row of statusRows) { statusCounts[row._id] = row.count; statusCounts.all += row.count; }
  res.json({
    ...paged(
      rows.map((row) => ({
        ...row,
        id: String(row._id),
        student: row.studentDoc
          ? {
              id: String(row.studentDoc._id),
              studentId: row.studentDoc.studentId,
              fullName: row.studentDoc.fullName,
              level: row.studentDoc.level,
              photo: row.studentDoc.photo,
            }
          : null,
        program: row.programDoc ? { id: String(row.programDoc._id), code: row.programDoc.code, name: row.programDoc.name } : null,
        studentDoc: undefined,
        programDoc: undefined,
        _id: undefined,
      })),
      total,
      page,
      limit,
    ),
    counts: statusCounts,
  });
});

export const evaluateGraduation = asyncHandler(async (req, res) => {
  const evaluation = await evaluateStudent(req.valid.params.studentId, { evaluatedBy: req.user.id });
  if (!evaluation) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  audit({ req, action: 'registrar.graduation.evaluate', targetType: 'Student', targetId: req.valid.params.studentId, meta: { status: evaluation.status } });
  res.json({ evaluation });
});

export const graduationStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.valid.params.studentId)
    .populate('program', 'code name qualificationType graduationPolicy')
    .populate('department', 'code name')
    .populate('admissionAcademicYear', 'label')
    .lean();
  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
  const [evaluation, certificate] = await Promise.all([
    GraduationEvaluation.findOne({ student: student._id }).sort({ createdAt: -1 }).lean(),
    Certificate.findOne({ student: student._id, status: 'issued' }).lean(),
  ]);
  res.json({
    student: {
      ...student,
      id: String(student._id),
      program: student.program ? { ...student.program, id: String(student.program._id), _id: undefined } : null,
      department: student.department ? { ...student.department, id: String(student.department._id), _id: undefined } : null,
      admissionAcademicYear: student.admissionAcademicYear
        ? { ...student.admissionAcademicYear, id: String(student.admissionAcademicYear._id), _id: undefined }
        : null,
      _id: undefined,
    },
    evaluation,
    certificate: certificate
      ? { id: String(certificate._id), certificateNumber: certificate.certificateNumber, status: certificate.status, issuedAt: certificate.issuedAt }
      : null,
  });
});

export const resultOptions = asyncHandler(async (_req, res) => {
  const [offerings, years] = await Promise.all([
    CourseOffering.find(ownFilter({ status: { $in: ['open', 'in_progress', 'completed'] } }))
      .populate('course', 'code title')
      .populate('academicYear', 'label')
      .populate('program', 'code name')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    AcademicYear.find().sort({ startDate: -1 }).lean(),
  ]);
  res.json({
    offerings: offerings.map((row) => ({
      id: String(row._id),
      term: row.term,
      level: row.level,
      course: row.course ? { code: row.course.code, title: row.course.title } : null,
      academicYear: row.academicYear ? { id: String(row.academicYear._id), label: row.academicYear.label } : null,
      program: row.program ? { id: String(row.program._id), code: row.program.code, name: row.program.name } : null,
    })),
    academicYears: years.map((row) => ({ id: String(row._id), label: row.label })),
  });
});
