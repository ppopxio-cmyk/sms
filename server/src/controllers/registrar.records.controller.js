import mongoose from 'mongoose';
import { AttendanceRecord, Result, GradingPolicy, findBand } from '../models/Records.js';
import { Student, Enrollment } from '../models/Student.js';
import { CourseOffering } from '../models/Offering.js';
import { AcademicYear, Program, Batch } from '../models/AcademicStructure.js';
import { GraduationEvaluation } from '../models/GraduationEvaluation.js';
import { Certificate } from '../models/Documents.js';
import { User } from '../models/User.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { pageOf, sortOf, searchFilter, mergeFilters, paged, ownFilter } from '../services/registrar.helpers.js';
import { requireGradingPolicy, gradeFor, calculateGpa, getGradingPolicy, cgpaForStudent, publishedResultsForStudent } from '../services/grading.service.js';
import { buildExport } from '../services/export.service.js';
import { evaluateStudent } from '../services/eligibility.service.js';
import { sendCode } from '../services/codeDelivery.js';
import { checkCode, resendWaitMessage } from '../services/code.service.js';

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

const REVIEWABLE_RESULT_STATUSES = ['submitted', 'under_review', 'approved', 'published'];

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
    query.program ? { program: query.program } : null,
    query.batch ? { batch: query.batch } : null,
    query.department ? { department: query.department } : null,
    query.level ? { level: Number(query.level) } : null,
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
        published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
        latestSubmittedAt: { $max: '$submittedAt' },
        latestUpdatedAt: { $max: '$updatedAt' },
      },
    },
    { $sort: { latestSubmittedAt: -1, latestUpdatedAt: -1 } },
    { $limit: 500 },
  ]);
  const offerings = await CourseOffering.find(ownFilter({ _id: { $in: groups.map((row) => row._id) } }))
    .populate('course', 'code title')
    .populate('teacher', 'name email')
    .populate('academicYear', 'label')
    .populate('program', 'code name qualificationType durationYears levels shortTerm finalizedStages')
    .populate('department', 'code name')
    .populate('batch', 'code name category currentLevel')
    .lean();
  const byId = new Map(offerings.map((row) => [String(row._id), row]));
  res.json({
    rows: groups.map((group) => {
      const offering = byId.get(String(group._id));
      const pending = group.submitted + group.underReview;
      let status = 'approved';
      if (pending > 0) {
        status = group.underReview ? 'under_review' : 'submitted';
      } else if (group.published === group.total && group.total > 0) {
        status = 'published';
      } else {
        status = 'approved';
      }
      return {
        id: String(group._id),
        course: offering?.course ? { id: String(offering.course._id), code: offering.course.code, title: offering.course.title } : null,
        teacher: offering?.teacher ? { id: String(offering.teacher._id), name: offering.teacher.name, email: offering.teacher.email } : null,
        department: offering?.department ? { id: String(offering.department._id), code: offering.department.code, name: offering.department.name } : null,
        program: offering?.program ? {
          id: String(offering.program._id),
          code: offering.program.code,
          name: offering.program.name,
          qualificationType: offering.program.qualificationType || 'degree',
          durationYears: offering.program.durationYears,
          levels: offering.program.levels,
          shortTerm: offering.program.shortTerm,
          finalizedStages: offering.program.finalizedStages || [],
        } : null,
        batch: offering?.batch ? { id: String(offering.batch._id), code: offering.batch.code, name: offering.batch.name, category: offering.batch.category } : null,
        category: offering?.category || offering?.batch?.category || 'regular',
        term: offering?.term ?? '',
        level: offering?.level ?? 1,
        academicYear: offering?.academicYear?.label ?? '',
        counts: {
          total: group.total,
          submitted: group.submitted,
          underReview: group.underReview,
          approved: group.approved,
          published: group.published,
          pending,
        },
        status,
        latestSubmittedAt: group.latestSubmittedAt,
        latestUpdatedAt: group.latestUpdatedAt,
      };
    }),
  });
});

