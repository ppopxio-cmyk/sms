import mongoose from 'mongoose';
import { Student, Enrollment } from '../models/Student.js';
import { Department, Program, Course, AcademicYear, CalendarEvent, Batch } from '../models/AcademicStructure.js';
import { CurriculumPlan } from '../models/Curriculum.js';
import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { Result } from '../models/Records.js';
import { GraduationEvaluation } from '../models/GraduationEvaluation.js';
import { Certificate } from '../models/Documents.js';
import { Notification } from '../models/Notification.js';
import { AuditLog } from '../models/AuditLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signedImageUrl } from '../services/imagekit.service.js';
import { ownFilter } from '../services/registrar.helpers.js';

export const dashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const [
    students,
    activeStudents,
    programmes,
    departments,
    courses,
    currentYear,
    publishedPlans,
    openOfferings,
    activeRegistrations,
    pendingResults,
    eligibleStudents,
    issuedCertificates,
    unreadNotifications,
    recentActivity,
    byProgramme,
    byLevel,
    byQualification,
    registrationWindow,
    batches,
  ] = await Promise.all([
    Student.countDocuments({}),
    Student.countDocuments({ studentStatus: 'active' }),
    Program.countDocuments({ active: true }),
    Department.countDocuments({ active: true }),
    Course.countDocuments({ active: true }),
    AcademicYear.findOne({ isCurrent: true }).lean(),
    CurriculumPlan.countDocuments({ status: 'published' }),
    CourseOffering.countDocuments({ status: 'open' }),
    CourseRegistration.countDocuments({ status: 'registered' }),
    Result.countDocuments(ownFilter({ status: { $in: ['submitted', 'under_review'] } })),
    GraduationEvaluation.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$student', status: { $first: '$status' } } },
      { $match: { status: 'eligible' } },
      { $count: 'total' },
    ]),
    Certificate.countDocuments({ status: 'issued' }),
    Notification.countDocuments({ userId: req.user.id, readAt: null }),
    AuditLog.find({ actorRole: 'REGISTRAR' }).sort({ createdAt: -1 }).limit(8).lean(),
    Student.aggregate([
      { $match: { studentStatus: 'active' } },
      { $group: { _id: '$program', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
      { $lookup: { from: 'programs', localField: '_id', foreignField: '_id', as: 'program' } },
      { $unwind: { path: '$program', preserveNullAndEmptyArrays: true } },
    ]),
    Student.aggregate([{ $match: { studentStatus: 'active' } }, { $group: { _id: '$level', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
    Student.aggregate([{ $match: { studentStatus: 'active' } }, { $group: { _id: '$qualificationType', count: { $sum: 1 } } }]),
    CalendarEvent.findOne(ownFilter({ type: 'registration', startDate: { $lte: now }, endDate: { $gte: now } }))
      .populate('term', 'name')
      .lean(),
    Batch.countDocuments(ownFilter({ status: { $in: ['planned', 'active'] } })),
  ]);

  const evaluationStatuses = await GraduationEvaluation.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$student', status: { $first: '$status' } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const pipeline = { eligible: 0, in_progress: 0, pending_review: 0, not_eligible: 0, certificate_issued: 0 };
  for (const row of evaluationStatuses) pipeline[row._id] = row.count;

  const recent = await Promise.all(
    recentActivity.map(async (row) => ({
      id: String(row._id),
      action: row.action,
      targetType: row.targetType,
      status: row.status,
      at: row.createdAt,
      meta: row.meta && typeof row.meta === 'object'
        ? Object.fromEntries(Object.entries(row.meta).filter(([key]) => !['ip', 'location', 'token', 'password'].includes(key)))
        : null,
    })),
  );

  res.json({
    metrics: {
      students,
      activeStudents,
      programmes,
      departments,
      courses,
      publishedPlans,
      openOfferings,
      activeRegistrations,
      pendingResults,
      eligibleStudents: eligibleStudents[0]?.total ?? 0,
      issuedCertificates,
      unreadNotifications,
      batches,
    },
    currentYear: currentYear ? { id: String(currentYear._id), label: currentYear.label, startDate: currentYear.startDate, endDate: currentYear.endDate } : null,
    registrationWindow: registrationWindow
      ? { id: String(registrationWindow._id), title: registrationWindow.title, startDate: registrationWindow.startDate, endDate: registrationWindow.endDate, term: registrationWindow.term?.name || null }
      : null,
    charts: {
      byProgramme: byProgramme.map((row) => ({
        id: row._id ? String(row._id) : null,
        name: row.program?.name || 'Programme not set',
        code: row.program?.code || '',
        count: row.count,
      })),
      byLevel: byLevel.map((row) => ({ level: row._id, count: row.count })),
      byQualification: byQualification.map((row) => ({ type: row._id, count: row.count })),
      graduation: pipeline,
    },
    recentActivity: recent,
  });
});

export const analytics = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const resultMatch = { status: 'published', totalMark: { $ne: null } };
  if (query.academicYear) resultMatch.academicYear = new mongoose.Types.ObjectId(query.academicYear);
  // After $unwind('$student'), the student fields are flattened onto the
  // top level of the aggregation document. Use the flat names here so the
  // downstream $match works correctly.
  const studentMatch = {};
  if (query.department) studentMatch.department = new mongoose.Types.ObjectId(query.department);
  if (query.program) studentMatch.program = new mongoose.Types.ObjectId(query.program);
  if (query.batch) studentMatch.batch = new mongoose.Types.ObjectId(query.batch);
  if (query.category) studentMatch.category = query.category;

  const [years, departments, programmes, batches, rows] = await Promise.all([
    AcademicYear.find().sort({ startDate: -1 }).select('label isCurrent startDate').lean(),
    Department.find({ active: true }).select('code name').sort({ name: 1 }).lean(),
    Program.find({ active: true }).select('code name department categories').sort({ name: 1 }).lean(),
    Batch.find({ status: { $in: ['planned', 'active'] } }).select('code name program category').sort({ createdAt: -1 }).lean(),
    Result.aggregate([
      { $match: resultMatch },
      {
        $lookup: {
          from: 'students',
          localField: 'student',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      ...(Object.keys(studentMatch).length ? [{ $match: studentMatch }] : []),
      {
        $project: {
          studentId: '$student._id',
          studentNumber: '$student.studentId',
          studentName: '$student.fullName',
          department: '$student.department',
          program: '$student.program',
          batch: '$student.batch',
          category: '$student.studentCategory',
          totalMark: 1,
          letterGrade: 1,
          passed: 1,
          term: 1,
          academicYear: 1,
        },
      },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                resultCount: { $sum: 1 },
                students: { $addToSet: '$studentId' },
                averageMark: { $avg: '$totalMark' },
                passes: { $sum: { $cond: ['$passed', 1, 0] } },
                highestMark: { $max: '$totalMark' },
                lowestMark: { $min: '$totalMark' },
              },
            },
          ],
          byGrade: [
            { $match: { letterGrade: { $ne: null } } },
            { $group: { _id: '$letterGrade', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          byTerm: [
            { $match: { term: { $ne: '' } } },
            {
              $group: {
                _id: '$term',
                averageMark: { $avg: '$totalMark' },
                resultCount: { $sum: 1 },
                passes: { $sum: { $cond: ['$passed', 1, 0] } },
              },
            },
            { $sort: { resultCount: -1 } },
            { $limit: 10 },
          ],
          byDepartment: [
            {
              $group: {
                _id: '$department',
                averageMark: { $avg: '$totalMark' },
                resultCount: { $sum: 1 },
                passes: { $sum: { $cond: ['$passed', 1, 0] } },
                students: { $addToSet: '$studentId' },
              },
            },
            { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'record' } },
            { $unwind: { path: '$record', preserveNullAndEmptyArrays: true } },
            { $sort: { averageMark: -1 } },
          ],
          byProgram: [
            {
              $group: {
                _id: '$program',
                averageMark: { $avg: '$totalMark' },
                resultCount: { $sum: 1 },
                passes: { $sum: { $cond: ['$passed', 1, 0] } },
                students: { $addToSet: '$studentId' },
              },
            },
            { $lookup: { from: 'programs', localField: '_id', foreignField: '_id', as: 'record' } },
            { $unwind: { path: '$record', preserveNullAndEmptyArrays: true } },
            { $sort: { averageMark: -1 } },
            { $limit: 12 },
          ],
          byBatch: [
            {
              $group: {
                _id: '$batch',
                averageMark: { $avg: '$totalMark' },
                resultCount: { $sum: 1 },
                passes: { $sum: { $cond: ['$passed', 1, 0] } },
                students: { $addToSet: '$studentId' },
              },
            },
            { $lookup: { from: 'batches', localField: '_id', foreignField: '_id', as: 'record' } },
            { $unwind: { path: '$record', preserveNullAndEmptyArrays: true } },
            { $sort: { averageMark: -1 } },
            { $limit: 12 },
          ],
          topStudents: [
            {
              $group: {
                _id: '$studentId',
                studentNumber: { $first: '$studentNumber' },
                name: { $first: '$studentName' },
                program: { $first: '$program' },
                batch: { $first: '$batch' },
                averageMark: { $avg: '$totalMark' },
                resultCount: { $sum: 1 },
              },
            },
            { $sort: { averageMark: -1, resultCount: -1 } },
            { $limit: 8 },
            { $lookup: { from: 'programs', localField: 'program', foreignField: '_id', as: 'programme' } },
            { $unwind: { path: '$programme', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'batches', localField: 'batch', foreignField: '_id', as: 'intake' } },
            { $unwind: { path: '$intake', preserveNullAndEmptyArrays: true } },
          ],
        },
      },
    ]),
  ]);

  const data = rows[0] || {};
  const overview = data.overview?.[0];
  const round = (value) => (value === undefined || value === null ? null : Math.round(value * 10) / 10);
  const rate = (passed, total) => (total ? Math.round((passed / total) * 1000) / 10 : null);
  const label = (record) => record?.name || record?.code || 'Not assigned';

  res.json({
    filters: {
      academicYears: years.map((row) => ({ id: String(row._id), label: row.label, isCurrent: row.isCurrent })),
      departments: departments.map((row) => ({ id: String(row._id), code: row.code, name: row.name })),
      programs: programmes.map((row) => ({
        id: String(row._id),
        code: row.code,
        name: row.name,
        department: row.department ? String(row.department) : null,
        categories: row.categories,
      })),
      batches: batches.map((row) => ({
        id: String(row._id),
        code: row.code,
        name: row.name,
        program: row.program ? String(row.program) : null,
        category: row.category,
      })),
    },
    overview: {
      resultCount: overview?.resultCount || 0,
      studentCount: overview?.students?.length || 0,
      averageMark: round(overview?.averageMark),
      passRate: rate(overview?.passes || 0, overview?.resultCount || 0),
      highestMark: round(overview?.highestMark),
      lowestMark: round(overview?.lowestMark),
    },
    byGrade: (data.byGrade || []).map((row) => ({ letter: row._id, count: row.count })),
    byTerm: (data.byTerm || []).map((row) => ({
      term: row._id,
      averageMark: round(row.averageMark),
      resultCount: row.resultCount,
      passRate: rate(row.passes, row.resultCount),
    })),
    byDepartment: (data.byDepartment || []).map((row) => ({
      id: row._id ? String(row._id) : null,
      name: label(row.record),
      code: row.record?.code || '',
      averageMark: round(row.averageMark),
      resultCount: row.resultCount,
      studentCount: row.students?.length || 0,
      passRate: rate(row.passes, row.resultCount),
    })),
    byProgram: (data.byProgram || []).map((row) => ({
      id: row._id ? String(row._id) : null,
      name: label(row.record),
      code: row.record?.code || '',
      averageMark: round(row.averageMark),
      resultCount: row.resultCount,
      studentCount: row.students?.length || 0,
      passRate: rate(row.passes, row.resultCount),
    })),
    byBatch: (data.byBatch || []).map((row) => ({
      id: row._id ? String(row._id) : null,
      name: row.record?.name || row.record?.code || 'No batch',
      code: row.record?.code || '',
      averageMark: round(row.averageMark),
      resultCount: row.resultCount,
      studentCount: row.students?.length || 0,
      passRate: rate(row.passes, row.resultCount),
    })),
    topStudents: (data.topStudents || []).map((row) => ({
      id: String(row._id),
      studentNumber: row.studentNumber,
      name: row.name,
      programme: row.programme?.name || 'No programme',
      batch: row.intake?.code || 'No batch',
      averageMark: round(row.averageMark),
      resultCount: row.resultCount,
    })),
  });
});

