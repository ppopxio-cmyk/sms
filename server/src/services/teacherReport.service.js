import { CourseOffering } from '../models/Offering.js';
import { Assessment } from '../models/Assessment.js';
import { AttendanceSheet } from '../models/AttendanceSheet.js';
import { AttendanceRecord, Result, GradingPolicy, findBand } from '../models/Records.js';
import { AppError } from '../utils/AppError.js';
import { buildExport } from './export.service.js';
import {
  ASSIGNMENT_POPULATE,
  assignmentDto,
  assignmentForTeacher,
  assignmentIdsForTeacher,
  readAssignmentIdsForTeacher,
  activeEnrollments,
  dateFromKey,
  studentDto,
} from './teacherScope.service.js';
import { ownFilter } from './registrar.helpers.js';

const sameTitle = (left, right) =>
  String(left || '').trim().toLowerCase().replace(/\s+/g, ' ') ===
  String(right || '').trim().toLowerCase().replace(/\s+/g, ' ');

function assignmentTitle(assignment) {
  const code = assignment.course?.code ?? '';
  const title = assignment.course?.title ?? 'Class';
  return code ? `${code} · ${title}` : title;
}

function classSubtitle(assignment) {
  return [
    assignment.academicYear?.label,
    assignment.term,
    assignment.level ? `Level ${assignment.level}` : null,
    assignment.program?.name,
  ]
    .filter(Boolean)
    .join(' · ');
}

export async function reportOptions(teacherId, query) {
  const ids = await readAssignmentIdsForTeacher(teacherId);
  const rows = await CourseOffering.find(ownFilter({ _id: { $in: ids } }))
    .populate(ASSIGNMENT_POPULATE)
    .sort({ createdAt: -1 })
    .lean();
  const assignments = rows.map((row) => assignmentDto(row));

  const selectedId = query.assignmentId || assignments[0]?.id;
  const selected = assignments.find((row) => row.id === selectedId) || null;
  const assessments = selectedId
    ? await Assessment.find(ownFilter({ offering: selectedId, status: { $ne: 'draft' } }))
        .select('_id title type maxScore status weight')
        .sort({ createdAt: 1 })
        .lean()
    : [];

  return {
    assignments,
    selected,
    assessments: assessments.map((row) => ({
      id: String(row._id),
      title: row.title,
      type: row.type,
      maxScore: row.maxScore,
      weight: row.weight,
      status: row.status,
    })),
  };
}