export const singleOfferingResults = asyncHandler(async (req, res) => {
  const offeringId = req.valid.params.offering;
  const offering = await CourseOffering.findById(offeringId)
    .populate('course', 'code title creditHours')
    .populate('program', 'code name qualificationType durationYears')
    .populate('department', 'code name')
    .populate('teacher', 'name email')
    .populate('batch', 'code name')
    .lean();
  if (!offering) throw new AppError(404, 'OFFERING_NOT_FOUND', 'Course offering not found.');
  const results = await Result.find({ offering: offeringId })
    .populate('student', 'studentId firstName lastName fullName')
    .sort({ 'student.studentId': 1 })
    .lean();
  res.json({ offering, results });
});

export const requestResultSubmitCode = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user?.email) throw new AppError(400, 'NO_EMAIL', 'Your account has no email address.');
  const sent = await sendCode(user, 'result_submission');
  if (!sent) {
    throw new AppError(429, 'WAIT_BEFORE_RESEND', resendWaitMessage);
  }
  res.json({ message: `A 6-digit confirmation code has been sent to ${user.email}.` });
});

export const submitStageComplete = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user?.email) throw new AppError(400, 'NO_EMAIL', 'Your account has no email address.');
  const code = String(req.body.code || '').trim();
  if (!code) throw new AppError(400, 'CODE_REQUIRED', 'Confirmation code is required.');
  await checkCode(user._id, 'result_submission', code);

  const { programId, level, batchId } = req.body;
  if (!programId || level === undefined) throw new AppError(400, 'STAGE_REQUIRED', 'Program and stage level are required.');

  const isAllLevels = String(level).toLowerCase() === 'all';
  const levelNumber = isAllLevels ? null : Number(level);

  // Resolve the exact batch for this program if a batchId (or batch code) was passed
  let effectiveBatchId = null;
  if (batchId) {
    let batchDoc = mongoose.isValidObjectId(batchId) ? await Batch.findById(batchId).lean() : null;
    if (batchDoc) {
      if (String(batchDoc.program) === String(programId)) {
        effectiveBatchId = batchDoc._id;
      } else {
        const matchingBatch = await Batch.findOne({
          program: programId,
          code: batchDoc.code,
          category: batchDoc.category || 'regular',
        }).lean();
        effectiveBatchId = matchingBatch?._id || null;
      }
    } else {
      const matchingBatch = await Batch.findOne({ program: programId, code: String(batchId) }).lean();
      effectiveBatchId = matchingBatch?._id || null;
    }
  }

  // Try finding offerings with effectiveBatchId first; if none, fall back to program
  let offerings = [];
  if (effectiveBatchId) {
    offerings = await CourseOffering.find({
      program: programId,
      ...(isAllLevels ? {} : { level: levelNumber }),
      batch: effectiveBatchId,
    }).select('_id status batch level').lean();
  }

  if (!offerings.length) {
    offerings = await CourseOffering.find({
      program: programId,
      ...(isAllLevels ? {} : { level: levelNumber }),
    }).select('_id status batch level').lean();
  }

  if (!offerings.length) {
    throw new AppError(400, 'NO_OFFERINGS', isAllLevels
      ? 'No course offerings found for this programme.'
      : `No course offerings found for this programme and stage ${level}.`);
  }
  const offeringIds = offerings.map((o) => o._id);

  // Require that every course offering in this stage has submitted or approved marks
  const unsubmitted = [];
  for (const off of offerings) {
    const hasSubmitted = await Result.exists({
      offering: off._id,
      status: { $in: ['submitted', 'under_review', 'approved', 'published'] },
    });
    if (!hasSubmitted) {
      unsubmitted.push(off._id);
    }
  }

  if (unsubmitted.length > 0) {
    throw new AppError(
      400,
      'STAGE_INCOMPLETE',
      isAllLevels
        ? `Cannot publish complete programme: ${unsubmitted.length} course(s) do not have submitted results yet. Teachers must submit marks for all courses before results can be published to GPA.`
        : `Cannot publish Year/Level ${level}: not all courses in this stage have submitted results. Teachers must submit marks for all courses before this stage can be published to GPA and transcripts.`
    );
  }

  const policy = await requireGradingPolicy();
  const results = await Result.find({ offering: { $in: offeringIds }, status: { $in: ['submitted', 'under_review', 'approved'] } });

  for (const r of results) {
    if (r.totalMark !== null && r.totalMark !== undefined) {
      try {
        const band = gradeFor(policy, r.totalMark);
        if (band) {
          r.letterGrade = band.letter;
          r.gradePoint = band.points;
          r.passed = band.pass;
        }
      } catch {
        const fallback = findBand(policy, Number(r.totalMark));
        if (fallback) {
          r.letterGrade = fallback.letter;
          r.gradePoint = fallback.points;
          r.passed = fallback.pass;
        }
      }
      r.gradingPolicyVersion = policy.version;
    }
    r.status = 'published';
    r.publishedAt = new Date();
    r.publishedBy = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null;
    await r.save();
  }

  await CourseOffering.updateMany(
    { _id: { $in: offeringIds } },
    { $set: { status: 'completed' } },
  );

  const prog = await Program.findById(programId).lean();
  let totalStages = 4;
  if (prog) {
    if (prog.qualificationType === 'degree') totalStages = prog.durationYears || 4;
    else if (prog.qualificationType === 'diploma') totalStages = prog.levels?.length ? Math.max(...prog.levels) : 4;
    else if (prog.shortTerm?.duration) totalStages = prog.shortTerm.duration;
  }
  const allStages = Array.from({ length: totalStages }, (_, i) => i + 1);

  if (isAllLevels) {
    await Program.updateOne(
      { _id: programId },
      { $addToSet: { finalizedStages: { $each: allStages } } }
    );
  } else {
    await Program.updateOne(
      { _id: programId },
      { $addToSet: { finalizedStages: levelNumber } }
    );
  }

  const allOfferings = await CourseOffering.find({
    program: programId,
    ...(effectiveBatchId ? { batch: effectiveBatchId } : {}),
  }).select('level status batch').lean();

  const finishedStages = [];
  for (let s = 1; s <= totalStages; s++) {
    const lvlOffs = allOfferings.filter((o) => o.level === s);
    if (lvlOffs.length > 0 && lvlOffs.every((o) => o.status === 'completed')) {
      finishedStages.push(s);
    }
  }

  const allStagesFinished = isAllLevels || (totalStages > 0 && finishedStages.length >= totalStages);
  const targetBatchId = effectiveBatchId || offerings[0]?.batch || batchId;
  if (targetBatchId && allStagesFinished) {
    await Batch.updateOne(
      { _id: targetBatchId },
      { $set: { status: 'completed' } }
    );
  }

  // Advance student levels automatically when a stage is completed
  if (!isAllLevels && levelNumber && levelNumber < totalStages) {
    const studentFilter = {
      program: programId,
      ...(effectiveBatchId ? { batch: effectiveBatchId } : {}),
      level: { $lte: levelNumber },
    };
    await Student.updateMany(studentFilter, { $set: { level: levelNumber + 1 } });
    await Enrollment.updateMany(
      { program: programId, ...(effectiveBatchId ? { batch: effectiveBatchId } : {}), level: { $lte: levelNumber } },
      { $set: { level: levelNumber + 1 } }
    );
  } else if (isAllLevels || (levelNumber && levelNumber >= totalStages)) {
    const studentFilter = {
      program: programId,
      ...(effectiveBatchId ? { batch: effectiveBatchId } : {}),
    };
    await Student.updateMany(studentFilter, { $set: { level: totalStages } });
  }

  audit({
    req,
    action: isAllLevels ? 'registrar.results.all_stages_submitted' : 'registrar.results.stage_submitted',
    targetType: 'Program',
    targetId: programId,
    meta: { level, publishedCount: results.length, allStages: isAllLevels },
  });

  res.json({
    message: isAllLevels
      ? `All ${totalStages} years/stages finalized and published. Ready for GPA calculation!`
      : `Level/Year ${level} results finalized and published. Ready for GPA calculation!`,
    publishedCount: results.length,
    allStages: isAllLevels,
  });
});

