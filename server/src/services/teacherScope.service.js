import mongoose from 'mongoose';
import { CourseOffering } from '../models/Offering.js';
import { CourseRegistration } from '../models/Offering.js';
import { Assessment } from '../models/Assessment.js';
import { Material } from '../models/Material.js';
import { AppError } from '../utils/AppError.js';
import { ownFilter } from './registrar.helpers.js';
import { activeProgramIdsForTeacher, teacherOfferingFilter } from './teacherAccess.service.js';
import { signedImageUrl } from './imagekit.service.js';

function photoView(photo) {
  if (!photo) return null;
  const usable = photo.status !== 'missing';
  const url = usable && photo.filePath ? signedImageUrl(photo.filePath, { expiresIn: 3600 }) : usable ? photo.url : null;
  const thumbnailUrl = usable
    ? photo.filePath
      ? signedImageUrl(photo.filePath, {
          transformation: [{ width: 160, height: 160, cropMode: 'extract' }],
          expiresIn: 3600,
        })
      : photo.thumbnailUrl || url
    : null;
  return { ...photo, url, thumbnailUrl: thumbnailUrl || url };
}

export const TZ = 'Africa/Addis_Ababa';
export const READ_STATUSES = ['open', 'in_progress', 'completed'];
export const WRITE_STATUSES = ['open', 'in_progress'];

export const ASSIGNMENT_POPULATE = [
  { path: 'course', select: 'code title creditHours description active department' },
  { path: 'academicYear', select: 'label isCurrent status startDate endDate' },
  { path: 'program', select: 'code name qualificationType' },
  { path: 'department', select: 'code name' },
  { path: 'batch', select: 'code name category admissionAcademicYear currentLevel status' },
];

export const STUDENT_POPULATE = {
  path: 'student',
  select:
    'studentId firstName middleName lastName sex level email phone studentStatus enrollmentStatus studentCategory program batch department admissionDate photo',
  populate: [
    { path: 'program', select: 'code name qualificationType' },
    { path: 'batch', select: 'code name category currentLevel status' },
    { path: 'department', select: 'code name' },
  ],
};

export const dayKey = (input = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(input));

// A calendar day is stored with a canonical Addis Ababa key and a UTC instant at
// 00:00 +03:00. Comparing the formatted key catches impossible dates such as 2026-02-30
// that JavaScript would otherwise silently roll into March.
export function dateFromKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) {
    throw new AppError(400, 'BAD_DATE', 'Use a date in the form YYYY-MM-DD.');
  }
  const date = new Date(`${key}T00:00:00+03:00`);
  if (Number.isNaN(date.getTime()) || dayKey(date) !== key) {
    throw new AppError(400, 'BAD_DATE', 'That calendar date does not exist.');
  }
  return date;
}

export const objectId = (value) => new mongoose.Types.ObjectId(String(value));

export async function assignmentIdsForTeacher(teacherId, { includeCompleted = true } = {}) {
  const statuses = includeCompleted ? READ_STATUSES : WRITE_STATUSES;
  const rows = await CourseOffering.find(ownFilter({ teacher: teacherId, status: { $in: statuses } }))
    .select('_id')
    .lean();
  return rows.map((row) => row._id);
}

export async function readAssignmentIdsForTeacher(teacherId, { includeCompleted = true } = {}) {
  const statuses = includeCompleted ? READ_STATUSES : WRITE_STATUSES;
  const access = await teacherOfferingFilter(teacherId);
  const rows = await CourseOffering.find(
    ownFilter({ $and: [access, { status: { $in: statuses } }] }),
  )
    .select('_id')
    .lean();
  return rows.map((row) => row._id);
}

export async function assignmentForTeacherRead(teacherId, assignmentId, { populate = true } = {}) {
  const access = await teacherOfferingFilter(teacherId);
  let query = CourseOffering.findOne(
    ownFilter({
      $and: [access, { _id: assignmentId, status: { $in: READ_STATUSES } }],
    }),
  );
  if (populate) query = query.populate(ASSIGNMENT_POPULATE);
  const assignment = await query.lean();
  if (!assignment) {
    throw new AppError(404, 'CLASS_NOT_FOUND', 'That class was not found in your workspace.');
  }
  return assignment;
}

export async function assignmentForTeacher(teacherId, assignmentId, { write = false, populate = true } = {}) {
  const statuses = write ? WRITE_STATUSES : READ_STATUSES;
  const programIds = await activeProgramIdsForTeacher(teacherId);
  const branches = [{ teacher: teacherId }];
  if (programIds.length) {
    branches.push({ program: { $in: programIds } });
  }
  let query = CourseOffering.findOne(
    ownFilter({ _id: assignmentId, $or: branches, status: { $in: statuses } }),
  );
  if (populate) query = query.populate(ASSIGNMENT_POPULATE);
  const assignment = await query.lean();
  if (!assignment) {
    // The same answer for "does not exist" and "belongs to another teacher" so the API
    // never confirms that somebody else's class exists.
    throw new AppError(404, 'CLASS_NOT_FOUND', 'That class was not found in your workspace.');
  }
  return assignment;
}

export async function activeEnrollments(assignmentId, { populate = true } = {}) {
  let query = CourseRegistration.find({ offering: assignmentId, status: 'registered' }).sort({ createdAt: 1 });
  if (populate) query = query.populate(STUDENT_POPULATE);
  return query.lean();
}

