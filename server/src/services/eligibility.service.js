import { Student } from '../models/Student.js';
import { Enrollment } from '../models/Student.js';
import { CurriculumPlan, CurriculumCourse } from '../models/Curriculum.js';
import { GraduationEvaluation } from '../models/GraduationEvaluation.js';
import { Certificate } from '../models/Documents.js';
import { Result } from '../models/Records.js';
import { getGradingPolicy, calculateGpa, publishedResultsForStudent, round } from './grading.service.js';
import { ownFilter } from './registrar.helpers.js';

export async function activePlan(programId, academicYearId) {
  if (!programId || !academicYearId) return null;
  return CurriculumPlan.findOne({
    program: programId,
    academicYear: academicYearId,
    status: 'published',
  }).lean();
}

export async function resolveStudentPlan(student, academicYearId) {
  const year = academicYearId ?? student.admissionAcademicYear;
  return activePlan(student.program?._id ?? student.program, year?._id ?? year);
}

export async function planCredits(planId) {
  const rows = await CurriculumCourse.find({ plan: planId, active: true }).select('creditHours').lean();
  return round(rows.reduce((sum, row) => sum + Number(row.creditHours || 0), 0), 2);
}

export async function evaluateStudent(studentId, { evaluatedBy = null } = {}) {
  const student = await Student.findById(studentId)
    .populate('program', 'code name qualificationType graduationPolicy levels durationYears')
    .populate('department', 'code name')
    .populate('admissionAcademicYear', 'label')
    .lean();
  if (!student) return null;

  const enrollment = await Enrollment.findOne(ownFilter({ student: studentId, status: { $in: ['active', 'pending'] } }))
    .sort({ createdAt: -1 })
    .lean();
  const academicYearId = enrollment?.academicYear ?? student.admissionAcademicYear?._id ?? student.admissionAcademicYear;
  const plan = await resolveStudentPlan(student, academicYearId);
  const policy = await getGradingPolicy();
  const reasons = [];
  const missingRequiredCourses = [];
  const unpublishedCourses = [];

  if (!plan) {
    reasons.push('No published curriculum plan applies to this student and academic year.');
  }

  let requiredCredits = Number(student.program?.graduationPolicy?.requiredCredits || 0);
  let planRows = [];
  if (plan) {
    planRows = await CurriculumCourse.find({ plan: plan._id, active: true })
      .populate('course', 'code title creditHours')
      .sort({ level: 1, order: 1, createdAt: 1 })
      .lean();
    if (!requiredCredits) requiredCredits = plan.totalCredits || (await planCredits(plan._id));
  }

  const published = await publishedResultsForStudent(studentId);
  const passedByCourse = new Map();
  for (const row of published) {
    if (!row.passed) continue;
    const key = String(row.course?._id ?? row.course);
    const current = passedByCourse.get(key);
    if (!current || Number(row.gradePoint) > Number(current.gradePoint)) passedByCourse.set(key, row);
  }
  const earnedCredits = round(
    [...passedByCourse.values()].reduce((sum, row) => sum + Number(row.creditHours || row.course?.creditHours || 0), 0),
    2,
  );

  if (plan) {
    for (const entry of planRows) {
      if (entry.category === 'required' && !passedByCourse.has(String(entry.course?._id ?? entry.course))) {
        missingRequiredCourses.push({
          course: entry.course?._id ?? entry.course,
          code: entry.course?.code ?? '',
          title: entry.course?.title ?? '',
          credits: entry.creditHours,
        });
      }
    }
    if (missingRequiredCourses.length && student.program?.graduationPolicy?.requiresAllRequiredCourses !== false) {
      reasons.push(`${missingRequiredCourses.length} required course(s) are not yet passed.`);
    }
  }

  if (requiredCredits && earnedCredits < requiredCredits) {
    reasons.push(`Earned ${earnedCredits} of ${requiredCredits} required credits.`);
  }

  const pending = await Result.find({
    student: studentId,
    status: ownFilter({ $in: ['submitted', 'under_review', 'approved'] }),
  })
    .populate('course', 'code title')
    .lean();
  for (const row of pending) {
    unpublishedCourses.push(`${row.course?.code || 'Course'} — ${row.course?.title || 'result awaiting publication'}`);
  }
  if (pending.length) reasons.push(`${pending.length} result(s) are awaiting publication.`);

  const gpa = calculateGpa(published, policy);
  if (!policy) reasons.push('The grading policy is not configured, so an official CGPA cannot be calculated.');
  if (student.program?.graduationPolicy?.minimumCgpa !== null && student.program?.graduationPolicy?.minimumCgpa !== undefined) {
    const minimum = Number(student.program.graduationPolicy.minimumCgpa);
    if (gpa.gpa === null) {
      reasons.push('A minimum CGPA is configured, but the CGPA is not available.');
    } else if (gpa.gpa < minimum) {
      reasons.push(`CGPA ${gpa.gpa.toFixed(2)} is below the configured minimum of ${minimum.toFixed(2)}.`);
    }
  }
  if (student.program?.graduationPolicy?.requiresPhoto && student.photo?.status !== 'active') {
    reasons.push('The programme requires a verified student photo, but none is on file.');
  }

  const activeCertificate = await Certificate.findOne({ student: studentId, status: 'issued' }).select('_id').lean();
  let status;
  if (activeCertificate) status = 'certificate_issued';
  else if (student.studentStatus === 'graduated' || enrollment?.status === 'completed') status = 'eligible';
  else if (reasons.length === 0) status = 'eligible';
  else if (pending.length && !missingRequiredCourses.length && earnedCredits >= requiredCredits) status = 'pending_review';
  else if (['withdrawn'].includes(enrollment?.status) || student.studentStatus === 'withdrawn') status = 'not_eligible';
  else status = 'in_progress';

  const evaluation = await GraduationEvaluation.create({
    student: studentId,
    program: student.program?._id ?? student.program,
    curriculumPlan: plan?._id ?? null,
    academicYear: academicYearId ?? null,
    status,
    requiredCredits,
    earnedCredits,
    cgpa: gpa.gpa,
    missingRequiredCourses,
    unpublishedCourses,
    reasons,
    evaluatedBy,
    snapshot: {
      studentId: student.studentId,
      fullName: student.fullName,
      program: student.program?.name,
      qualificationType: student.program?.qualificationType,
      planVersion: plan?.version ?? null,
      gpaCredits: gpa.credits,
      courseCount: published.length,
    },
  });

  return evaluation.toObject();
}
