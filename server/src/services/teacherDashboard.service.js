import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { Assessment } from '../models/Assessment.js';
import { AttendanceSheet } from '../models/AttendanceSheet.js';
import { AttendanceRecord } from '../models/Records.js';
import { Notification } from '../models/Notification.js';
import {
  ASSIGNMENT_POPULATE,
  WRITE_STATUSES,
  assignmentDto,
  dayKey,
} from './teacherScope.service.js';
import { ownFilter } from './registrar.helpers.js';

const countBy = (rows) =>
  rows.reduce((acc, row) => {
    acc[row._id] = row.count;
    return acc;
  }, {});

export async function teacherDashboard(teacherId) {
  const assignments = await CourseOffering.find(ownFilter({ teacher: teacherId, status: { $in: WRITE_STATUSES } }))
    .populate(ASSIGNMENT_POPULATE)
    .sort({ createdAt: -1 })
    .lean();

  const ids = assignments.map((row) => row._id);
  const today = dayKey();

  const [registrationCounts, assessmentGroups, draftSheets, recentSheets, unread] = await Promise.all([
    CourseRegistration.aggregate([
      { $match: { offering: { $in: ids }, status: 'registered' } },
      { $group: { _id: '$offering', count: { $sum: 1 } } },
    ]),
    Assessment.aggregate([
      { $match: { offering: { $in: ids } } },
      { $group: { _id: { offering: '$offering', status: '$status' }, count: { $sum: 1 } } },
    ]),
    AttendanceSheet.aggregate([
      { $match: { offering: { $in: ids }, status: 'draft' } },
      { $group: { _id: '$offering', count: { $sum: 1 } } },
    ]),
    AttendanceSheet.find(ownFilter({ offering: { $in: ids } }))
      .sort({ date: -1, createdAt: -1 })
      .limit(6)
      .lean(),
    Notification.countDocuments({ userId: teacherId, readAt: null }),
  ]);

  const records = recentSheets.length
    ? await AttendanceRecord.find(
        ownFilter({
          offering: { $in: recentSheets.map((row) => row.offering) },
          date: { $in: recentSheets.map((row) => row.date) },
        }),
      )
        .select('offering date period status')
        .lean()
    : [];

  const registrations = countBy(registrationCounts);
  const drafts = countBy(draftSheets);
  const assessmentMap = new Map();
  for (const row of assessmentGroups) {
    const key = String(row._id.offering);
    if (!assessmentMap.has(key)) assessmentMap.set(key, { draft: 0, published: 0, closed: 0, submitted: 0 });
    assessmentMap.get(key)[row._id.status] = row.count;
  }

  const assessmentTotals = { draft: 0, published: 0, closed: 0, submitted: 0 };
  for (const counts of assessmentMap.values()) {
    for (const key of Object.keys(assessmentTotals)) assessmentTotals[key] += counts[key] || 0;
  }

  const attendanceById = new Map(assignments.map((row) => [String(row._id), row]));
  const courses = assignments.map((row) => {
    const counts = assessmentMap.get(String(row._id)) || { draft: 0, published: 0, closed: 0, submitted: 0 };
    return assignmentDto(row, {
      studentCount: registrations[String(row._id)] || 0,
      attendanceDrafts: drafts[String(row._id)] || 0,
      assessments: counts,
    });
  });

  return {
    today,
    summary: {
      classes: courses.length,
      students: registrationCounts.reduce((sum, row) => sum + row.count, 0),
      attendanceDrafts: draftSheets.reduce((sum, row) => sum + row.count, 0),
      gradesAwaitingSubmission: assessmentTotals.published + assessmentTotals.closed,
      drafts: assessmentTotals.draft,
      submitted: assessmentTotals.submitted,
      unreadNotifications: unread,
    },
    assessmentTotals,
    courses,
    recentAttendance: recentSheets
      .filter((row) => attendanceById.has(String(row.offering)))
      .map((row) => {
        const assignment = attendanceById.get(String(row.offering));
        const sheetRecords = records.filter(
          (record) =>
            String(record.offering) === String(row.offering) &&
            record.period === row.period &&
            new Date(record.date).getTime() === new Date(row.date).getTime(),
        );
        return {
          id: String(row._id),
          assignmentId: String(row.offering),
          courseCode: assignment?.course?.code ?? '',
          courseTitle: assignment?.course?.title ?? '',
          dateKey: row.dateKey,
          status: row.status,
          present: sheetRecords.filter((record) => record.status === 'present' || record.status === 'late').length,
          marked: sheetRecords.length,
          period: row.period,
        };
      }),
  };
}