export const submitProgramFinished = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user?.email) throw new AppError(400, 'NO_EMAIL', 'Your account has no email address.');
  const code = String(req.body.code || '').trim();
  if (!code) throw new AppError(400, 'CODE_REQUIRED', 'Confirmation code is required.');
  await checkCode(user._id, 'result_submission', code);

  const { programId, batchId } = req.body;
  if (!programId) throw new AppError(400, 'PROGRAM_REQUIRED', 'Program ID is required.');

  const program = await Program.findById(programId).lean();
  if (!program) throw new AppError(404, 'PROGRAM_NOT_FOUND', 'Program not found.');

  let effectiveBatchId = null;
  if (batchId) {
    let batchDoc = mongoose.isValidObjectId(batchId) ? await Batch.findById(batchId).lean() : null;
    if (batchDoc) {
      if (String(batchDoc.program) === String(programId)) {
        effectiveBatchId = batchDoc._id;
      } else {
        const matchingBatch = await Batch.findOne({
          program: programId,
          code: batchDoc.code,
          category: batchDoc.category || 'regular',
        }).lean();
        effectiveBatchId = matchingBatch?._id || null;
      }
    } else {
      const matchingBatch = await Batch.findOne({ program: programId, code: String(batchId) }).lean();
      effectiveBatchId = matchingBatch?._id || null;
    }
  }

  let offerings = [];
  if (effectiveBatchId) {
    offerings = await CourseOffering.find({ program: programId, batch: effectiveBatchId }).select('_id batch').lean();
  }
  if (!offerings.length) {
    offerings = await CourseOffering.find({ program: programId }).select('_id batch').lean();
  }
  const offeringIds = offerings.map((o) => o._id);

  const policy = await requireGradingPolicy();
  const results = await Result.find({ offering: { $in: offeringIds }, status: { $ne: 'published' } });

  for (const r of results) {
    if (r.totalMark !== null && r.totalMark !== undefined) {
      try {
        const band = gradeFor(policy, r.totalMark);
        if (band) {
          r.letterGrade = band.letter;
          r.gradePoint = band.points;
          r.passed = band.pass;
        }
      } catch {
        const fallback = findBand(policy, Number(r.totalMark));
        if (fallback) {
          r.letterGrade = fallback.letter;
          r.gradePoint = fallback.points;
          r.passed = fallback.pass;
        }
      }
      r.gradingPolicyVersion = policy.version;
    }
    r.status = 'published';
    r.publishedAt = new Date();
    r.publishedBy = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null;
    await r.save();
  }

  const targetBatchId = effectiveBatchId || offerings[0]?.batch || batchId;
  if (targetBatchId) {
    await Batch.updateOne({ _id: targetBatchId }, { $set: { status: 'completed', readyForCgpa: true } });
  }

  await CourseOffering.updateMany(
    { _id: { $in: offeringIds } },
    { $set: { status: 'completed' } },
  );

  let totalStages = 4;
  if (program) {
    if (program.qualificationType === 'degree') totalStages = program.durationYears || 4;
    else if (program.qualificationType === 'diploma') totalStages = program.levels?.length ? Math.max(...program.levels) : 4;
    else if (program.shortTerm?.duration) totalStages = program.shortTerm.duration;
  }

  const allStageNumbers = Array.from({ length: totalStages }, (_, i) => i + 1);
  await Program.updateOne(
    { _id: programId },
    { $addToSet: { finalizedStages: { $each: allStageNumbers } } }
  );

  audit({
    req,
    action: 'registrar.results.program_finished',
    targetType: 'Program',
    targetId: programId,
    meta: { batchId, programCode: program.code },
  });

  res.json({ message: `Programme all years finished and verified. All results published and ready for CGPA!`, programCode: program.code });
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

