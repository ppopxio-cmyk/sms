import mongoose from 'mongoose';

const { Schema } = mongoose;

export const QUALIFICATION_TYPES = ['degree', 'diploma', 'short-term'];
export const ACADEMIC_YEAR_STATUSES = ['planned', 'active', 'closed'];
export const BATCH_STATUSES = ['planned', 'active', 'completed', 'archived'];
export const CALENDAR_EVENT_TYPES = ['registration', 'exam', 'important', 'holiday'];

const departmentSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const graduationPolicySchema = new Schema(
  {
    requiredCredits: { type: Number, min: 0, max: 500, default: null },
    minimumCgpa: { type: Number, min: 0, max: 4, default: null },
    requiresPhoto: { type: Boolean, default: false },
    requiresAllRequiredCourses: { type: Boolean, default: true },
  },
  { _id: false },
);

const programSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    qualificationType: { type: String, enum: QUALIFICATION_TYPES, required: true, index: true },
    durationYears: { type: Number, min: 1, max: 10, default: null },
    levels: { type: [Number], default: undefined },
    shortTerm: {
      duration: { type: Number, min: 1, default: null },
      unit: { type: String, enum: ['weeks', 'months'], default: 'weeks' },
    },
    graduationPolicy: { type: graduationPolicySchema, default: () => ({}) },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

programSchema.pre('validate', function normalizeProgram() {
  if (this.qualificationType === 'diploma') {
    const levels = (this.levels?.length ? this.levels : [1, 2, 3, 4]).map(Number).sort((a, b) => a - b);
    if (levels.some((level) => !Number.isInteger(level) || level < 1 || level > 4)) {
      throw new Error('Diploma levels must be whole numbers between 1 and 4.');
    }
    this.levels = [...new Set(levels)];
  } else {
    this.levels = undefined;
  }
  if (this.qualificationType === 'degree' && !this.durationYears) {
    throw new Error('A degree programme needs a duration in years.');
  }
});

const courseSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 24 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    creditHours: { type: Number, required: true, min: 0.5, max: 30 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

const academicYearSchema = new Schema(
  {
    label: { type: String, required: true, unique: true, trim: true, maxlength: 40 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isCurrent: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ACADEMIC_YEAR_STATUSES, default: 'planned', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

academicYearSchema.pre('validate', function validateYear() {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    throw new Error('The academic year must end after it starts.');
  }
});

const academicTermSchema = new Schema(
  {
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    sequence: { type: Number, required: true, min: 1, max: 20 },
    type: { type: String, enum: ['semester', 'term', 'session'], default: 'semester' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

academicTermSchema.index({ academicYear: 1, name: 1 }, { unique: true });
academicTermSchema.index({ academicYear: 1, sequence: 1 }, { unique: true });
academicTermSchema.pre('validate', function validateTerm() {
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    throw new Error('The term must end after it starts.');
  }
});

const calendarEventSchema = new Schema(
  {
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    term: { type: Schema.Types.ObjectId, ref: 'AcademicTerm', default: null, index: true },
    type: { type: String, enum: CALENDAR_EVENT_TYPES, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

calendarEventSchema.pre('validate', function validateEvent() {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    throw new Error('The event must not end before it starts.');
  }
});

const batchSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    program: { type: Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    admissionAcademicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    expectedCompletionYear: { type: Number, min: 2000, max: 2300, default: null },
    currentLevel: { type: Number, min: 1, max: 20, default: 1 },
    status: { type: String, enum: BATCH_STATUSES, default: 'planned', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

batchSchema.index({ program: 1, code: 1 }, { unique: true });

export const Department = mongoose.model('Department', departmentSchema);
export const Program = mongoose.model('Program', programSchema);
export const Course = mongoose.model('Course', courseSchema);
export const AcademicYear = mongoose.model('AcademicYear', academicYearSchema);
export const AcademicTerm = mongoose.model('AcademicTerm', academicTermSchema);
export const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
export const Batch = mongoose.model('Batch', batchSchema);
