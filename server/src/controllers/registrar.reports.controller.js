import { Student, Enrollment } from '../models/Student.js';
import { Program, Department, Course, AcademicYear } from '../models/AcademicStructure.js';
import { CurriculumPlan } from '../models/Curriculum.js';
import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { Result, AttendanceRecord } from '../models/Records.js';
import { GraduationEvaluation } from '../models/GraduationEvaluation.js';
import { Certificate, Transcript } from '../models/Documents.js';
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