export const search = asyncHandler(async (req, res) => {
  const value = String(req.query.search || '').trim();
  if (value.length < 2) return res.json({ results: [] });
  const rx = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [students, programmes, plans] = await Promise.all([
    Student.find(ownFilter({ $or: [{ studentId: rx }, { fullName: rx }] }))
      .select('studentId fullName level photo studentStatus')
      .limit(6)
      .lean(),
    Program.find(ownFilter({ $or: [{ code: rx }, { name: rx }] })).select('code name qualificationType').limit(4).lean(),
    CurriculumPlan.find({ status: 'published' }).populate('program', 'code name').select('title version').limit(4).lean(),
  ]);
  res.json({
    results: [
      ...students.map((row) => ({
        kind: 'student',
        id: String(row._id),
        label: row.fullName,
        detail: `${row.studentId} · Level ${row.level}`,
        photo: row.photo?.filePath ? signedImageUrl(row.photo.filePath, { expiresIn: 900 }) : null,
      })),
      ...programmes.map((row) => ({ kind: 'programme', id: String(row._id), label: row.name, detail: `${row.code} · ${row.qualificationType}` })),
      ...plans.map((row) => ({ kind: 'curriculum', id: String(row._id), label: row.title, detail: `${row.program?.code || ''} · v${row.version}` })),
    ],
  });
});