export const readyGpaCohorts = asyncHandler(async (req, res) => {
  const policy = await getGradingPolicy();

  // Load all batches
  const batches = await Batch.find({ status: { $ne: 'archived' } })
    .populate('program', 'code name qualificationType durationYears levels shortTerm finalizedStages')
    .populate('department', 'code name')
    .populate('admissionAcademicYear', 'label')
    .lean();

  // Bulk query all offerings
  const allOfferings = await CourseOffering.find({}).select('_id level program batch course creditHours').lean();
  const offeringsByBatch = new Map();
  for (const off of allOfferings) {
    const key = String(off.batch);
    if (!offeringsByBatch.has(key)) offeringsByBatch.set(key, []);
    offeringsByBatch.get(key).push(off);
  }

  // Bulk aggregate result counts by offering
  const offeringCounts = await Result.aggregate([
    { $match: { status: { $in: ['submitted', 'under_review', 'approved', 'published'] } } },
    {
      $group: {
        _id: '$offering',
        published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
        submitted: { $sum: { $cond: [{ $in: ['$status', ['submitted', 'under_review', 'approved']] }, 1, 0] } },
      },
    },
  ]);
  const countMap = new Map(offeringCounts.map((r) => [String(r._id), r]));

  // Bulk aggregate student counts by batch
  const studentCounts = await Student.aggregate([
    { $match: { studentStatus: { $ne: 'archived' } } },
    { $group: { _id: '$batch', count: { $sum: 1 } } },
  ]);
  const studentMap = new Map(studentCounts.map((r) => [String(r._id), r.count]));

  const cohorts = [];

  for (const b of batches) {
    const prog = b.program;
    const dept = b.department;
    if (!prog || !dept) continue;

    const offerings = offeringsByBatch.get(String(b._id)) || [];
    if (!offerings.length) continue;

    let pubCount = 0;
    let subCount = 0;
    for (const off of offerings) {
      const c = countMap.get(String(off._id));
      if (c) {
        pubCount += c.published || 0;
        subCount += c.submitted || 0;
      }
    }

    // Only include cohort if all marks are published and ready for GPA calculation
    // "if its 0 Published Marks do not show that department only all marks published departments visble ready to GPA calculation"
    if (pubCount === 0) continue;

    const totalStages = prog.qualificationType === 'degree'
      ? (prog.durationYears || 4)
      : prog.qualificationType === 'diploma'
      ? (prog.levels?.length ? Math.max(...prog.levels) : 4)
      : (prog.shortTerm?.duration || 1);

    const durationUnit = prog.qualificationType === 'degree' ? 'Year' : prog.qualificationType === 'diploma' ? 'Level' : 'Month';

    const stages = [];
    let allPublished = true;
    for (let s = 1; s <= totalStages; s++) {
      const sOfferings = offerings.filter((o) => o.level === s);
      let sPub = 0;
      let sSub = 0;
      for (const off of sOfferings) {
        const c = countMap.get(String(off._id));
        if (c) {
          sPub += c.published || 0;
          sSub += c.submitted || 0;
        }
      }

      const isFin = (prog.finalizedStages || []).includes(s) || (sPub > 0 && sSub === 0);
      if (!isFin) allPublished = false;

      stages.push({
        level: s,
        label: `${durationUnit} ${s}`,
        offeringCount: sOfferings.length,
        publishedCount: sPub,
        submittedCount: sSub,
        status: isFin ? 'published' : sSub > 0 ? 'submitted' : 'pending',
      });
    }

    // Must have all marks published across all stages to be ready for GPA calculation
    if (!allPublished) continue;

    const studentCount = studentMap.get(String(b._id)) || 0;
    const calculatedStages = b.calculatedStages || [];
    const allStagesCalculated = totalStages > 0 && calculatedStages.length >= totalStages;

    cohorts.push({
      id: `${prog._id}_${b._id}`,
      program: {
        id: String(prog._id),
        code: prog.code,
        name: prog.name,
        qualificationType: prog.qualificationType,
        durationYears: prog.durationYears,
        durationUnit,
        finalizedStages: prog.finalizedStages || [],
      },
      department: {
        id: String(dept._id),
        code: dept.code,
        name: dept.name,
      },
      batch: {
        id: String(b._id),
        code: b.code,
        name: b.name,
        category: b.category || 'regular',
        admissionAcademicYear: b.admissionAcademicYear?.label || '2019',
        calculatedStages,
        allStagesCalculated,
        readyForCgpa: Boolean(b.readyForCgpa),
        cgpaCalculated: Boolean(b.cgpaCalculated),
        status: b.status,
      },
      totalStages,
      durationUnit,
      stages,
      allStagesPublished: allPublished,
      calculatedStages,
      allStagesCalculated,
      studentCount,
      totalPublishedResults: pubCount,
      totalSubmittedResults: subCount,
      readyForCgpa: Boolean(b.readyForCgpa),
      cgpaCalculated: Boolean(b.cgpaCalculated),
    });
  }

  res.json({ cohorts, configured: Boolean(policy) });
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
    const student = await Student.findById(query.student)
      .populate('program', 'code name qualificationType')
      .populate('batch', 'code name')
      .lean();
    if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');
    const rows = await publishedResultsForStudent(query.student);
    const cumResult = calculateGpa(rows, policy);

    const stageMap = new Map();
    for (const r of rows) {
      const lvl = r.offering?.level || 1;
      if (!stageMap.has(lvl)) stageMap.set(lvl, []);
      stageMap.get(lvl).push(r);
    }
    const stageBreakdown = Array.from(stageMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([lvl, lvlRows]) => {
        const stats = calculateGpa(lvlRows, policy);
        return {
          level: lvl,
          gpa: stats.gpa,
          credits: stats.credits,
          qualityPoints: stats.qualityPoints,
          courseCount: stats.courses,
        };
      });

    return res.json({
      configured: true,
      student: {
        id: String(student._id),
        studentId: student.studentId,
        fullName: student.fullName,
        program: student.program?.name,
        batch: student.batch?.code,
        level: student.level,
      },
      cgpa: cumResult.gpa,
      credits: cumResult.credits,
      qualityPoints: cumResult.qualityPoints,
      courseCount: cumResult.courses,
      courses: rows,
      stageBreakdown,
    });
  }

  let programInfo = null;
  let stageCompleted = false;
  let allStagesFinished = false;

  if (query.program) {
    const prog = await Program.findById(query.program).lean();
    if (prog) {
      const isDegree = prog.qualificationType === 'degree';
      const isDiploma = prog.qualificationType === 'diploma';
      const durationUnit = isDegree ? 'Year' : isDiploma ? 'Level' : 'Duration';
      let totalStages = 4;
      if (isDegree) totalStages = prog.durationYears || 4;
      else if (isDiploma) totalStages = prog.levels?.length ? Math.max(...prog.levels) : 4;
      else if (prog.shortTerm?.duration) totalStages = prog.shortTerm.duration;

      const offFilter = {
        program: query.program,
        ...(query.batch ? { batch: query.batch } : {}),
      };
      const offerings = await CourseOffering.find(offFilter).select('level status').lean();

      const finishedStages = [];
      for (let s = 1; s <= totalStages; s++) {
        const lvlOffs = offerings.filter((o) => o.level === s);
        if (lvlOffs.length > 0 && lvlOffs.every((o) => o.status === 'completed')) {
          finishedStages.push(s);
        }
      }

      if (query.level) {
        stageCompleted = finishedStages.includes(Number(query.level));
      }

      allStagesFinished = totalStages > 0 && finishedStages.length >= totalStages;

      programInfo = {
        id: String(prog._id),
        code: prog.code,
        name: prog.name,
        qualificationType: prog.qualificationType,
        durationUnit,
        totalStages,
        finishedStages,
      };

      if (query.batch) {
        const bDoc = await Batch.findById(query.batch).select('readyForCgpa cgpaCalculated calculatedStages').lean();
        if (bDoc) {
          programInfo.readyForCgpa = Boolean(bDoc.readyForCgpa);
          programInfo.cgpaCalculated = Boolean(bDoc.cgpaCalculated);
          programInfo.calculatedStages = bDoc.calculatedStages || [];
        }
      }
    }
  }

  const batchDoc = query.batch ? await Batch.findById(query.batch).select('readyForCgpa cgpaCalculated calculatedStages').lean() : null;

  const studentFilter = mergeFilters(
    query.program ? { program: query.program } : null,
    query.batch ? { batch: query.batch } : null,
  );
  const students = await Student.find(studentFilter)
    .populate('program', 'code name qualificationType')
    .populate('batch', 'code name')
    .sort({ fullName: 1 })
    .limit(500)
    .lean();

  const rows = [];
  const isStageCalculated = Boolean(batchDoc?.calculatedStages?.includes(Number(query.level)));

  for (const student of students) {
    const studentResults = await publishedResultsForStudent(student._id);
    const cumResult = studentResults.length > 0
      ? calculateGpa(studentResults, policy)
      : { gpa: null, credits: 0, qualityPoints: 0, courses: 0 };

    let stageGpa = null;
    let stageCredits = null;
    let stageCourses = 0;

    // Only expose calculated stage GPA if the stage has officially been calculated on this page!
    if (query.level && isStageCalculated) {
      const stageRows = studentResults.filter((r) => Number(r.offering?.level) === Number(query.level));
      if (stageRows.length > 0) {
        const sRes = calculateGpa(stageRows, policy);
        stageGpa = sRes.gpa;
        stageCredits = sRes.credits;
        stageCourses = sRes.courses;
      }
    }

    rows.push({
      id: String(student._id),
      studentId: student.studentId,
      fullName: student.fullName,
      program: student.program?.name,
      batch: student.batch?.code,
      level: student.level,
      cgpa: cumResult.gpa,
      credits: cumResult.credits,
      qualityPoints: cumResult.qualityPoints,
      courseCount: cumResult.courses,
      stageGpa,
      stageCredits,
      stageCourses,
      courses: studentResults,
    });
  }

  res.json({
    configured: true,
    rows,
    programInfo,
    stageCompleted,
    allStagesFinished,
    policyVersion: policy.version,
  });
});