export async function gradeSheetData(teacherId, query) {
  const assignment = await assignmentForTeacher(teacherId, query.assignmentId);
  if (assignment.assessmentMode === 'competency') {
    return {
      configured: false,
      mode: 'competency',
      title: assignmentTitle(assignment),
      subtitle: classSubtitle(assignment),
      message: 'This course uses competency assessment. The institution has not configured its competency scales or passing rules, so a numeric grade sheet cannot be produced.',
    };
  }

  const assessmentFilter = {
    offering: assignment._id,
    status: { $in: ['published', 'closed', 'submitted'] },
  };
  if (query.assessmentId) assessmentFilter._id = query.assessmentId;

  const [assessments, enrollments, results] = await Promise.all([
    Assessment.find(ownFilter(assessmentFilter)).sort({ createdAt: 1 }).lean(),
    activeEnrollments(assignment._id),
    Result.find({ offering: assignment._id }).lean(),
  ]);
  if (query.assessmentId && !assessments.length) {
    throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'That assessment was not found in this class.');
  }

  const resultByStudent = new Map(results.map((row) => [String(row.student), row]));

  const columns = [
    { key: 'number', label: 'No.', width: 7, align: 'center' },
    { key: 'studentNumber', label: 'Student ID', width: 16 },
    { key: 'name', label: 'Student name', width: 28 },
    ...assessments.map((assessment) => ({
      key: `a_${assessment._id}`,
      label: `${assessment.title} (/${assessment.maxScore})`,
      width: Math.max(14, Math.min(24, assessment.title.length + 6)),
      align: 'center',
    })),
    { key: 'total', label: 'Total', width: 12, align: 'center' },
    { key: 'missing', label: 'Missing', width: 10, align: 'center' },
  ];

  let missingTotal = 0;
  let enteredTotal = 0;
  const rows = enrollments
    .filter((row) => row.student)
    .map((row, index) => {
      let total = 0;
      let missing = 0;
      const scores = {};
      const result = resultByStudent.get(String(row.student._id));
      for (const assessment of assessments) {
        const component = (result?.components || []).find((entry) => sameTitle(entry.name, assessment.title));
        if (!component || component.score === null || component.score === undefined) {
          missing += 1;
          scores[`a_${assessment._id}`] = '';
        } else {
          total += Number(component.score);
          enteredTotal += 1;
          scores[`a_${assessment._id}`] = Number(component.score);
        }
      }
      missingTotal += missing;
      return {
        number: index + 1,
        studentNumber: row.student.studentId ?? '',
        name: [row.student.firstName, row.student.middleName, row.student.lastName].filter(Boolean).join(' '),
        ...scores,
        total: assessments.length ? Math.round(total * 100) / 100 : 0,
        missing,
      };
    });

  return {
    configured: true,
    mode: assignment.assessmentMode,
    title: 'Grade sheet',
    subtitle: `${assignmentTitle(assignment)}${classSubtitle(assignment) ? ` · ${classSubtitle(assignment)}` : ''}`,
    summary: [
      { label: 'Students', value: rows.length },
      { label: 'Assessments', value: assessments.length },
      { label: 'Scores entered', value: enteredTotal },
      { label: 'Missing scores', value: missingTotal },
    ],
    note: 'Raw scores only. This sheet does not calculate a grade point average or a letter grade.',
    columns,
    rows,
    class: assignmentDto(assignment, { studentCount: rows.length }),
    assessments: assessments.map((row) => ({ id: String(row._id), title: row.title, maxScore: row.maxScore })),
  };
}

export async function attendanceReportData(teacherId, query) {
  const assignment = await assignmentForTeacher(teacherId, query.assignmentId);
  const from = query.from || '';
  const to = query.to || '';
  if (from) dateFromKey(from);
  if (to) dateFromKey(to);
  if (from && to && from > to) throw new AppError(400, 'BAD_RANGE', 'The start date must be on or before the end date.');

  const sheetFilter = { offering: assignment._id, status: 'finalized' };
  if (from || to) {
    sheetFilter.dateKey = {};
    if (from) sheetFilter.dateKey.$gte = from;
    if (to) sheetFilter.dateKey.$lte = to;
  }

  const [sheets, enrollments] = await Promise.all([
    AttendanceSheet.find(ownFilter(sheetFilter)).select('dateKey date period').sort({ dateKey: 1 }).lean(),
    activeEnrollments(assignment._id),
  ]);

  const records = sheets.length
    ? await AttendanceRecord.find(
        ownFilter({
          offering: assignment._id,
          date: { $in: sheets.map((row) => row.date) },
        }),
      ).lean()
    : [];
  const sheetKeys = new Set(sheets.map((sheet) => `${sheet.dateKey}:${sheet.period}`));
  const relevant = records.filter((record) => {
    const key = `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa' }).format(new Date(record.date))}:${record.period}`;
    return sheetKeys.has(key);
  });

  const counts = new Map();
  for (const enrollment of enrollments) {
    counts.set(String(enrollment.student._id), { present: 0, absent: 0, late: 0, excused: 0 });
  }
  for (const record of relevant) {
    const key = String(record.student);
    if (!counts.has(key)) continue;
    counts.get(key)[record.status] += 1;
  }

  const columns = [
    { key: 'number', label: 'No.', width: 7, align: 'center' },
    { key: 'studentNumber', label: 'Student ID', width: 16 },
    { key: 'name', label: 'Student name', width: 28 },
    { key: 'sessions', label: 'Sessions', width: 10, align: 'center' },
    { key: 'present', label: 'Present', width: 10, align: 'center' },
    { key: 'absent', label: 'Absent', width: 10, align: 'center' },
    { key: 'late', label: 'Late', width: 10, align: 'center' },
    { key: 'excused', label: 'Excused', width: 10, align: 'center' },
    { key: 'rate', label: 'Present %', width: 11, align: 'center' },
  ];

  const rows = enrollments
    .filter((row) => row.student)
    .map((row, index) => {
      const count = counts.get(String(row.student._id)) || { present: 0, absent: 0, late: 0, excused: 0 };
      return {
        number: index + 1,
        studentNumber: row.student.studentId ?? '',
        name: [row.student.firstName, row.student.middleName, row.student.lastName].filter(Boolean).join(' '),
        sessions: sheets.length,
        present: count.present,
        absent: count.absent,
        late: count.late,
        excused: count.excused,
        rate: sheets.length ? Math.round(((count.present + count.late) / sheets.length) * 100) : 0,
      };
    });

  return {
    title: 'Attendance summary',
    subtitle: `${assignmentTitle(assignment)}${classSubtitle(assignment) ? ` · ${classSubtitle(assignment)}` : ''}`,
    summary: [
      { label: 'Students', value: rows.length },
      { label: 'Finalized sessions', value: sheets.length },
      { label: 'From', value: from || 'First session' },
      { label: 'To', value: to || 'Latest session' },
    ],
    note: 'Only finalized attendance sessions are counted. Present % includes late arrivals.',
    columns,
    rows,
    sessions: sheets.map((row) => `${row.dateKey} ${row.period}`),
    class: assignmentDto(assignment, { studentCount: rows.length }),
  };
}

