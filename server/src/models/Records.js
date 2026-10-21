import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'];
export const RESULT_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'published', 'rejected'];
export const REPEAT_POLICIES = ['all', 'best', 'latest'];

const attendanceSchema = new Schema(
  {
    offering: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    date: { type: Date, required: true, index: true },
    period: { type: String, trim: true, maxlength: 40, default: 'day' },
    status: { type: String, enum: ATTENDANCE_STATUSES, required: true },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    markedAt: { type: Date, default: Date.now },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true },
);

attendanceSchema.index({ offering: 1, student: 1, date: 1, period: 1 }, { unique: true });
attendanceSchema.index({ student: 1, date: -1 });

const resultComponentSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 80, required: true },
    max: { type: Number, min: 0.01, max: 1000, required: true },
    score: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const revisionSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, trim: true, maxlength: 1000, required: true },
    from: { type: Schema.Types.Mixed },
    to: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const resultSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    offering: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    term: { type: String, trim: true, maxlength: 60, required: true, index: true },
    creditHours: { type: Number, required: true, min: 0.5, max: 30 },
    components: { type: [resultComponentSchema], default: [] },
    totalMark: { type: Number, min: 0, max: 100, default: null },
    letterGrade: { type: String, trim: true, maxlength: 10, default: null },
    gradePoint: { type: Number, min: 0, max: 4, default: null },
    passed: { type: Boolean, default: false },
    status: { type: String, enum: RESULT_STATUSES, default: 'draft', index: true },
    includeInGpa: { type: Boolean, default: true },
    gradingPolicyVersion: { type: Number, default: null },
    enteredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    submittedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revisionHistory: { type: [revisionSchema], default: [] },
  },
  { timestamps: true },
);

resultSchema.index({ student: 1, offering: 1 }, { unique: true });
resultSchema.index({ academicYear: 1, term: 1, status: 1 });

const gradeBandSchema = new Schema(
  {
    min: { type: Number, min: 0, max: 100, required: true },
    max: { type: Number, min: 0, max: 100, required: true },
    letter: { type: String, trim: true, maxlength: 10, required: true },
    points: { type: Number, min: 0, max: 4, required: true },
    pass: { type: Boolean, default: true },
  },
  { _id: false },
);

const gradingPolicySchema = new Schema(
  {
    key: { type: String, unique: true, default: 'global', immutable: true },
    version: { type: Number, min: 1, default: 1 },
    bands: { type: [gradeBandSchema], default: [] },
    repeatPolicy: { type: String, enum: REPEAT_POLICIES, default: 'all' },
    rounding: { type: Number, min: 0, max: 4, default: 2 },
    effectiveFrom: { type: Date, default: Date.now },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

gradingPolicySchema.pre('validate', function validateBands() {
  if (!this.bands?.length) throw new Error('A grading policy needs at least one grade band.');
  const sorted = [...this.bands].sort((a, b) => a.min - b.min);
  for (let index = 0; index < sorted.length; index += 1) {
    const band = sorted[index];
    if (band.max < band.min) throw new Error('A grade band maximum cannot be below its minimum.');
    // Bands must meet exactly: each band starts where the previous one ends. This is the
    // same rule the service and the academic setup script apply, so a band can never be
    // written that overlaps its neighbour or leaves a mark with no grade at all.
    if (index > 0 && band.min !== sorted[index - 1].max) {
      throw new Error('Grade bands must be contiguous: each band must start where the previous one ends.');
    }
  }
  this.bands = sorted;
});

// The single place a mark is turned into a grade. Bands cover 0 to 100 and meet exactly,
// so the boundary between two bands belongs to both. The first matching band in
// ascending order wins, which puts the shared boundary in the lower band and leaves
// every mark from 0 to 100 with exactly one grade.
export function findBand(policy, mark) {
  if (!policy?.bands?.length || typeof mark !== 'number' || Number.isNaN(mark)) return null;
  const sorted = [...policy.bands].sort((a, b) => a.min - b.min);
  for (const band of sorted) {
    if (mark >= band.min && mark <= band.max) return band;
  }
  return null;
}

export const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceSchema);
export const Result = mongoose.model('Result', resultSchema);
export const GradingPolicy = mongoose.model('GradingPolicy', gradingPolicySchema);