export const calculateStageGpa = asyncHandler(async (req, res) => {
  const { programId, batchId, level } = req.body;
  if (!programId) throw new AppError(400, 'PROGRAM_REQUIRED', 'Programme is required.');
  if (!batchId) throw new AppError(400, 'BATCH_REQUIRED', 'Batch is required.');
  const stageNum = Number(level);
  if (!stageNum || stageNum < 1) throw new AppError(400, 'LEVEL_REQUIRED', 'Valid Stage/Year is required.');

  const policy = await requireGradingPolicy();
  const prog = await Program.findById(programId).lean();
  if (!prog) throw new AppError(404, 'PROGRAM_NOT_FOUND', 'Programme not found.');

  const batch = await Batch.findById(batchId);
  if (!batch) throw new AppError(404, 'BATCH_NOT_FOUND', 'Batch not found.');

  // Find all students in this batch
  const students = await Student.find({ batch: batchId, program: programId });
  if (!students.length) throw new AppError(404, 'NO_STUDENTS', 'No students found in this batch.');

  // Compute stage GPA for every student in this cohort
  for (const student of students) {
    const studentResults = await publishedResultsForStudent(student._id);
    const stageRows = studentResults.filter((r) => Number(r.offering?.level) === stageNum);
    if (stageRows.length > 0) {
      calculateGpa(stageRows, policy);
    }
  }

  // Record that this stage has had its GPA calculated in the database
  if (!batch.calculatedStages) batch.calculatedStages = [];
  if (!batch.calculatedStages.includes(stageNum)) {
    batch.calculatedStages.push(stageNum);
    await batch.save();
  }

  const totalStages = prog.qualificationType === 'degree'
    ? (prog.durationYears || 4)
    : prog.qualificationType === 'diploma'
    ? (prog.levels?.length ? Math.max(...prog.levels) : 4)
    : (prog.shortTerm?.duration || 1);

  const allStagesCalculated = totalStages > 0 && batch.calculatedStages.length >= totalStages;

  audit({
    req,
    action: 'registrar.gpa.calculate_stage',
    targetType: 'Batch',
    targetId: batch._id,
    meta: { programId, level: stageNum, calculatedStages: batch.calculatedStages },
  });

  const durationUnit = prog.qualificationType === 'degree' ? 'Year' : prog.qualificationType === 'diploma' ? 'Level' : 'Month';
  res.json({
    success: true,
    level: stageNum,
    calculatedStages: batch.calculatedStages,
    allStagesCalculated,
    message: `${durationUnit} ${stageNum} GPA calculated successfully!`,
  });
});

