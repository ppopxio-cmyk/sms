import crypto from 'node:crypto';
import { RegistrationPortal } from '../models/RegistrationPortal.js';
import { StudentApplication } from '../models/StudentApplication.js';
import { Student, Enrollment } from '../models/Student.js';
import { Program, Department, Batch, AcademicYear } from '../models/AcademicStructure.js';
import { nextStudentId } from './registrar.students.controller.js';
import { sendStudentAdmissionEmail } from '../services/mail.service.js';
import { audit } from '../services/audit.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parseEATDate, toEthiopian, fromEthiopian, ETH_MONTHS } from '../utils/ethiopianDate.js';
import { normalizePhone, isValidEthiopianPhone } from '../utils/phone.js';

// 1. Create Registration Portal (Registrar)
export const createPortal = asyncHandler(async (req, res) => {
  const {
    title,
    department,
    program,
    batch,
    batches = [],
    category = 'regular',
    opensAt,
    closesAt,
    tutorialVideoUrl = '',
    instructions = '',
    maxApplications = 500,
  } = req.body;

  if (!tutorialVideoUrl || !tutorialVideoUrl.trim()) {
    throw new AppError(400, 'TUTORIAL_REQUIRED', 'YouTube Tutorial Video URL is required.');
  }

  if (!opensAt || !closesAt) {
    throw new AppError(400, 'DATES_REQUIRED', 'Valid opening and closing dates are required.');
  }

  // Resolve multiple batches or single batch
  const batchIdList = Array.isArray(batches) && batches.length > 0 ? batches : (batch ? [batch] : []);
  let resolvedBatches = [];
  let resolvedPrograms = [];
  let resolvedDepartments = [];
  let primaryBatch = batch || null;
  let primaryProgram = program || null;
  let primaryDept = department || null;

  if (batchIdList.length > 0) {
    resolvedBatches = await Batch.find({ _id: { $in: batchIdList } }).populate('program').lean();
    resolvedPrograms = [...new Set(resolvedBatches.map((b) => String(b.program?._id || b.program)).filter(Boolean))];
    const programDocs = await Program.find({ _id: { $in: resolvedPrograms } }).lean();
    resolvedDepartments = [...new Set(programDocs.map((p) => String(p.department)).filter(Boolean))];

    if (!primaryBatch && resolvedBatches.length > 0) primaryBatch = resolvedBatches[0]._id;
    if (!primaryProgram && resolvedPrograms.length > 0) primaryProgram = resolvedPrograms[0];
    if (!primaryDept && resolvedDepartments.length > 0) primaryDept = resolvedDepartments[0];
  }

  if (!primaryProgram && program) primaryProgram = program;
  if (!primaryDept && department) primaryDept = department;

  if (!primaryDept || !primaryProgram) {
    throw new AppError(400, 'STRUCTURE_REQUIRED', 'Target department, programme or batches must be selected.');
  }

  // Auto-detect delivery category from selected batches
  const batchCategories = [...new Set(resolvedBatches.map((b) => b.category).filter(Boolean))];
  let autoCategory = 'regular';
  if (batchCategories.length === 1) {
    autoCategory = batchCategories[0];
  } else if (batchCategories.length > 1) {
    autoCategory = 'both';
  } else if (category) {
    autoCategory = category;
  }

  // Auto-generate title if missing or empty: [Academic Year] New Student Registration on [Regular/Extension] — [Programmes]
  let portalTitle = (title || '').trim();
  if (!portalTitle) {
    const deliveryLabel = autoCategory === 'both' ? 'Regular and Extension' : (autoCategory.charAt(0).toUpperCase() + autoCategory.slice(1));
    const progDocs = await Program.find({ _id: { $in: resolvedPrograms.length ? resolvedPrograms : [primaryProgram] } }).lean();
    const progNames = progDocs.map((p) => p.name).filter(Boolean).join(', ');
    const ethYear = toEthiopian(new Date()).year;
    portalTitle = `${ethYear} New Student Registration on ${deliveryLabel} — ${progNames || 'All Programmes'}`;
  }

  const portalId = crypto.randomBytes(16).toString('hex');
  const parsedOpensAt = parseEATDate(opensAt, false);
  const parsedClosesAt = parseEATDate(closesAt, true);

  if (parsedOpensAt >= parsedClosesAt) {
    throw new AppError(400, 'INVALID_DATES', 'Closing date must be after opening date.');
  }

  const entryPoints = {
    degree: Number(req.body.entryPoints?.degree) || 350,
    diploma: Number(req.body.entryPoints?.diploma) || 275,
    shortTerm: Number(req.body.entryPoints?.shortTerm) || 200,
  };

  const portal = await RegistrationPortal.create({
    title: portalTitle,
    portalId,
    department: primaryDept,
    program: primaryProgram,
    batch: primaryBatch,
    departments: resolvedDepartments.length ? resolvedDepartments : [primaryDept],
    programs: resolvedPrograms.length ? resolvedPrograms : [primaryProgram],
    batches: batchIdList,
    category: autoCategory,
    opensAt: parsedOpensAt,
    closesAt: parsedClosesAt,
    tutorialVideoUrl: tutorialVideoUrl.trim(),
    instructions: instructions.trim(),
    entryPoints,
    maxApplications: Number(maxApplications) || 500,
    status: 'open',
    createdBy: req.user.id,
  });

  audit({
    req,
    action: 'registrar.registration_portal_created',
    targetType: 'RegistrationPortal',
    targetId: portal._id,
    meta: { portalId, title: portal.title },
  });

  res.status(201).json({ portal });
});