export function studentName(student) {
  if (!student) return 'Student';
  return [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ') || student.studentId || 'Student';
}

const labelOf = (value, fields = ['name', 'code']) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  for (const field of fields) {
    if (value[field]) return value[field];
  }
  return '';
};

export function studentDto(student) {
  if (!student) return null;
  return {
    id: String(student._id),
    studentNumber: student.studentId ?? '',
    name: studentName(student),
    firstName: student.firstName ?? '',
    middleName: student.middleName ?? '',
    lastName: student.lastName ?? '',
    sex: student.sex ?? 'unspecified',
    level: student.level ?? null,
    program: labelOf(student.program),
    programCode: student.program?.code ?? '',
    programId: student.program?._id ? String(student.program._id) : null,
    batch: labelOf(student.batch, ['code', 'name']),
    batchCode: student.batch?.code ?? '',
    batchId: student.batch?._id ? String(student.batch._id) : null,
    batchCategory: student.batch?.category ?? student.studentCategory ?? '',
    department: labelOf(student.department),
    category: student.studentCategory ?? '',
    studentStatus: student.studentStatus ?? '',
    enrollmentStatus: student.enrollmentStatus ?? '',
    admissionDate: student.admissionDate ?? null,
    photo: photoView(student.photo),
    email: student.email ?? '',
    phone: student.phone ?? '',
  };
}

export function enrollmentDto(row) {
  const student = row.student && typeof row.student === 'object' ? row.student : null;
  const dto = studentDto(student);
  return {
    id: String(row._id),
    studentId: student ? String(student._id) : String(row.student),
    ...dto,
    registrationStatus: row.status,
    status: row.status,
  };
}

export async function assertStudentEnrolled(assignmentId, studentId, { populate = false } = {}) {
  let query = CourseRegistration.findOne({ offering: assignmentId, student: studentId, status: 'registered' });
  if (populate) query = query.populate(STUDENT_POPULATE);
  const registration = await query.lean();
  if (!registration) throw new AppError(404, 'STUDENT_NOT_FOUND', 'That student is not registered in this class.');
  return registration;
}

export async function assessmentForTeacher(teacherId, assessmentId, { write = false } = {}) {
  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'That assessment was not found.');
  const assignment = await assignmentForTeacher(teacherId, assessment.offering, { write });
  if (write && assessment.status === 'submitted') {
    throw new AppError(409, 'ASSESSMENT_SUBMITTED', 'This assessment has been submitted. Its marks are locked.');
  }
  return { assessment, assignment };
}

export async function materialForTeacher(teacherId, materialId, { write = false } = {}) {
  const material = await Material.findOne({ _id: materialId, deletedAt: null }).lean();
  if (!material) throw new AppError(404, 'MATERIAL_NOT_FOUND', 'That material was not found.');
  const assignment = await assignmentForTeacher(teacherId, material.offering, { write });
  return { material, assignment };
}

export function assignmentDto(row, extra = {}, teacherId = null, teacherProgramIds = null) {
  const course = row.course && typeof row.course === 'object' ? row.course : null;
  const year = row.academicYear && typeof row.academicYear === 'object' ? row.academicYear : null;
  const program = row.program && typeof row.program === 'object' ? row.program : null;
  const department = row.department && typeof row.department === 'object' ? row.department : null;
  const batch = row.batch && typeof row.batch === 'object' ? row.batch : null;
  const owner = row.teacher?._id ?? row.teacher;
  const progIdStr = program?._id ? String(program._id) : String(row.program || '');
  const isProgramTeacher = teacherProgramIds
    ? (teacherProgramIds instanceof Set ? teacherProgramIds.has(progIdStr) : teacherProgramIds.includes(progIdStr))
    : false;
  const canManage = teacherId
    ? (Boolean(owner) && String(owner) === String(teacherId)) || isProgramTeacher
    : Boolean(extra.canManage);

  return {
    id: String(row._id),
    courseId: String(course?._id ?? row.course),
    courseCode: course?.code ?? '',
    courseTitle: course?.title ?? '',
    creditHours: row.creditHours ?? course?.creditHours ?? null,
    courseActive: course?.active !== false,
    academicYearId: String(year?._id ?? row.academicYear),
    academicYear: year?.label ?? '',
    academicYearCurrent: Boolean(year?.isCurrent),
    term: row.term ?? '',
    level: row.level ?? null,
    programId: program ? String(program._id) : null,
    program: program ? [program.code, program.name].filter(Boolean).join(' · ') : labelOf(row.program),
    programCode: program?.code ?? '',
    programName: program?.name ?? '',
    qualificationType: program?.qualificationType ?? '',
    department: department?.name ?? labelOf(row.department),
    batch: batch ? [batch.code, batch.name].filter(Boolean).join(' · ') : '',
    batchCode: batch?.code ?? '',
    batchId: batch?._id ? String(batch._id) : null,
    category: row.category || batch?.category || '',
    section: '',
    schedule: row.schedule ?? '',
    meetingDays: row.meetingDays ?? [],
    assessmentMode: row.assessmentMode ?? 'numeric',
    status: row.status,
    canManage,
    ...extra,
  };
}