export const sendToCgpa = asyncHandler(async (req, res) => {
  const { programId, batchId } = req.body;
  if (!programId) throw new AppError(400, 'PROGRAM_REQUIRED', 'Programme is required.');

  const filter = {
    program: programId,
    ...(batchId ? { _id: batchId } : {}),
  };
  await Batch.updateMany(filter, {
    $set: {
      readyForCgpa: true,
      sentToTranscripts: true,
      sentToCgpaAt: new Date(),
    },
  });

  audit({
    req,
    action: 'registrar.gpa.send_to_cgpa',
    targetType: 'Program',
    targetId: programId,
    meta: { batchId },
  });

  res.json({ success: true, message: 'Programme sent to CGPA & Transcripts successfully!' });
});

export const calculateCgpaAndGraduate = asyncHandler(async (req, res) => {
  const { programId, batchId } = req.body;
  if (!programId) throw new AppError(400, 'PROGRAM_REQUIRED', 'Programme is required.');

  const policy = await requireGradingPolicy();
  const studentFilter = {
    program: programId,
    ...(batchId ? { batch: batchId } : {}),
  };
  const students = await Student.find(studentFilter);
  if (!students.length) {
    throw new AppError(404, 'NO_STUDENTS', 'No students found for this programme and batch.');
  }

  const completionDate = new Date();
  let graduatedCount = 0;
  for (const student of students) {
    const studentResults = await publishedResultsForStudent(student._id);
    const cumResult = calculateGpa(studentResults, policy);

    student.studentStatus = 'graduated';
    student.enrollmentStatus = 'completed';
    student.completionDate = completionDate;
    student.graduationEligible = true;
    await student.save();
    graduatedCount++;
  }

  await Enrollment.updateMany(
    { student: { $in: students.map((s) => s._id) } },
    { $set: { status: 'completed' } }
  );

  const batchFilter = {
    program: programId,
    ...(batchId ? { _id: batchId } : {}),
  };
  await Batch.updateMany(batchFilter, {
    $set: {
      cgpaCalculated: true,
      status: 'completed',
      readyForGraduation: true,
    },
  });

  audit({
    req,
    action: 'registrar.cgpa.calculate_and_graduate',
    targetType: 'Program',
    targetId: programId,
    meta: { batchId, graduatedCount },
  });

  res.json({
    success: true,
    count: graduatedCount,
    message: `Cumulative CGPA calculated for all ${graduatedCount} students. Students have been marked as Graduated & Ready for Certification!`,
  });
});

