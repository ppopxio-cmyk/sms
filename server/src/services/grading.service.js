import { findBand } from '../models/Records.js';
import { Result } from '../models/Records.js';
import { AppError } from '../utils/AppError.js';
import { getPolicy, requirePolicy } from './gradingPolicy.service.js';

// One authority for the policy: gradingPolicy.service.js owns reading, validating and
// saving it, so a result, a transcript and a CGPA can never be graded against a
// different set of bands than the one the Registrar approved.
export const getGradingPolicy = getPolicy;
export const requireGradingPolicy = requirePolicy;

export function gradeFor(policy, mark) {
  const band = findBand(policy, Number(mark));
  if (!band) {
    throw new AppError(400, 'GRADE_BAND_MISSING', 'That mark does not fall inside any configured grade band.');
  }
  return band;
}

export function round(value, places = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function applyRepeatPolicy(rows, repeatPolicy = 'all') {
  if (repeatPolicy === 'all') return rows;
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.course?._id ?? row.course);
    const previous = grouped.get(key);
    if (!previous) {
      grouped.set(key, row);
      continue;
    }
    if (repeatPolicy === 'best') {
      if (Number(row.gradePoint) > Number(previous.gradePoint)) grouped.set(key, row);
    } else if (repeatPolicy === 'latest') {
      const rowDate = new Date(row.publishedAt ?? row.updatedAt ?? 0).getTime();
      const previousDate = new Date(previous.publishedAt ?? previous.updatedAt ?? 0).getTime();
      if (rowDate > previousDate) grouped.set(key, row);
    }
  }
  return [...grouped.values()];
}

export function calculateGpa(rows, policy, { repeat = true } = {}) {
  const eligible = rows.filter(
    (row) =>
      row.status === 'published' &&
      row.includeInGpa !== false &&
      row.gradePoint !== null &&
      row.gradePoint !== undefined &&
      Number(row.creditHours ?? row.course?.creditHours ?? 0) > 0,
  );
  const counted = repeat ? applyRepeatPolicy(eligible, policy?.repeatPolicy ?? 'all') : eligible;
  const credits = counted.reduce((sum, row) => sum + Number(row.creditHours ?? row.course?.creditHours ?? 0), 0);
  const qualityPoints = counted.reduce(
    (sum, row) =>
      sum + Number(row.gradePoint) * Number(row.creditHours ?? row.course?.creditHours ?? 0),
    0,
  );
  return {
    gpa: credits ? round(qualityPoints / credits, policy?.rounding ?? 2) : null,
    credits: round(credits, 2),
    qualityPoints: round(qualityPoints, 2),
    courses: counted.length,
  };
}

export async function publishedResultsForStudent(studentId, { academicYear, term } = {}) {
  const filter = { student: studentId, status: 'published' };
  if (academicYear) filter.academicYear = academicYear;
  if (term) filter.term = term;
  return Result.find(filter)
    .populate('course', 'code title creditHours')
    .populate('academicYear', 'label')
    .populate('offering', 'level')
    .sort({ academicYear: 1, term: 1, createdAt: 1 })
    .lean();
}

export async function cgpaForStudent(studentId, policy) {
  const rows = await publishedResultsForStudent(studentId);
  const result = calculateGpa(rows, policy);
  return { ...result, rows };
}

export function groupAcademicRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const year = row.academicYear?.label || row.academicYearLabel || 'Academic year not recorded';
    const term = row.term || 'Term not recorded';
    const key = `${year}::${term}`;
    if (!groups.has(key)) groups.set(key, { year, term, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}

export async function academicSnapshot(studentId, policy) {
  const rows = await publishedResultsForStudent(studentId);
  const cgpa = calculateGpa(rows, policy);
  const courses = rows.map((row) => ({
    academicYear: row.academicYear?.label ?? '',
    term: row.term ?? '',
    level: row.offering?.level ?? null,
    code: row.course?.code ?? '',
    title: row.course?.title ?? '',
    credits: Number(row.creditHours ?? row.course?.creditHours ?? 0),
    mark: row.totalMark ?? null,
    letterGrade: row.letterGrade ?? '',
    gradePoint: row.gradePoint ?? null,
    status: row.status,
  }));
  return { courses, cgpa, rows };
}