export async function rosterData(teacherId, query) {
  const assignment = await assignmentForTeacher(teacherId, query.assignmentId);
  const enrollments = await activeEnrollments(assignment._id);
  const columns = [
    { key: 'number', label: 'No.', width: 7, align: 'center' },
    { key: 'studentNumber', label: 'Student ID', width: 16 },
    { key: 'name', label: 'Student name', width: 28 },
    { key: 'sex', label: 'Sex', width: 9 },
    { key: 'program', label: 'Programme', width: 24 },
    { key: 'batch', label: 'Batch', width: 12 },
    { key: 'level', label: 'Level', width: 8, align: 'center' },
    { key: 'email', label: 'Email', width: 26 },
    { key: 'phone', label: 'Phone', width: 16 },
  ];
  const rows = enrollments
    .filter((row) => row.student)
    .map((row, index) => {
      const student = studentDto(row.student);
      return {
        number: index + 1,
        studentNumber: student.studentNumber,
        name: student.name,
        sex: student.sex,
        program: student.program,
        batch: student.batch,
        level: student.level ?? '',
        email: student.email,
        phone: student.phone,
      };
    });
  return {
    title: 'Class roster',
    subtitle: `${assignmentTitle(assignment)}${classSubtitle(assignment) ? ` · ${classSubtitle(assignment)}` : ''}`,
    summary: [{ label: 'Students', value: rows.length }],
    note: 'Registered students only.',
    columns,
    rows,
    class: assignmentDto(assignment, { studentCount: rows.length }),
  };
}

export async function competencyReportData(teacherId, query) {
  const assignment = await assignmentForTeacher(teacherId, query.assignmentId);
  return {
    mode: assignment.assessmentMode,
    configured: false,
    title: assignmentTitle(assignment),
    subtitle: classSubtitle(assignment),
    message:
      assignment.assessmentMode === 'competency'
        ? 'This course uses competency assessment. The institution has not configured its competency scales or passing rules, so no results are calculated here.'
        : 'This course uses numeric marks. Use the grade sheet to see raw scores.',
  };
}

