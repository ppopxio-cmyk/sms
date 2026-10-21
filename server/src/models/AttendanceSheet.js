import mongoose from 'mongoose';

export const ATTENDANCE_SHEET_STATUSES = ['draft', 'finalized'];
export const ATTENDANCE_PERIODS = ['day', 'period-1', 'period-2', 'period-3'];

// The registrar's AttendanceRecord stores one row per student. This sheet is the teacher's
// small header for a class meeting: it carries the revision used for optimistic
// concurrency and the finalization lock. It does not duplicate the attendance rows.
const attendanceSheetSchema = new mongoose.Schema(
  {
    offering: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Use a date in the form YYYY-MM-DD.'],
    },
    date: { type: Date, required: true },
    period: { type: String, enum: ATTENDANCE_PERIODS, default: 'day' },
    status: { type: String, enum: ATTENDANCE_SHEET_STATUSES, default: 'draft', index: true },
    revision: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    finalizedAt: { type: Date, default: null },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

attendanceSheetSchema.index({ offering: 1, dateKey: 1, period: 1 }, { unique: true });
attendanceSheetSchema.index({ offering: 1, status: 1, dateKey: -1 });

export const AttendanceSheet = mongoose.model('AttendanceSheet', attendanceSheetSchema);