export const exportStudentGpaRecord = asyncHandler(async (req, res) => {
  const studentId = req.params.studentId;
  const { format = 'pdf', level } = req.query;
  const policy = await getGradingPolicy();
  if (!policy) throw new AppError(409, 'POLICY_NOT_CONFIGURED', 'Grading policy is not configured.');

  const student = await Student.findOne(
    mongoose.Types.ObjectId.isValid(studentId)
      ? { $or: [{ _id: studentId }, { studentId }] }
      : { studentId },
  )
    .populate('program', 'code name qualificationType')
    .populate('batch', 'code name')
    .lean();

  if (!student) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student record was not found.');

  const allRows = await publishedResultsForStudent(student._id);
  const rowsToUse = level
    ? allRows.filter((r) => Number(r.offering?.level) === Number(level))
    : allRows;

  const cumResult = calculateGpa(allRows, policy);
  const stageResult = level ? calculateGpa(rowsToUse, policy) : null;

  const columns = [
    { key: 'code', label: 'Course Code', width: 14 },
    { key: 'title', label: 'Course Title', width: 30 },
    { key: 'level', label: 'Year / Level', width: 12 },
    { key: 'term', label: 'Term', width: 12 },
    { key: 'credits', label: 'Credits', width: 10 },
    { key: 'mark', label: 'Total Mark', width: 12 },
    { key: 'grade', label: 'Grade', width: 10 },
    { key: 'points', label: 'Points', width: 10 },
  ];

  const exportRows = rowsToUse.map((r) => ({
    code: r.course?.code || '—',
    title: r.course?.title || '—',
    level: r.offering?.level != null ? `Level/Year ${r.offering.level}` : '—',
    term: r.term || '—',
    credits: r.creditHours ?? r.course?.creditHours ?? '—',
    mark: r.totalMark != null ? r.totalMark : '—',
    grade: r.letterGrade || '—',
    points: r.gradePoint != null ? Number(r.gradePoint).toFixed(2) : '—',
  }));

  const summary = [
    `Student ID: ${student.studentId} | Name: ${student.fullName}`,
    `Programme: ${student.program?.name || '—'} (${student.program?.code || ''}) | Batch: ${student.batch?.code || '—'}`,
    `Cumulative CGPA: ${cumResult.gpa ?? '—'} | Total Credits Earned: ${cumResult.credits ?? 0}`,
    level ? `Stage Level ${level} GPA: ${stageResult?.gpa ?? '—'} (Credits: ${stageResult?.credits ?? 0})` : null,
  ].filter(Boolean).join('\n');

  const file = await buildExport({
    format,
    filenamePrefix: `GPA_${student.studentId}`,
    title: 'OFFICIAL ACADEMIC & GPA RECORD',
    subtitle: `${student.fullName} · ${student.studentId}`,
    summary,
    columns,
    rows: exportRows,
  });

  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.buffer);
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