// Performance report: per-assessment average marks and submission counts
export async function performanceReportData(teacherId, query) {
  const assignment = await assignmentForTeacher(teacherId, query.assignmentId);
  const assessments = await Assessment.find(
    ownFilter({ offering: assignment._id, status: { $in: ['published', 'closed', 'submitted'] } }),
  )
    .select('_id title type maxScore status weight')
    .sort({ createdAt: 1 })
    .lean();

  const enrollments = await activeEnrollments(assignment._id);
  const results = await Result.find({ offering: assignment._id }).lean();
  const resultByStudent = new Map(results.map((r) => [String(r.student), r]));

  const rows = enrollments
    .filter((row) => row.student)
    .map((row) => {
      const result = resultByStudent.get(String(row.student._id));
      const components = (result?.components || []).reduce((acc, c) => {
        acc[c.name] = c.score;
        return acc;
      }, {});
      const total = Object.values(components).reduce((s, v) => s + (v ?? 0), 0);
      return {
        number: 0,
        studentNumber: row.student.studentId ?? '',
        name: [row.student.firstName, row.student.middleName, row.student.lastName].filter(Boolean).join(' '),
        ...components,
        total: Math.round(total * 100) / 100,
      };
    });

  // Compute per-assessment stats
  const assessmentStats = assessments.map((a) => {
    const scores = rows.map((r) => r[`a_${a._id}`]).filter((v) => v !== undefined && v !== null && v !== '');
    const avg = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    return {
      id: String(a._id),
      title: a.title,
      courseCode: assignment.course?.code,
      averageMark: Math.round(avg * 100) / 100,
      maxMark: a.maxScore,
      submitted: scores.length,
    };
  });

  return {
    configured: true,
    title: 'Performance overview',
    subtitle: `${assignment.course?.code} · ${assignment.course?.title}`,
    summary: [{ label: 'Students', value: rows.length }, { label: 'Assessments', value: assessments.length }],
    assessments: assessmentStats,
    rows,
    columns: [
      { key: 'studentNumber', label: 'Student ID', width: 16 },
      { key: 'name', label: 'Student name', width: 28 },
      ...assessments.map((a) => ({ key: `a_${a._id}`, label: a.title, width: 14, align: 'center' })),
      { key: 'total', label: 'Total', width: 10, align: 'center' },
    ],
  };
}

// Grade distribution: count of students in each grade band
export async function gradeDistributionData(teacherId, query) {
  const assignment = await assignmentForTeacher(teacherId, query.assignmentId);
  const enrollments = await activeEnrollments(assignment._id);
  const results = await Result.find({ offering: assignment._id, status: 'published' }).lean();
  const resultByStudent = new Map(results.map((r) => [String(r.student), r]));

  // Count grade bands
  const policy = await GradingPolicy.findOne(ownFilter({})).lean();
  const bandCounts = {};
  if (policy?.bands) {
    for (const band of policy.bands) {
      bandCounts[band.letter] = 0;
    }
  }

  for (const enrollment of enrollments) {
    const result = resultByStudent.get(String(enrollment.student?._id));
    if (result?.letterGrade && bandCounts.hasOwnProperty(result.letterGrade)) {
      bandCounts[result.letterGrade]++;
    }
  }

  const distribution = Object.entries(bandCounts).map(([grade, count]) => ({
    label: grade,
    grade,
    count,
  }));

  return {
    configured: true,
    title: 'Grade distribution',
    subtitle: `${assignment.course?.code} · ${assignment.course?.title}`,
    summary: [{ label: 'Students', value: enrollments.length }, { label: 'Published results', value: results.length }],
    distribution,
    rows: [],
    columns: [],
  };
}

export async function buildReportExport(teacherId, type, query) {
  const data =
    type === 'grades'
      ? await gradeSheetData(teacherId, query)
      : type === 'attendance'
        ? await attendanceReportData(teacherId, query)
        : type === 'performance'
          ? await performanceReportData(teacherId, query)
          : type === 'grade-dist'
            ? await gradeDistributionData(teacherId, query)
            : await rosterData(teacherId, query);

  if (data.configured === false) {
    throw new AppError(409, 'COMPETENCY_CONFIG_REQUIRED', data.message);
  }

  return buildExport({
    format: query.format || 'xlsx',
    filenamePrefix: `teacher-${type}`,
    title: data.title,
    subtitle: data.subtitle,
    summary: data.summary,
    note: data.note,
    columns: data.columns,
    rows: data.rows,
  });
}
