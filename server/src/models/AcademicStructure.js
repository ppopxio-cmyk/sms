import mongoose from 'mongoose';

const { Schema } = mongoose;

export const QUALIFICATION_TYPES = ['degree', 'diploma', 'short-term'];
export const PROGRAM_CATEGORIES = ['regular', 'extension'];
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
    // A programme may be offered in either or both delivery modes. Batches and students
    // then narrow that down to the actual stream they belong to.
    categories: {
      type: [String],
      enum: PROGRAM_CATEGORIES,
      default: () => ['regular', 'extension'],
      index: true,
    },
    durationYears: { type: Number, min: 1, max: 10, default: null },
    levels: { type: [Number], default: undefined },
    shortTerm: {
      duration: { type: Number, min: 1, default: null },
      unit: { type: String, enum: ['weeks', 'months'], default: 'weeks' },
    },
    // The number of students the programme can carry across all active batches.
    // Null means the college has not set a cap.
    capacity: { type: Number, min: 1, max: 10000, default: null },
    teachers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    academicYears: [{ type: Schema.Types.ObjectId, ref: 'AcademicYear' }],
    graduationPolicy: { type: graduationPolicySchema, default: () => ({}) },
    finalizedStages: [{ type: Number }],
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    active: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

programSchema.pre('validate', function normalizeProgram() {
  const categories = [...new Set((this.categories?.length ? this.categories : PROGRAM_CATEGORIES).map(String))];
  if (categories.some((category) => !PROGRAM_CATEGORIES.includes(category))) {
    throw new Error('A programme can only be offered as regular, extension, or both.');
  }
  this.categories = categories;

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
  if (this.qualificationType === 'short-term' && !this.shortTerm?.duration) {
    throw new Error('A short-term programme needs a duration in weeks or months.');
  }
});

const courseSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 24 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    program: { type: Schema.Types.ObjectId, ref: 'Program', default: null, index: true },
    creditHours: { type: Number, required: true, min: 0.5, max: 1000 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    prerequisites: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
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
    // A batch can span multiple programmes, but each Batch document is still tied to
    // exactly one programme for data-model simplicity. The UI groups them by code +
    // category so the registrar sees a single "batch group".
    program: { type: Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    // Intake streams are separated so a regular and an extension batch of the same
    // programme never share a register, a student number sequence, or a timetable.
    category: { type: String, enum: PROGRAM_CATEGORIES, default: 'regular', index: true },
    admissionAcademicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    durationYears: { type: Number, min: 1, max: 5, default: null },
    expectedCompletionYear: { type: Number, min: 2000, max: 2300, default: null },
    currentLevel: { type: Number, min: 1, max: 20, default: 1 },
    status: { type: String, enum: BATCH_STATUSES, default: 'planned', index: true },
    calculatedStages: [{ type: Number }],
    readyForCgpa: { type: Boolean, default: false },
    cgpaCalculated: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

batchSchema.index({ program: 1, code: 1, category: 1 }, { unique: true });
batchSchema.index({ code: 1, category: 1 });

export const Department = mongoose.model('Department', departmentSchema);
export const Program = mongoose.model('Program', programSchema);
export const Course = mongoose.model('Course', courseSchema);
export const AcademicYear = mongoose.model('AcademicYear', academicYearSchema);
export const AcademicTerm = mongoose.model('AcademicTerm', academicTermSchema);
export const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
export const Batch = mongoose.model('Batch', batchSchema);
