import { Student, Enrollment } from '../models/Student.js';
import { Program, Department, Course, AcademicYear, Batch } from '../models/AcademicStructure.js';
import { CurriculumPlan } from '../models/Curriculum.js';
import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { Result, AttendanceRecord, GradingPolicy } from '../models/Records.js';
import { GraduationEvaluation } from '../models/GraduationEvaluation.js';
import { Certificate, Transcript } from '../models/Documents.js';
import { User } from '../models/User.js';
import { audit } from '../services/audit.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { buildExport, EXPORT_LIMIT } from '../services/export.service.js';
import { mergeFilters } from '../services/registrar.helpers.js';
import { AppError } from '../utils/AppError.js';

export const reportOverview = asyncHandler(async (_req, res) => {
  const [students, enrollments, results, published, certificates, transcripts, plans, attendance] = await Promise.all([
    Student.countDocuments({ studentStatus: 'active' }),
    Enrollment.countDocuments({ status: 'active' }),
    Result.countDocuments({}),
    Result.countDocuments({ status: 'published' }),
    Certificate.countDocuments({ status: 'issued' }),
    Transcript.countDocuments({ status: 'issued' }),
    CurriculumPlan.countDocuments({ status: 'published' }),
    AttendanceRecord.countDocuments({}),
  ]);
  res.json({
    counts: { students, enrollments, results, publishedResults: published, certificates, transcripts, plans, attendance },
    reports: [
      { id: 'students', label: 'Student register', description: 'Every student with programme, level and status.', formats: ['xlsx', 'docx', 'pdf'] },
      { id: 'enrollments', label: 'Enrollment register', description: 'Active and historical enrollment records by year.', formats: ['xlsx', 'docx', 'pdf'] },
      { id: 'results', label: 'Published results', description: 'Published course results and grades.', formats: ['xlsx', 'docx', 'pdf'] },
      { id: 'graduation', label: 'Graduation eligibility', description: 'Latest eligibility decision for each evaluated student.', formats: ['xlsx', 'docx', 'pdf'] },
      { id: 'certificates', label: 'Issued certificates', description: 'Certificate numbers, students and status.', formats: ['xlsx', 'docx', 'pdf'] },
      { id: 'transcripts', label: 'Issued transcripts', description: 'Transcript references and totals.', formats: ['xlsx', 'docx', 'pdf'] },
      { id: 'curriculum', label: 'Curriculum plans', description: 'Published and draft plans with credit totals.', formats: ['xlsx', 'docx', 'pdf'] },
      { id: 'attendance', label: 'Attendance register', description: 'Attendance records submitted by teachers.', formats: ['xlsx', 'docx', 'pdf'] },
    ],
  });
});

export const exportReport = asyncHandler(async (req, res) => {
  const { type, format, academicYear, program, department, batch, category, status } = req.query;
  const report = await buildReport({ type, academicYear, program, department, batch, category, status });
  const result = await buildExport({
    format,
    filenamePrefix: `registrar-${type}`,
    title: report.title,
    subtitle: report.subtitle,
    summary: report.summary,
    note: report.note,
    columns: report.columns,
    rows: report.rows.slice(0, EXPORT_LIMIT),
  });
  audit({ req, action: 'registrar.report.export', targetType: 'Report', targetId: type, meta: { format, rows: result.rowCount } });
  res.status(200);
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Length', String(result.buffer.length));
  res.setHeader('X-Export-Rows', String(result.rowCount));
  res.setHeader('Cache-Control', 'no-store');
  res.send(result.buffer);
});

async function studentIdsForScope({ program, department }) {
  if (!program && !department) return null;
  const students = await Student.find(mergeFilters(
    department ? { department } : null,
    program ? { program } : null,
  )).select('_id').lean();
  return students.map((row) => row._id);
}

