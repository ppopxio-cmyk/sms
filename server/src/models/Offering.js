import mongoose from 'mongoose';

const { Schema } = mongoose;

export const OFFERING_STATUSES = ['draft', 'open', 'in_progress', 'completed', 'cancelled'];
export const REGISTRATION_STATUSES = ['registered', 'dropped', 'withdrawn', 'completed', 'cancelled'];

const teacherChangeSchema = new Schema(
  {
    teacher: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { _id: false },
);

const offeringSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    curriculumPlan: { type: Schema.Types.ObjectId, ref: 'CurriculumPlan', required: true, index: true },
    curriculumCourse: { type: Schema.Types.ObjectId, ref: 'CurriculumCourse', required: true },
    program: { type: Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    term: { type: String, trim: true, maxlength: 60, required: true, index: true },
    level: { type: Number, min: 1, max: 20, required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    category: { type: String, enum: ['regular', 'extension'], default: 'regular', index: true },
    meetingDays: [{ type: String, trim: true, maxlength: 12 }],
    creditHours: { type: Number, required: true, min: 0.5, max: 1000 },
    teacher: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assessmentMode: { type: String, enum: ['numeric', 'competency'], default: 'numeric' },
    capacity: { type: Number, min: 1, max: 500, default: 60 },
    registeredCount: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: OFFERING_STATUSES, default: 'draft', index: true },
    schedule: { type: String, trim: true, maxlength: 300, default: '' },
    teacherHistory: { type: [teacherChangeSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

offeringSchema.index(
  { course: 1, program: 1, academicYear: 1, term: 1, level: 1, batch: 1, category: 1 },
  { unique: true },
);

const registrationSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    offering: { type: Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    term: { type: String, trim: true, maxlength: 60, required: true, index: true },
    creditHours: { type: Number, required: true, min: 0.5, max: 1000 },
    status: { type: String, enum: REGISTRATION_STATUSES, default: 'registered', index: true },
    registeredAt: { type: Date, default: Date.now },
    registeredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    statusHistory: [
      {
        status: { type: String, enum: REGISTRATION_STATUSES, required: true },
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        reason: { type: String, trim: true, maxlength: 500, default: '' },
      },
    ],
  },
  { timestamps: true },
);

registrationSchema.index({ student: 1, offering: 1 }, { unique: true });
registrationSchema.index({ student: 1, academicYear: 1, term: 1, status: 1 });

export const CourseOffering = mongoose.model('CourseOffering', offeringSchema);
export const CourseRegistration = mongoose.model('CourseRegistration', registrationSchema);
