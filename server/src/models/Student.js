import mongoose from 'mongoose';
import { normalizePhone, isValidEthiopianPhone } from '../utils/phone.js';

export const STUDENT_SEXES = ['female', 'male', 'other', 'unspecified'];
export const STUDENT_STATUSES = ['active', 'suspended', 'graduated', 'withdrawn', 'archived'];
export const ENROLLMENT_STATUSES = ['pending', 'active', 'completed', 'withdrawn', 'cancelled'];
export const STUDENT_CATEGORIES = ['regular', 'extension'];

const photoSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['imagekit'], default: null },
    fileId: { type: String, default: null },
    filePath: { type: String, default: null },
    url: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    contentType: { type: String, default: null },
    extension: { type: String, default: null, lowercase: true, trim: true },
    bytes: { type: Number, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    status: { type: String, enum: ['active', 'missing'], default: 'active' },
    uploadedAt: { type: Date, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    missingAt: { type: Date, default: null },
  },
  { _id: false },
);

// The registrar owns student records. A teacher only reads the students registered in an
// offering, so this model carries academic identity and contact details only.
const studentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    middleName: { type: String, default: '', trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    // Stored, not only a virtual: official snapshots and sorted Registrar lists must keep
    // working after `.lean()` and after a name is later corrected.
    fullName: { type: String, trim: true, maxlength: 250 },
    sex: { type: String, enum: STUDENT_SEXES, default: 'unspecified' },
    dateOfBirth: { type: Date, default: null },
    email: { type: String, default: '', trim: true, lowercase: true, maxlength: 254 },
    // Required and normalised to +251 9XX XXX XXX on the way in. A registrar cannot
    // admit a student without a working Ethiopian mobile number.
    phone: {
      type: String,
      required: [true, 'Phone number is required.'],
      trim: true,
      set: (value) => normalizePhone(value),
      validate: {
        validator: (value) => isValidEthiopianPhone(value),
        message: '{VALUE} is not a valid Ethiopian mobile number.',
      },
      maxlength: 20,
    },
    // Regular students follow the standard programme timeline. Extension students
    // attend part-time or repeat a level, which is why the category is stored rather
    // than inferred from a batch flag.
    studentCategory: {
      type: String,
      enum: STUDENT_CATEGORIES,
      default: 'regular',
      index: true,
    },
    address: {
      region: { type: String, default: '', trim: true, maxlength: 80 },
      city: { type: String, default: '', trim: true, maxlength: 80 },
      woreda: { type: String, default: '', trim: true, maxlength: 80 },
      line: { type: String, default: '', trim: true, maxlength: 220 },
    },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', default: null, index: true },
    // Copied from the programme at creation so an official document never has to
    // guess whether a degree, diploma or short-term programme was completed.
    qualificationType: { type: String, enum: ['degree', 'diploma', 'short-term'], default: null, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    admissionAcademicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null },
    level: { type: Number, min: 1, max: 20, default: 1 },
    enrollmentStatus: { type: String, enum: ENROLLMENT_STATUSES, default: 'active', index: true },
    studentStatus: { type: String, enum: STUDENT_STATUSES, default: 'active', index: true },
    admissionDate: { type: Date, default: null },
    completionDate: { type: Date, default: null },
    photo: { type: photoSchema, default: () => ({}) },
    notes: { type: String, default: '', trim: true, maxlength: 2000 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

studentSchema.index({ studentId: 1 }, { unique: true });
studentSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $gt: '' } } });
studentSchema.index({ lastName: 1, firstName: 1 });
studentSchema.index({ program: 1, batch: 1, studentStatus: 1 });

studentSchema.pre('validate', function buildFullName() {
  this.fullName = [this.firstName, this.middleName, this.lastName]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
});

studentSchema.index({ fullName: 1 });
studentSchema.index({ fullName: 'text', studentId: 'text' });

const enrollmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    qualificationType: { type: String, enum: ['degree', 'diploma', 'short-term'], required: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    level: { type: Number, min: 1, max: 20, required: true },
    enrollmentDate: { type: Date, required: true },
    status: { type: String, enum: ENROLLMENT_STATUSES, default: 'active', index: true },
    statusHistory: [
      {
        status: { type: String, enum: ENROLLMENT_STATUSES, required: true },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reason: { type: String, trim: true, maxlength: 500, default: '' },
      },
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

enrollmentSchema.index(
  { student: 1, program: 1, academicYear: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'active'] } } },
);

const progressionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    fromLevel: { type: Number, required: true, min: 1 },
    toLevel: { type: Number, required: true, min: 1 },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null },
    effectiveDate: { type: Date, default: Date.now },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

studentSchema.set('toJSON', { virtuals: true });
studentSchema.set('toObject', { virtuals: true });

export const Student = mongoose.model('Student', studentSchema);
export const Enrollment = mongoose.model('Enrollment', enrollmentSchema);
export const ProgressionRecord = mongoose.model('ProgressionRecord', progressionSchema);
