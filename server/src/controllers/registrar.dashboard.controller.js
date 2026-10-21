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