// 2. List Portals (Registrar)
export const listPortals = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (search && search.trim()) {
    filter.title = { $regex: search.trim(), $options: 'i' };
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [portals, total] = await Promise.all([
    RegistrationPortal.find(filter)
      .populate('department', 'name code')
      .populate('program', 'name code qualificationType')
      .populate('batch', 'name code category')
      .populate('departments', 'name code')
      .populate('programs', 'name code qualificationType')
      .populate('batches', 'name code category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    RegistrationPortal.countDocuments(filter),
  ]);

  const portalIds = portals.map((p) => p._id);
  const stats = await StudentApplication.aggregate([
    { $match: { portal: { $in: portalIds } } },
    {
      $group: {
        _id: '$portal',
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
      },
    },
  ]);

  const statsMap = stats.reduce((acc, curr) => {
    acc[String(curr._id)] = curr;
    return acc;
  }, {});

  const enriched = portals.map((p) => {
    const s = statsMap[String(p._id)] || {};
    const now = new Date();
    const isOpen = p.status === 'open' && now >= new Date(p.opensAt) && now <= new Date(p.closesAt);
    return {
      ...p,
      id: String(p._id),
      isOpen,
      stats: {
        total: s.total || 0,
        pending: s.pending || 0,
        approved: s.approved || 0,
        rejected: s.rejected || 0,
      },
    };
  });

  res.json({ portals: enriched, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

// 3. Get Portal Detail (Registrar)
export const getPortalDetail = asyncHandler(async (req, res) => {
  const portal = await RegistrationPortal.findById(req.params.id)
    .populate('department', 'name code')
    .populate('program', 'name code qualificationType')
    .populate('batch', 'name code category')
    .populate('departments', 'name code')
    .populate('programs', 'name code qualificationType durationYears')
    .populate('batches', 'name code category')
    .lean();

  if (!portal) throw new AppError(404, 'PORTAL_NOT_FOUND', 'Registration portal not found.');

  const [total, pending, approved, rejected] = await Promise.all([
    StudentApplication.countDocuments({ portal: portal._id }),
    StudentApplication.countDocuments({ portal: portal._id, status: 'pending' }),
    StudentApplication.countDocuments({ portal: portal._id, status: 'approved' }),
    StudentApplication.countDocuments({ portal: portal._id, status: 'rejected' }),
  ]);

  res.json({
    portal: {
      ...portal,
      id: String(portal._id),
      stats: { total, pending, approved, rejected },
    },
  });
});

// 4. Update Portal (Registrar)
export const updatePortal = asyncHandler(async (req, res) => {
  const portal = await RegistrationPortal.findById(req.params.id);
  if (!portal) throw new AppError(404, 'PORTAL_NOT_FOUND', 'Registration portal not found.');

  if (req.body.title) portal.title = req.body.title.trim();
  if (req.body.status) portal.status = req.body.status;
  if (req.body.opensAt) portal.opensAt = parseEATDate(req.body.opensAt, false);
  if (req.body.closesAt) portal.closesAt = parseEATDate(req.body.closesAt, true);
  if (req.body.tutorialVideoUrl !== undefined) portal.tutorialVideoUrl = req.body.tutorialVideoUrl.trim();
  if (req.body.instructions !== undefined) portal.instructions = req.body.instructions.trim();
  if (req.body.maxApplications) portal.maxApplications = Number(req.body.maxApplications);

  portal.updatedBy = req.user.id;
  await portal.save();

  audit({
    req,
    action: 'registrar.registration_portal_updated',
    targetType: 'RegistrationPortal',
    targetId: portal._id,
    meta: { status: portal.status },
  });

  res.json({ portal });
});

// 5. Get Public Portal Data (Public / Applicant)
export const getPublicPortal = asyncHandler(async (req, res) => {
  const { portalId } = req.params;
  const portal = await RegistrationPortal.findOne({ portalId })
    .populate('department', 'name code')
    .populate('program', 'name code qualificationType durationYears')
    .populate('batch', 'name code category')
    .populate('departments', 'name code')
    .populate('programs', 'name code qualificationType durationYears')
    .populate('batches', 'name code category')
    .lean();

  if (!portal || portal.status === 'archived') {
    throw new AppError(404, 'PORTAL_NOT_FOUND', 'This registration portal was not found or is no longer available.');
  }

  const now = new Date();
  const isOpen = portal.status === 'open' && now >= new Date(portal.opensAt) && now <= new Date(portal.closesAt);

  res.json({
    portal: {
      id: portal.portalId,
      title: portal.title,
      department: portal.department?.name || portal.department?.code,
      program: portal.program?.name || portal.program?.code,
      qualificationType: portal.program?.qualificationType || 'degree',
      category: portal.category,
      batch: portal.batch?.name || portal.batch?.code || null,
      departments: portal.departments || [],
      programs: portal.programs || [],
      batches: portal.batches || [],
      opensAt: portal.opensAt,
      closesAt: portal.closesAt,
      isOpen,
      isClosed: !isOpen,
      tutorialVideoUrl: portal.tutorialVideoUrl || '',
      instructions: portal.instructions || '',
      entryPoints: portal.entryPoints || { degree: 350, diploma: 275, shortTerm: 200 },
    },
  });
});

// 6. Submit Public Application (Public / Applicant)
export const submitPublicApplication = asyncHandler(async (req, res) => {
  const { portalId } = req.params;
  const portal = await RegistrationPortal.findOne({ portalId });
  if (!portal || portal.status !== 'open') {
    throw new AppError(403, 'PORTAL_CLOSED', 'This registration portal is currently closed for new applications.');
  }

  const now = new Date();
  if (now < new Date(portal.opensAt) || now > new Date(portal.closesAt)) {
    throw new AppError(403, 'PORTAL_CLOSED', 'This registration portal is outside of its application schedule.');
  }

  const currentCount = await StudentApplication.countDocuments({ portal: portal._id });
  if (portal.maxApplications && currentCount >= portal.maxApplications) {
    throw new AppError(403, 'CAPACITY_REACHED', 'This portal has reached its maximum quota of applications.');
  }

  const {
    firstName,
    middleName = '',
    lastName,
    gender,
    birthYear,
    birthMonth,
    birthDay,
    email,
    phone,
    address = {},
    emergencyContact = {},
    previousEducation = {},
    photo = {},
    qualificationType = 'degree',
    departmentId,
    programId,
    batchId,
    certificateDocument = {},
  } = req.body;

  if (!firstName || !lastName) {
    throw new AppError(400, 'NAME_REQUIRED', 'First name and last name are required.');
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !/^[\w.%+-]+@gmail\.com$/i.test(cleanEmail)) {
    throw new AppError(400, 'GMAIL_REQUIRED', 'A valid Google email address (@gmail.com) is required.');
  }

  const cleanPhone = normalizePhone(String(phone || ''));
  if (!isValidEthiopianPhone(cleanPhone)) {
    throw new AppError(400, 'PHONE_INVALID', 'A valid Ethiopian mobile number (+251 9... or +251 7...) is required.');
  }

  const fullName = [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');

  // Prevent duplicate pending/approved submissions: check full name + phone OR email/phone in this portal
  const duplicate = await StudentApplication.findOne({
    portal: portal._id,
    $or: [
      { fullName: new RegExp(`^${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), phone: cleanPhone },
      { email: cleanEmail },
      { phone: cleanPhone },
    ],
    status: { $in: ['pending', 'approved'] },
  });
  if (duplicate) {
    throw new AppError(409, 'ALREADY_APPLIED', 'You have already submitted an application with this name and phone number.');
  }

  // Handle Ethiopian birth date
  let dob = null;
  let ethDob = null;
  if (birthYear && birthMonth && birthDay) {
    const y = Number(birthYear);
    const m = Number(birthMonth);
    const d = Number(birthDay);
    ethDob = { year: y, month: m, day: d };
    dob = fromEthiopian(y, m, d, 12, 0, 0);
  }

  const ethYear = toEthiopian(new Date()).year;
  const count = await StudentApplication.countDocuments();
  const applicationNumber = `APP-${ethYear}-${String(count + 1).padStart(6, '0')}`;

  const application = await StudentApplication.create({
    portal: portal._id,
    applicationNumber,
    firstName: firstName.trim(),
    middleName: middleName.trim(),
    lastName: lastName.trim(),
    fullName,
    gender: gender || 'unspecified',
    dateOfBirth: dob,
    ethDateOfBirth: ethDob,
    email: cleanEmail,
    phone: cleanPhone,
    address,
    emergencyContact,
    previousEducation: {
      schoolName: previousEducation.schoolName || '',
      completionYear: previousEducation.completionYear || '',
    },
    qualificationType: qualificationType || 'degree',
    department: departmentId || portal.department,
    program: programId || portal.program,
    batch: batchId || portal.batch || (portal.batches?.[0] || null),
    certificateDocument: {
      fileName: certificateDocument.fileName || null,
      fileType: certificateDocument.fileType || null,
      fileSize: certificateDocument.fileSize || null,
      url: certificateDocument.url || null,
      uploadedAt: new Date(),
    },
    photo: {
      provider: 'imagekit',
      fileId: photo.fileId || null,
      filePath: photo.filePath || null,
      url: photo.url || null,
      thumbnailUrl: photo.thumbnailUrl || null,
      status: photo.url || photo.filePath ? 'active' : 'missing',
    },
    status: 'pending',
    ip: req.ip || '',
    userAgent: req.get('user-agent') || '',
  });

  audit({
    actorRole: 'APPLICANT',
    action: 'applicant.registered',
    targetType: 'StudentApplication',
    targetId: application._id,
    meta: { applicationNumber, email: cleanEmail, portalId: portal.portalId },
  });

  res.status(201).json({
    success: true,
    application: {
      id: String(application._id),
      applicationNumber: application.applicationNumber,
      fullName: application.fullName,
      email: application.email,
      phone: application.phone,
      status: application.status,
      createdAt: application.createdAt,
    },
    message: `Application submitted successfully! Your tracking reference is ${application.applicationNumber}.`,
  });
});

// 7. List Applications (Registrar)
export const listApplications = asyncHandler(async (req, res) => {
  const {
    portalId,
    departmentId,
    programId,
    batchId,
    status,
    search,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = {};
  if (portalId) filter.portal = portalId;
  if (status) filter.status = status;

  if (search && search.trim()) {
    const term = search.trim();
    filter.$or = [
      { applicationNumber: { $regex: term, $options: 'i' } },
      { fullName: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
    ];
  }

  // Filter by department, program, or batch (direct on application or via portal)
  const andClauses = [];
  if (departmentId) {
    const matchingPortals = await RegistrationPortal.find({
      $or: [{ department: departmentId }, { departments: departmentId }],
    }).distinct('_id');
    andClauses.push({
      $or: [{ department: departmentId }, { portal: { $in: matchingPortals } }],
    });
  }
  if (programId) {
    const matchingPortals = await RegistrationPortal.find({
      $or: [{ program: programId }, { programs: programId }],
    }).distinct('_id');
    andClauses.push({
      $or: [{ program: programId }, { portal: { $in: matchingPortals } }],
    });
  }
  if (batchId) {
    const matchingPortals = await RegistrationPortal.find({
      $or: [{ batch: batchId }, { batches: batchId }],
    }).distinct('_id');
    andClauses.push({
      $or: [{ batch: batchId }, { portal: { $in: matchingPortals } }],
    });
  }
  if (andClauses.length > 0) {
    filter.$and = andClauses;
  }

  const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
  const [applications, total] = await Promise.all([
    StudentApplication.find(filter)
      .populate({
        path: 'portal',
        populate: [
          { path: 'department', select: 'name code' },
          { path: 'program', select: 'name code qualificationType' },
          { path: 'batch', select: 'name code category' },
        ],
      })
      .populate('department', 'name code')
      .populate('program', 'name code qualificationType durationYears')
      .populate('batch', 'name code category')
      .populate('student', 'studentId fullName phone email photo department program batch')
      .populate('reviewedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    StudentApplication.countDocuments(filter),
  ]);

  res.json({
    applications: applications.map((a) => ({
      ...a,
      id: String(a._id),
    })),
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
  });
});

// 8. Get Application Detail (Registrar)
export const getApplicationDetail = asyncHandler(async (req, res) => {
  const application = await StudentApplication.findById(req.params.id)
    .populate({
      path: 'portal',
      populate: [
        { path: 'department', select: 'name code' },
        { path: 'program', select: 'name code qualificationType durationYears' },
        { path: 'batch', select: 'name code category admissionAcademicYear' },
      ],
    })
    .populate('department', 'name code')
    .populate('program', 'name code qualificationType durationYears')
    .populate('batch', 'name code category')
    .populate('reviewedBy', 'name email')
    .populate('student')
    .lean();

  if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application record not found.');

  res.json({
    application: {
      ...application,
      id: String(application._id),
    },
  });
});

// 9. Approve Application & Create Official Student (Registrar)
export const approveApplication = asyncHandler(async (req, res) => {
  const application = await StudentApplication.findById(req.params.id)
    .populate({
      path: 'portal',
      populate: [
        { path: 'department' },
        { path: 'program' },
        { path: 'batch' },
      ],
    })
    .populate('department')
    .populate('program')
    .populate('batch');

  if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application record not found.');

  // Idempotency: if already approved, return existing student
  if (application.status === 'approved' && application.student) {
    const existingStudent = await Student.findById(application.student)
      .populate('department', 'name code')
      .populate('program', 'name code')
      .populate('batch', 'name code');
    return res.json({
      application,
      student: existingStudent,
      message: 'Application has already been approved.',
    });
  }

  const portal = application.portal;
  let program = application.program || portal?.program;
  let department = application.department || portal?.department;
  let batch = application.batch || portal?.batch;

  if (!program && portal?.programs?.length > 0) {
    program = await Program.findById(portal.programs[0]);
  }
  if (!department && program?.department) {
    department = await Department.findById(program.department);
  }
  if (!batch && portal?.batches?.length > 0) {
    batch = await Batch.findById(portal.batches[0]);
  }

  if (!program || !department) {
    throw new AppError(400, 'PORTAL_INVALID', 'The target programme or department is missing.');
  }

  const category = batch?.category || portal?.category || 'regular';

  // Check if student with this email or phone already exists
  const existingEmail = await Student.findOne({ email: application.email });
  if (existingEmail) {
    throw new AppError(409, 'STUDENT_EXISTS', `A student record with email ${application.email} already exists (${existingEmail.studentId}).`);
  }

  // Generate official Student ID
  const studentId = await nextStudentId({ program, batch });

  // Get active academic year
  let academicYearId = batch?.admissionAcademicYear || null;
  if (!academicYearId) {
    const currentAy = await AcademicYear.findOne({ status: 'active' }).lean();
    academicYearId = currentAy?._id || null;
  }

  const student = await Student.create({
    studentId,
    firstName: application.firstName,
    middleName: application.middleName,
    lastName: application.lastName,
    fullName: application.fullName,
    sex: application.gender || 'unspecified',
    dateOfBirth: application.dateOfBirth,
    email: application.email,
    phone: application.phone,
    studentCategory: category,
    address: application.address,
    department: department._id,
    program: program._id,
    qualificationType: program.qualificationType || 'degree',
    batch: batch?._id ?? null,
    admissionAcademicYear: academicYearId,
    level: 1,
    enrollmentStatus: 'active',
    studentStatus: 'active',
    admissionDate: new Date(),
    photo: application.photo,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  // Create enrollment record
  if (academicYearId) {
    await Enrollment.create({
      student: student._id,
      program: program._id,
      department: department._id,
      qualificationType: program.qualificationType || 'degree',
      academicYear: academicYearId,
      batch: batch?._id ?? null,
      level: 1,
      enrollmentDate: new Date(),
      status: 'active',
      statusHistory: [{ status: 'active', by: req.user.id }],
      createdBy: req.user.id,
      updatedBy: req.user.id,
    }).catch(() => {});
  }

  // Mark application approved
  application.status = 'approved';
  application.student = student._id;
  application.generatedStudentId = student.studentId;
  application.reviewedBy = req.user.id;
  application.reviewedAt = new Date();
  application.rejectionReason = '';
  await application.save();

  // Send official admission confirmation email
  try {
    await sendStudentAdmissionEmail({
      to: student.email,
      name: student.fullName,
      studentId: student.studentId,
      program: program.name || program.code,
      department: department.name || department.code,
      batch: batch?.name || batch?.code || 'Year 1',
      category: student.studentCategory,
      admissionDate: student.admissionDate,
    });
  } catch (err) {
    // Non-blocking mail warning
  }

  audit({
    req,
    action: 'registrar.application_approved',
    targetType: 'StudentApplication',
    targetId: application._id,
    meta: {
      applicationNumber: application.applicationNumber,
      studentId: student.studentId,
      name: student.fullName,
    },
  });

  res.json({
    application,
    student,
    message: `Application approved! Student ID ${student.studentId} assigned and admission email dispatched.`,
  });
});

// 10. Reject Application (Registrar)
export const rejectApplication = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    throw new AppError(400, 'REASON_REQUIRED', 'A reason is required to reject an application.');
  }

  const application = await StudentApplication.findById(req.params.id);
  if (!application) throw new AppError(404, 'APPLICATION_NOT_FOUND', 'Application record not found.');

  if (application.status === 'approved') {
    throw new AppError(400, 'ALREADY_APPROVED', 'An approved application cannot be rejected after student registration.');
  }

  // When rejected: remove completely from the database as requested
  const appNumber = application.applicationNumber;
  await StudentApplication.findByIdAndDelete(req.params.id);

  audit({
    req,
    action: 'registrar.application_rejected_and_deleted',
    targetType: 'StudentApplication',
    targetId: req.params.id,
    meta: { applicationNumber: appNumber, reason },
  });

  res.json({
    success: true,
    message: 'Application was rejected and completely removed from the database.',
  });
});