async function buildReport({ type, academicYear, program, department, batch, category, status }) {
  status = status === 'all' ? '' : String(status || '').trim();
  const year = academicYear ? await AcademicYear.findById(academicYear).lean() : null;
  const programme = program ? await Program.findById(program).lean() : null;
  const departmentRecord = department ? await Department.findById(department).lean() : null;
  const scope = [
    year?.label ? `Academic year ${year.label}` : 'All academic years',
    programme?.name,
    departmentRecord?.name,
  ].filter(Boolean).join(' · ');
  const studentFilter = mergeFilters(
    department ? { department } : null,
    program ? { program } : null,
    batch ? { batch } : null,
    category ? { studentCategory: category } : null,
    academicYear ? { admissionAcademicYear: academicYear } : null,
    status && type === 'students' ? { studentStatus: status } : null,
  );

  if (type === 'students') {
    const rows = await Student.find(studentFilter)
      .populate('program', 'code name')
      .populate('department', 'code name')
      .populate('batch', 'code')
      .populate('admissionAcademicYear', 'label')
      .sort({ fullName: 1 })
      .limit(EXPORT_LIMIT)
      .lean();
    return {
      title: 'Student register',
      subtitle: scope,
      summary: [{ label: 'Students', value: rows.length }],
      columns: [
        { header: 'Student ID', key: 'studentId', width: 18 },
        { header: 'Full name', key: 'fullName', width: 30 },
        { header: 'Sex', key: 'sex', width: 12 },
        { header: 'Programme', key: 'programme', width: 28 },
        { header: 'Department', key: 'department', width: 24 },
        { header: 'Stream', key: 'category', width: 12 },
        { header: 'Level', key: 'level', width: 10 },
        { header: 'Batch', key: 'batch', width: 16 },
        { header: 'Admission year', key: 'year', width: 18 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      rows: rows.map((row) => ({
        studentId: row.studentId,
        fullName: row.fullName,
        sex: row.sex,
        programme: row.program?.name || '',
        department: row.department?.name || '',
        category: row.studentCategory || 'regular',
        level: row.level,
        batch: row.batch?.code || '',
        year: row.admissionAcademicYear?.label || '',
        status: row.studentStatus,
      })),
    };
  }

  if (type === 'enrollments') {
    const rows = await Enrollment.find(mergeFilters(
      academicYear ? { academicYear } : null,
      program ? { program } : null,
      department ? { department } : null,
      status ? { status } : null,
    ))
      .populate('student', 'studentId fullName')
      .populate('program', 'code name')
      .populate('department', 'code name')
      .populate('academicYear', 'label')
      .populate('batch', 'code')
      .sort({ enrollmentDate: -1 })
      .limit(EXPORT_LIMIT)
      .lean();
    return {
      title: 'Enrollment register',
      subtitle: scope,
      summary: [{ label: 'Enrollments', value: rows.length }],
      columns: [
        { header: 'Student ID', key: 'studentId', width: 18 },
        { header: 'Student', key: 'student', width: 30 },
        { header: 'Programme', key: 'programme', width: 28 },
        { header: 'Department', key: 'department', width: 24 },
        { header: 'Academic year', key: 'year', width: 18 },
        { header: 'Level', key: 'level', width: 10 },
        { header: 'Batch', key: 'batch', width: 16 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Enrollment date', key: 'date', width: 18 },
      ],
      rows: rows.map((row) => ({
        studentId: row.student?.studentId || '',
        student: row.student?.fullName || '',
        programme: row.program?.name || '',
        department: row.department?.name || '',
        year: row.academicYear?.label || '',
        level: row.level,
        batch: row.batch?.code || '',
        status: row.status,
        date: row.enrollmentDate?.toISOString().slice(0, 10) || '',
      })),
    };
  }

  if (type === 'results') {
    const offeringScope = mergeFilters(
      program ? { program } : null,
      department ? { department } : null,
      academicYear ? { academicYear } : null,
    );
    const offeringIds = Object.keys(offeringScope).length
      ? (await CourseOffering.find(offeringScope).select('_id').lean()).map((row) => row._id)
      : null;
    const rows = await Result.find(mergeFilters(
      academicYear ? { academicYear } : null,
      status ? { status } : null,
      offeringIds ? { offering: { $in: offeringIds } } : null,
    ))
      .populate('student', 'studentId fullName')
      .populate('course', 'code title')
      .populate({ path: 'offering', select: 'term level academicYear program', populate: { path: 'academicYear', select: 'label' } })
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(EXPORT_LIMIT)
      .lean();
    return {
      title: 'Course results',
      subtitle: scope,
      summary: [{ label: 'Results', value: rows.length }],
      columns: [
        { header: 'Student ID', key: 'studentId', width: 18 },
        { header: 'Student', key: 'student', width: 30 },
        { header: 'Course code', key: 'code', width: 14 },
        { header: 'Course', key: 'course', width: 30 },
        { header: 'Term', key: 'term', width: 18 },
        { header: 'Mark', key: 'mark', width: 10 },
        { header: 'Grade', key: 'grade', width: 10 },
        { header: 'Points', key: 'points', width: 10 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      rows: rows.map((row) => ({
        studentId: row.student?.studentId || '',
        student: row.student?.fullName || '',
        code: row.course?.code || '',
        course: row.course?.title || '',
        term: row.term,
        mark: row.totalMark ?? '',
        grade: row.letterGrade || '',
        points: row.gradePoint ?? '',
        status: row.status,
      })),
    };
  }

  if (type === 'graduation') {
    const latest = await GraduationEvaluation.aggregate([
      { $match: mergeFilters(academicYear ? { academicYear } : null) },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$student', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      ...(status ? [{ $match: { status } }] : []),
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'studentDoc' } },
      { $unwind: '$studentDoc' },
      ...(program || department ? [{
        $match: mergeFilters(
          program ? { 'studentDoc.program': program } : null,
          department ? { 'studentDoc.department': department } : null,
        ),
      }] : []),
      { $sort: { updatedAt: -1 } },
      { $limit: EXPORT_LIMIT },
      { $lookup: { from: 'programs', localField: 'studentDoc.program', foreignField: '_id', as: 'programDoc' } },
      { $unwind: { path: '$programDoc', preserveNullAndEmptyArrays: true } },
    ]);
    return {
      title: 'Graduation eligibility',
      subtitle: scope,
      summary: [{ label: 'Students evaluated', value: latest.length }],
      columns: [
        { header: 'Student ID', key: 'studentId', width: 18 },
        { header: 'Student', key: 'student', width: 30 },
        { header: 'Programme', key: 'programme', width: 28 },
        { header: 'Credits', key: 'credits', width: 12 },
        { header: 'CGPA', key: 'cgpa', width: 10 },
        { header: 'Status', key: 'status', width: 18 },
        { header: 'Notes', key: 'reasons', width: 50 },
      ],
      rows: latest.map((row) => ({
        studentId: row.studentDoc?.studentId || '',
        student: row.studentDoc?.fullName || '',
        programme: row.programDoc?.name || '',
        credits: `${row.earnedCredits}/${row.requiredCredits}`,
        cgpa: row.cgpa ?? '',
        status: row.status,
        reasons: (row.reasons || []).join(' '),
      })),
    };
  }

  if (type === 'certificates') {
    const scopedStudentIds = await studentIdsForScope({ program, department });
    const rows = await Certificate.find(mergeFilters(
      academicYear ? { academicYear } : null,
      status ? { status } : null,
      scopedStudentIds ? { student: { $in: scopedStudentIds } } : null,
    ))
      .sort({ issuedAt: -1 })
      .limit(EXPORT_LIMIT)
      .lean();
    return {
      title: 'Issued certificates',
      subtitle: scope,
      summary: [{ label: 'Certificates', value: rows.length }],
      columns: [
        { header: 'Certificate number', key: 'number', width: 22 },
        { header: 'Student ID', key: 'studentId', width: 18 },
        { header: 'Student', key: 'student', width: 30 },
        { header: 'Programme', key: 'programme', width: 28 },
        { header: 'Qualification', key: 'qualification', width: 16 },
        { header: 'CGPA', key: 'cgpa', width: 10 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Issued', key: 'issued', width: 18 },
      ],
      rows: rows.map((row) => ({
        number: row.certificateNumber,
        studentId: row.studentSnapshot?.studentId || '',
        student: row.studentSnapshot?.fullName || '',
        programme: row.programSnapshot?.name || '',
        qualification: row.programSnapshot?.qualificationType || '',
        cgpa: row.cgpa ?? '',
        status: row.status,
        issued: row.issuedAt?.toISOString().slice(0, 10) || '',
      })),
    };
  }

  if (type === 'transcripts') {
    const scopedStudentIds = await studentIdsForScope({ program, department });
    const rows = await Transcript.find(mergeFilters(
      status ? { status } : null,
      scopedStudentIds ? { student: { $in: scopedStudentIds } } : null,
    ))
      .sort({ issuedAt: -1 })
      .limit(EXPORT_LIMIT)
      .lean();
    return {
      title: 'Issued transcripts',
      subtitle: 'All academic years',
      summary: [{ label: 'Transcripts', value: rows.length }],
      columns: [
        { header: 'Verification ID', key: 'verification', width: 30 },
        { header: 'Student ID', key: 'studentId', width: 18 },
        { header: 'Student', key: 'student', width: 30 },
        { header: 'Programme', key: 'programme', width: 28 },
        { header: 'Credits', key: 'credits', width: 12 },
        { header: 'CGPA', key: 'cgpa', width: 10 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Issued', key: 'issued', width: 18 },
      ],
      rows: rows.map((row) => ({
        verification: row.verificationId,
        studentId: row.studentSnapshot?.studentId || '',
        student: row.studentSnapshot?.fullName || '',
        programme: row.programSnapshot?.name || '',
        credits: row.totalCredits ?? '',
        cgpa: row.cgpa ?? '',
        status: row.status,
        issued: row.issuedAt?.toISOString().slice(0, 10) || '',
      })),
    };
  }

  if (type === 'curriculum') {
    const rows = await CurriculumPlan.find(mergeFilters(academicYear ? { academicYear } : null, program ? { program } : null, status ? { status } : null))
      .populate('program', 'code name')
      .populate('department', 'code name')
      .populate('academicYear', 'label')
      .sort({ createdAt: -1 })
      .limit(EXPORT_LIMIT)
      .lean();
    return {
      title: 'Curriculum plans',
      subtitle: scope,
      summary: [{ label: 'Plans', value: rows.length }],
      columns: [
        { header: 'Programme', key: 'programme', width: 28 },
        { header: 'Department', key: 'department', width: 24 },
        { header: 'Academic year', key: 'year', width: 18 },
        { header: 'Version', key: 'version', width: 10 },
        { header: 'Title', key: 'title', width: 36 },
        { header: 'Credits', key: 'credits', width: 10 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      rows: rows.map((row) => ({
        programme: row.program?.name || '',
        department: row.department?.name || '',
        year: row.academicYear?.label || '',
        version: row.version,
        title: row.title,
        credits: row.totalCredits,
        status: row.status,
      })),
    };
  }

  if (type === 'attendance' || type.includes('attend') || type.includes('absence')) {
    const offeringFilter = mergeFilters(
      academicYear ? { academicYear } : null,
      program ? { program } : null,
      department ? { department } : null,
    );
    const offeringIds = Object.keys(offeringFilter).length
      ? (await CourseOffering.find(offeringFilter).select('_id').limit(5000).lean()).map((row) => row._id)
      : null;
    const rows = await AttendanceRecord.find(mergeFilters(offeringIds ? { offering: { $in: offeringIds } } : null, status ? { status } : null))
      .populate('student', 'studentId fullName')
      .populate({ path: 'offering', populate: [{ path: 'course', select: 'code title' }, { path: 'academicYear', select: 'label' }] })
      .sort({ date: -1 })
      .limit(EXPORT_LIMIT)
      .lean();
    return {
      title: type.includes('monthly') ? 'Monthly Attendance Summary' : type.includes('absence') ? 'Student Absence Report' : 'Attendance register',
      subtitle: scope,
      summary: [{ label: 'Records', value: rows.length }],
      columns: [
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Student ID', key: 'studentId', width: 18 },
        { header: 'Student', key: 'student', width: 28 },
        { header: 'Course code', key: 'code', width: 14 },
        { header: 'Course', key: 'course', width: 30 },
        { header: 'Term', key: 'term', width: 16 },
        { header: 'Status', key: 'status', width: 12 },
      ],
      rows: rows.map((row) => ({
        date: row.date?.toISOString().slice(0, 10) || '',
        studentId: row.student?.studentId || '',
        student: row.student?.fullName || '',
        code: row.offering?.course?.code || '',
        course: row.offering?.course?.title || '',
        term: row.offering?.term || '',
        status: row.status,
      })),
    };
  }

  // Teacher reports handler
  if (type.includes('teacher') || type.includes('workload') || type.includes('teaching')) {
    const offerings = await CourseOffering.find(mergeFilters(
      academicYear ? { academicYear } : null,
      program ? { program } : null,
      department ? { department } : null,
    ))
      .populate('teacher', 'name email role')
      .populate('course', 'code title creditHours')
      .populate('program', 'code name')
      .populate('department', 'code name')
      .populate('batch', 'code')
      .limit(EXPORT_LIMIT)
      .lean();

    return {
      title: 'Teacher Workload & Assignment Report',
      subtitle: scope,
      summary: [{ label: 'Course Assignments', value: offerings.length }],
      columns: [
        { header: 'Teacher Name', key: 'teacher', width: 26 },
        { header: 'Department', key: 'department', width: 22 },
        { header: 'Programme', key: 'program', width: 22 },
        { header: 'Course Code', key: 'code', width: 14 },
        { header: 'Course Title', key: 'title', width: 30 },
        { header: 'Credit Hours', key: 'credits', width: 12 },
        { header: 'Batch', key: 'batch', width: 16 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      rows: offerings.map((o) => ({
        teacher: o.teacher?.name || 'Unassigned',
        department: o.department?.name || '',
        program: o.program?.name || '',
        code: o.course?.code || '',
        title: o.course?.title || '',
        credits: o.creditHours || o.course?.creditHours || 3,
        batch: o.batch?.code || '',
        status: o.status,
      })),
    };
  }

  // Department / Programme Summary Report
  if (type.includes('dept') || type.includes('programme') || type.includes('coverage') || type.includes('ratio')) {
    const programs = await Program.find(department ? { department } : {})
      .populate('department', 'code name')
      .limit(EXPORT_LIMIT)
      .lean();

    return {
      title: 'Department and Programme Summary Report',
      subtitle: scope,
      summary: [{ label: 'Active Programmes', value: programs.length }],
      columns: [
        { header: 'Department Code', key: 'deptCode', width: 16 },
        { header: 'Department Name', key: 'deptName', width: 28 },
        { header: 'Programme Code', key: 'progCode', width: 16 },
        { header: 'Programme Name', key: 'progName', width: 30 },
        { header: 'Qualification', key: 'type', width: 16 },
        { header: 'Status', key: 'status', width: 12 },
      ],
      rows: programs.map((p) => ({
        deptCode: p.department?.code || '',
        deptName: p.department?.name || '',
        progCode: p.code,
        progName: p.name,
        type: p.qualificationType,
        status: p.active ? 'Active' : 'Inactive',
      })),
    };
  }

  // Results & Examination fallback
  if (type.includes('result') || type.includes('mark') || type.includes('exam') || type.includes('grade') || type.includes('gpa') || type.includes('pass')) {
    const rows = await Result.find(mergeFilters(academicYear ? { academicYear } : null))
      .populate('student', 'studentId fullName')
      .populate('course', 'code title')
      .sort({ createdAt: -1 })
      .limit(EXPORT_LIMIT)
      .lean();
    return {
      title: 'Examination and Results Performance Report',
      subtitle: scope,
      summary: [{ label: 'Results Count', value: rows.length }],
      columns: [
        { header: 'Student ID', key: 'studentId', width: 18 },
        { header: 'Student', key: 'student', width: 30 },
        { header: 'Course code', key: 'code', width: 14 },
        { header: 'Course', key: 'course', width: 30 },
        { header: 'Total Mark', key: 'mark', width: 12 },
        { header: 'Grade', key: 'grade', width: 10 },
        { header: 'Points', key: 'points', width: 10 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      rows: rows.map((row) => ({
        studentId: row.student?.studentId || '',
        student: row.student?.fullName || '',
        code: row.course?.code || '',
        course: row.course?.title || '',
        mark: row.totalMark ?? '',
        grade: row.letterGrade || '',
        points: row.gradePoint ?? '',
        status: row.status,
      })),
    };
  }

  // Fallback to Student records
  const fallbackStudents = await Student.find(studentFilter)
    .populate('program', 'code name')
    .populate('department', 'code name')
    .populate('batch', 'code')
    .populate('admissionAcademicYear', 'label')
    .sort({ fullName: 1 })
    .limit(EXPORT_LIMIT)
    .lean();

  return {
    title: 'Student and Academic Report',
    subtitle: scope,
    summary: [{ label: 'Records', value: fallbackStudents.length }],
    columns: [
      { header: 'Student ID', key: 'studentId', width: 18 },
      { header: 'Full name', key: 'fullName', width: 30 },
      { header: 'Sex', key: 'sex', width: 12 },
      { header: 'Programme', key: 'programme', width: 28 },
      { header: 'Department', key: 'department', width: 24 },
      { header: 'Stream', key: 'category', width: 12 },
      { header: 'Level', key: 'level', width: 10 },
      { header: 'Status', key: 'status', width: 14 },
    ],
    rows: fallbackStudents.map((row) => ({
      studentId: row.studentId,
      fullName: row.fullName,
      sex: row.sex,
      programme: row.program?.name || '',
      department: row.department?.name || '',
      category: row.studentCategory || 'regular',
      level: row.level,
      status: row.studentStatus,
    })),
  };
}

export async function computeAcademicAnalytics(query = {}) {
  const {
    academicYear,
    reportType = 'yearly',
    month,
    batch,
    studyMode = 'all',
    department,
    program,
    qualification = 'all',
    level,
  } = query;

  // 1. Resolve Academic Year
  let yearDoc = null;
  if (academicYear) {
    yearDoc = await AcademicYear.findById(academicYear).lean();
  }
  if (!yearDoc) {
    yearDoc = (await AcademicYear.findOne({ status: 'active' }).lean()) || (await AcademicYear.findOne().sort({ startDate: -1 }).lean());
  }
  const yearId = yearDoc?._id;

  // 2. Resolve Department & Program & Batch & GradingPolicy
  const [deptDoc, progDoc, batchDoc, gradingPolicy] = await Promise.all([
    department ? Department.findById(department).lean() : null,
    program ? Program.findById(program).lean() : null,
    batch ? Batch.findById(batch).lean() : null,
    GradingPolicy.findOne({ key: 'global' }).lean(),
  ]);

  // 3. Build Offerings Filter
  const offFilter = {};
  if (yearId) offFilter.academicYear = yearId;
  if (deptDoc) offFilter.department = deptDoc._id;
  if (progDoc) offFilter.program = progDoc._id;
  if (batchDoc) offFilter.batch = batchDoc._id;
  if (level) offFilter.level = Number(level);

  if (studyMode && studyMode !== 'all') {
    const modeBatches = await Batch.find({ category: studyMode }).select('_id').lean();
    offFilter.batch = { $in: modeBatches.map((b) => b._id) };
  }
  if (qualification && qualification !== 'all') {
    const qualProgs = await Program.find({ qualificationType: qualification }).select('_id').lean();
    offFilter.program = { $in: qualProgs.map((p) => p._id) };
  }

  // Load all matching CourseOfferings
  const offerings = await CourseOffering.find(offFilter)
    .populate('course', 'code title creditHours')
    .populate('program', 'code name qualificationType durationYears levels')
    .populate('department', 'code name')
    .populate('batch', 'code name category')
    .populate('teacher', 'fullName email')
    .lean();

  const offeringIds = offerings.map((o) => o._id);

  // 4. Distinct Enrolled Students from CourseRegistrations
  const registrations = await CourseRegistration.find({
    offering: { $in: offeringIds },
    status: 'registered',
  }).select('student offering').lean();

  const distinctStudentIds = new Set(registrations.map((r) => String(r.student)));
  const totalEnrolledStudents = distinctStudentIds.size;
  const totalCoursesOffered = offerings.length;

  // 5. Attendance Analysis
  let attDateFilter = {};
  if (month) {
    const m = Number(month) - 1;
    const yearNumber = yearDoc?.startDate ? new Date(yearDoc.startDate).getFullYear() : 2019;
    const startOfMonth = new Date(yearNumber, m, 1);
    const endOfMonth = new Date(yearNumber, m + 1, 0, 23, 59, 59, 999);
    attDateFilter = { date: { $gte: startOfMonth, $lte: endOfMonth } };
  }

  const attendanceRecords = await AttendanceRecord.find({
    offering: { $in: offeringIds },
    ...attDateFilter,
  }).select('offering student date status').lean();

  let presentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let absentCount = 0;

  for (const r of attendanceRecords) {
    if (r.status === 'present') presentCount++;
    else if (r.status === 'late') lateCount++;
    else if (r.status === 'excused') excusedCount++;
    else if (r.status === 'absent') absentCount++;
  }

  const totalAttendanceRecorded = attendanceRecords.length;
  const attendedCount = presentCount + lateCount + excusedCount;
  const attendanceRate = totalAttendanceRecorded > 0
    ? Number(((attendedCount / totalAttendanceRecorded) * 100).toFixed(1))
    : 0;

  // 6. Results & Marks Analysis
  const results = await Result.find({
    offering: { $in: offeringIds },
  }).select('offering student course totalMark letterGrade gradePoint passed status creditHours createdAt submittedAt').lean();

  let totalMarksSum = 0;
  let marksCount = 0;
  let passedCount = 0;
  let finalizedCount = 0;

  const resultStatusCounts = {
    draft: 0,
    submitted: 0,
    under_review: 0,
    approved: 0,
    published: 0,
    rejected: 0,
  };

  const gradeCountMap = new Map();
  if (gradingPolicy?.bands?.length) {
    for (const b of gradingPolicy.bands) {
      gradeCountMap.set(b.letter, 0);
    }
  } else {
    ['A', 'B', 'C', 'D', 'F'].forEach((l) => gradeCountMap.set(l, 0));
  }

  for (const res of results) {
    const st = res.status || 'draft';
    if (resultStatusCounts[st] !== undefined) {
      resultStatusCounts[st]++;
    }

    if (res.totalMark != null && ['submitted', 'approved', 'published'].includes(res.status)) {
      totalMarksSum += res.totalMark;
      marksCount++;
      finalizedCount++;
      if (res.passed) passedCount++;

      if (res.letterGrade && gradeCountMap.has(res.letterGrade)) {
        gradeCountMap.set(res.letterGrade, gradeCountMap.get(res.letterGrade) + 1);
      }
    }
  }

  const averageAcademicPerformance = marksCount > 0
    ? Number((totalMarksSum / marksCount).toFixed(1))
    : 0;
  const passRate = finalizedCount > 0
    ? Number(((passedCount / finalizedCount) * 100).toFixed(1))
    : 0;

  const completedCourses = offerings.filter((o) => o.status === 'completed').length;
  const publishedOrSubmittedOfferings = offerings.filter((o) => ['completed', 'published', 'submitted'].includes(o.status)).length;
  const resultsSubmissionProgress = totalCoursesOffered > 0
    ? Number(((publishedOrSubmittedOfferings / totalCoursesOffered) * 100).toFixed(1))
    : 0;

  // 7. Monthly Trends across Calendar (Months 1–12)
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthlyMap = new Map();
  for (let i = 0; i < 12; i++) {
    monthlyMap.set(i, {
      monthNum: i + 1,
      month: MONTH_NAMES[i],
      present: 0,
      totalAtt: 0,
      marksSum: 0,
      marksCount: 0,
      students: new Set(),
      submissions: 0,
    });
  }

  for (const r of attendanceRecords) {
    const d = new Date(r.date);
    const m = d.getMonth();
    const entry = monthlyMap.get(m);
    if (entry) {
      entry.totalAtt++;
      if (['present', 'late', 'excused'].includes(r.status)) entry.present++;
      entry.students.add(String(r.student));
    }
  }

  for (const res of results) {
    const d = new Date(res.submittedAt || res.createdAt);
    const m = d.getMonth();
    const entry = monthlyMap.get(m);
    if (entry) {
      entry.submissions++;
      if (res.totalMark != null) {
        entry.marksSum += res.totalMark;
        entry.marksCount++;
      }
    }
  }

  const monthlyTrend = Array.from(monthlyMap.values()).map((e) => ({
    month: e.month,
    monthNum: e.monthNum,
    attendanceRate: e.totalAtt > 0 ? Number(((e.present / e.totalAtt) * 100).toFixed(1)) : 0,
    averageScore: e.marksCount > 0 ? Number((e.marksSum / e.marksCount).toFixed(1)) : 0,
    activeStudents: e.students.size,
    submissionsCount: e.submissions,
  }));

  // 8. Department Comparison
  const depts = await Department.find({ active: true }).lean();
  const departmentComparison = [];
  for (const d of depts) {
    const deptOffs = offerings.filter((o) => String(o.department?._id || o.department) === String(d._id));
    const deptOffIds = new Set(deptOffs.map((o) => String(o._id)));
    const deptRegs = registrations.filter((r) => deptOffIds.has(String(r.offering)));
    const deptStudents = new Set(deptRegs.map((r) => String(r.student))).size;

    const deptAtt = attendanceRecords.filter((a) => deptOffIds.has(String(a.offering)));
    const deptAttended = deptAtt.filter((a) => ['present', 'late', 'excused'].includes(a.status)).length;
    const deptAttRate = deptAtt.length > 0 ? Number(((deptAttended / deptAtt.length) * 100).toFixed(1)) : 0;

    const deptRes = results.filter((r) => deptOffIds.has(String(r.offering)) && r.totalMark != null);
    const deptMarkAvg = deptRes.length > 0 ? Number((deptRes.reduce((s, r) => s + r.totalMark, 0) / deptRes.length).toFixed(1)) : 0;
    const deptPassCount = deptRes.filter((r) => r.passed).length;
    const deptPassRate = deptRes.length > 0 ? Number(((deptPassCount / deptRes.length) * 100).toFixed(1)) : 0;

    departmentComparison.push({
      id: String(d._id),
      name: d.name,
      code: d.code,
      enrolledStudents: deptStudents,
      coursesOffered: deptOffs.length,
      attendanceRate: deptAttRate,
      averageMark: deptMarkAvg,
      passRate: deptPassRate,
      completedCourses: deptOffs.filter((o) => o.status === 'completed').length,
    });
  }

  // 9. Programme Comparison
  const progs = await Program.find({ active: true }).populate('department', 'name').lean();
  const programComparison = [];
  for (const p of progs) {
    const progOffs = offerings.filter((o) => String(o.program?._id || o.program) === String(p._id));
    const progOffIds = new Set(progOffs.map((o) => String(o._id)));
    const progRegs = registrations.filter((r) => progOffIds.has(String(r.offering)));
    const progStudents = new Set(progRegs.map((r) => String(r.student))).size;

    const progAtt = attendanceRecords.filter((a) => progOffIds.has(String(a.offering)));
    const progAttended = progAtt.filter((a) => ['present', 'late', 'excused'].includes(a.status)).length;
    const progAttRate = progAtt.length > 0 ? Number(((progAttended / progAtt.length) * 100).toFixed(1)) : 0;

    const progRes = results.filter((r) => progOffIds.has(String(r.offering)) && r.totalMark != null);
    const progMarkAvg = progRes.length > 0 ? Number((progRes.reduce((s, r) => s + r.totalMark, 0) / progRes.length).toFixed(1)) : 0;
    const progPassCount = progRes.filter((r) => r.passed).length;
    const progPassRate = progRes.length > 0 ? Number(((progPassCount / progRes.length) * 100).toFixed(1)) : 0;

    programComparison.push({
      id: String(p._id),
      name: p.name,
      code: p.code,
      departmentName: p.department?.name || 'Department',
      qualification: p.qualificationType,
      durationUnit: p.qualificationType === 'degree' ? 'Year' : p.qualificationType === 'diploma' ? 'Level' : 'Month',
      enrolledStudents: progStudents,
      coursesOffered: progOffs.length,
      attendanceRate: progAttRate,
      averageMark: progMarkAvg,
      passRate: progPassRate,
    });
  }

  // 10. Study Mode Comparison (Regular vs Extension)
  const studyModeComparison = [
    { mode: 'regular', label: 'Regular Stream' },
    { mode: 'extension', label: 'Extension Stream' },
  ].map(({ mode, label }) => {
    const modeOffs = offerings.filter((o) => (o.batch?.category || 'regular') === mode);
    const modeOffIds = new Set(modeOffs.map((o) => String(o._id)));
    const modeRegs = registrations.filter((r) => modeOffIds.has(String(r.offering)));
    const modeStudents = new Set(modeRegs.map((r) => String(r.student))).size;

    const modeAtt = attendanceRecords.filter((a) => modeOffIds.has(String(a.offering)));
    const modeAttended = modeAtt.filter((a) => ['present', 'late', 'excused'].includes(a.status)).length;
    const modeAttRate = modeAtt.length > 0 ? Number(((modeAttended / modeAtt.length) * 100).toFixed(1)) : 0;

    const modeRes = results.filter((r) => modeOffIds.has(String(r.offering)) && r.totalMark != null);
    const modeMarkAvg = modeRes.length > 0 ? Number((modeRes.reduce((s, r) => s + r.totalMark, 0) / modeRes.length).toFixed(1)) : 0;
    const modePassCount = modeRes.filter((r) => r.passed).length;
    const modePassRate = modeRes.length > 0 ? Number(((modePassCount / modeRes.length) * 100).toFixed(1)) : 0;

    return {
      mode,
      label,
      enrolledStudents: modeStudents,
      coursesOffered: modeOffs.length,
      attendanceRate: modeAttRate,
      averageMark: modeMarkAvg,
      passRate: modePassRate,
    };
  });

  // 11. Grade Distribution Array
  const gradeDistribution = Array.from(gradeCountMap.entries()).map(([letter, count]) => ({
    letter,
    count,
    percentage: finalizedCount > 0 ? Number(((count / finalizedCount) * 100).toFixed(1)) : 0,
  }));

  // 12. Course Breakdown Table (Aggregated per course offering - strictly NO individual student names/IDs!)
  const courseTable = offerings.map((o) => {
    const oId = String(o._id);
    const courseRegs = registrations.filter((r) => String(r.offering) === oId);
    const courseStudents = new Set(courseRegs.map((r) => String(r.student))).size;

    const courseAtt = attendanceRecords.filter((a) => String(a.offering) === oId);
    const courseAttended = courseAtt.filter((a) => ['present', 'late', 'excused'].includes(a.status)).length;
    const courseAttRate = courseAtt.length > 0 ? Number(((courseAttended / courseAtt.length) * 100).toFixed(1)) : 0;

    const courseRes = results.filter((r) => String(r.offering) === oId && r.totalMark != null);
    const courseMarkAvg = courseRes.length > 0 ? Number((courseRes.reduce((s, r) => s + r.totalMark, 0) / courseRes.length).toFixed(1)) : 0;
    const coursePassed = courseRes.filter((r) => r.passed).length;
    const courseFailed = courseRes.length - coursePassed;
    const coursePassRate = courseRes.length > 0 ? Number(((coursePassed / courseRes.length) * 100).toFixed(1)) : 0;

    let subStatus = 'Draft';
    if (o.status === 'completed' || courseRes.some((r) => r.status === 'published')) subStatus = 'Published';
    else if (courseRes.some((r) => r.status === 'approved')) subStatus = 'Approved';
    else if (courseRes.some((r) => r.status === 'submitted')) subStatus = 'Submitted';
    else if (courseRes.some((r) => r.status === 'under_review')) subStatus = 'Under Review';

    return {
      offeringId: oId,
      courseCode: o.course?.code || '—',
      courseTitle: o.course?.title || '—',
      creditHours: o.course?.creditHours || 3,
      programName: o.program?.name || '—',
      departmentName: o.department?.name || '—',
      level: o.level || 1,
      batchCode: o.batch?.code || '2019',
      studyMode: (o.batch?.category || 'regular').toUpperCase(),
      teacherName: o.teacher?.fullName || 'Not assigned',
      enrolledCount: courseStudents,
      attendanceRate: courseAttRate,
      averageMark: courseMarkAvg,
      passedCount: coursePassed,
      failedCount: courseFailed,
      passRate: coursePassRate,
      submissionStatus: subStatus,
      isCompleted: o.status === 'completed',
    };
  });

  // 13. Result Workflow Items (Awaiting submission, submitted, approved, published)
  const workflowItems = offerings.map((o) => {
    const oId = String(o._id);
    const courseRes = results.filter((r) => String(r.offering) === oId);
    const courseRegs = registrations.filter((r) => String(r.offering) === oId);
    const hasPublished = courseRes.some((r) => r.status === 'published');
    const hasApproved = courseRes.some((r) => r.status === 'approved');
    const hasSubmitted = courseRes.some((r) => r.status === 'submitted');
    const hasRejected = courseRes.some((r) => r.status === 'rejected');
    const hasUnderReview = courseRes.some((r) => r.status === 'under_review');

    let stage = 'draft';
    let outstandingAction = 'Teacher Mark Submission Pending';
    if (hasPublished) {
      stage = 'published';
      outstandingAction = 'Fully Published';
    } else if (hasApproved) {
      stage = 'approved';
      outstandingAction = 'Approved · Ready to Publish';
    } else if (hasSubmitted || hasUnderReview) {
      stage = 'submitted';
      outstandingAction = 'Awaiting Registrar Approval';
    } else if (hasRejected) {
      stage = 'rejected';
      outstandingAction = 'Rejected · Needs Revision';
    }

    return {
      offeringId: oId,
      courseCode: o.course?.code || '—',
      courseTitle: o.course?.title || '—',
      departmentName: o.department?.name || '—',
      programName: o.program?.name || '—',
      batchCode: o.batch?.code || '—',
      level: o.level || 1,
      teacherName: o.teacher?.fullName || 'Unassigned',
      enrolledCount: courseRegs.length,
      marksCount: courseRes.length,
      status: stage,
      outstandingAction,
      actionUrl: '/registrar/results',
    };
  });

  return {
    scope: {
      academicYearId: yearDoc?._id,
      academicYearLabel: yearDoc?.label || 'Academic Year 2019',
      reportingPeriod: month ? `${MONTH_NAMES[Number(month) - 1]} ${yearDoc?.label || '2019'}` : `Full Year · ${yearDoc?.label || '2019'}`,
      departmentName: deptDoc?.name || 'All Departments',
      programName: progDoc?.name || 'All Programmes',
      batchCode: batchDoc?.code || 'All Batches',
      studyMode: studyMode === 'all' ? 'All Study Modes' : studyMode.toUpperCase(),
      generatedAt: new Date(),
    },
    summary: {
      totalEnrolledStudents,
      totalCoursesOffered,
      attendanceRate,
      totalAttendanceRecorded,
      presentAttendance: attendedCount,
      absentAttendance: absentCount,
      averageAcademicPerformance,
      passRate,
      completedCourses,
      resultsSubmissionProgress,
      totalResults: results.length,
      publishedResults: resultStatusCounts.published,
      submittedResults: resultStatusCounts.submitted,
      approvedResults: resultStatusCounts.approved,
      pendingResults: resultStatusCounts.draft + resultStatusCounts.under_review,
    },
    monthlyTrend,
    departmentComparison,
    programComparison,
    studyModeComparison,
    gradeDistribution,
    courseTable,
    resultWorkflow: {
      counts: resultStatusCounts,
      items: workflowItems,
    },
  };
}

export const getAcademicAnalyticsReport = asyncHandler(async (req, res) => {
  const data = await computeAcademicAnalytics(req.query);
  audit({ req, action: 'registrar.report.view', targetType: 'AcademicReport', targetId: 'academic-analytics' });
  res.json(data);
});

export const exportAcademicReport = asyncHandler(async (req, res) => {
  const analytics = await computeAcademicAnalytics(req.query);
  const format = req.query.format === 'pdf' ? 'pdf' : 'xlsx';

  const title = `Academic Performance Report · ${analytics.scope.reportingPeriod}`;
  const subtitle = `${analytics.scope.departmentName} · ${analytics.scope.programName} · ${analytics.scope.studyMode}`;

  const summary = [
    { label: 'Distinct Enrolled Students', value: analytics.summary.totalEnrolledStudents },
    { label: 'Courses Offered', value: analytics.summary.totalCoursesOffered },
    { label: 'Attendance Rate', value: `${analytics.summary.attendanceRate}%` },
    { label: 'Average Score', value: `${analytics.summary.averageAcademicPerformance} / 100` },
    { label: 'Pass Rate', value: `${analytics.summary.passRate}%` },
    { label: 'Results Submission Progress', value: `${analytics.summary.resultsSubmissionProgress}%` },
  ];

  const columns = [
    { header: 'Course Code', key: 'courseCode', width: 14 },
    { header: 'Course Title', key: 'courseTitle', width: 32 },
    { header: 'Programme', key: 'programName', width: 26 },
    { header: 'Department', key: 'departmentName', width: 22 },
    { header: 'Level', key: 'level', width: 8 },
    { header: 'Mode', key: 'studyMode', width: 12 },
    { header: 'Enrolled', key: 'enrolledCount', width: 10 },
    { header: 'Attendance %', key: 'attendanceRate', width: 14 },
    { header: 'Avg Mark', key: 'averageMark', width: 12 },
    { header: 'Pass %', key: 'passRate', width: 12 },
    { header: 'Status', key: 'submissionStatus', width: 14 },
  ];

  const rows = analytics.courseTable.map((c) => ({
    courseCode: c.courseCode,
    courseTitle: c.courseTitle,
    programName: c.programName,
    departmentName: c.departmentName,
    level: `Year ${c.level}`,
    studyMode: c.studyMode,
    enrolledCount: c.enrolledCount,
    attendanceRate: `${c.attendanceRate}%`,
    averageMark: c.averageMark,
    passRate: `${c.passRate}%`,
    submissionStatus: c.submissionStatus,
  }));

  const result = await buildExport({
    format,
    filenamePrefix: `academic-report-${analytics.scope.reportingPeriod.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    title,
    subtitle,
    summary,
    note: 'Official institutional academic performance report. Generated dynamically from verified college database records.',
    columns,
    rows,
  });

  audit({ req, action: 'registrar.report.export', targetType: 'AcademicReport', targetId: 'academic-analytics', meta: { format, rows: rows.length } });
  res.status(200);
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Length', String(result.buffer.length));
  res.setHeader('Cache-Control', 'no-store');
  res.send(result.buffer);
});

