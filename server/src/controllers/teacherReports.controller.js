import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import {
  attendanceReportData,
  buildReportExport,
  competencyReportData,
  gradeSheetData,
  reportOptions,
  rosterData,
} from '../services/teacherReport.service.js';

export const options = asyncHandler(async (req, res) => {
  res.json(await reportOptions(req.user.id, req.valid.query));
});

export const gradeSheet = asyncHandler(async (req, res) => {
  res.json(await gradeSheetData(req.user.id, req.valid.query));
});

export const attendanceSummary = asyncHandler(async (req, res) => {
  res.json(await attendanceReportData(req.user.id, req.valid.query));
});

export const roster = asyncHandler(async (req, res) => {
  res.json(await rosterData(req.user.id, req.valid.query));
});

export const competency = asyncHandler(async (req, res) => {
  res.json(await competencyReportData(req.user.id, req.valid.query));
});

export const exportReport = (type) =>
  asyncHandler(async (req, res) => {
    const report = await buildReportExport(req.user.id, type, req.valid.query);
    audit({
      req,
      action: 'teacher.report_exported',
      targetType: 'teacher-report',
      targetId: type,
      meta: {
        report: type,
        assignmentId: req.valid.query.assignmentId,
        format: req.valid.query.format,
        rows: report.rowCount,
      },
    });
    res.setHeader('Content-Type', report.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
    res.setHeader('X-Export-Rows', String(report.rowCount));
    res.send(report.buffer);
  });
