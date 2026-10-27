import mongoose from 'mongoose';

const { Schema } = mongoose;

export const CERTIFICATE_STATUSES = ['issued', 'revoked', 'reissued'];
export const PHOTO_POLICIES = ['required', 'optional'];

const assetSchema = new Schema(
  {
    fileId: { type: String, default: null },
    filePath: { type: String, default: null },
    url: { type: String, default: null },
    contentType: { type: String, default: null },
    uploadedAt: { type: Date, default: null },
  },
  { _id: false },
);

const templateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    version: { type: Number, required: true, min: 1, default: 1 },
    active: { type: Boolean, default: true },
    institutionName: { type: String, required: true, trim: true, maxlength: 160 },
    institutionNameAmharic: { type: String, trim: true, maxlength: 200, default: '' },
    certificateTitle: { type: String, trim: true, maxlength: 120, default: 'Certificate of Graduation' },
    certificatePrefix: { type: String, trim: true, uppercase: true, maxlength: 16, default: 'CERT' },
    signatoryName: { type: String, required: true, trim: true, maxlength: 120 },
    signatoryTitle: { type: String, required: true, trim: true, maxlength: 120 },
    photoPolicy: { type: String, enum: PHOTO_POLICIES, required: true },
    theme: {
      primary: { type: String, trim: true, maxlength: 20, default: '#123b2d' },
      accent: { type: String, trim: true, maxlength: 20, default: '#b38b4d' },
      paper: { type: String, trim: true, maxlength: 20, default: '#fffdf7' },
    },
    logo: { type: assetSchema, default: () => ({}) },
    seal: { type: assetSchema, required: true },
    signature: { type: assetSchema, required: true },
    verificationBaseUrl: { type: String, trim: true, maxlength: 300, default: '' },
    effectiveFrom: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

templateSchema.index({ version: 1 }, { unique: true });
templateSchema.index({ active: 1 }, { unique: true, partialFilterExpression: { active: true } });

const snapshotCourseSchema = new Schema(
  {
    academicYear: { type: String, default: '' },
    term: { type: String, default: '' },
    level: { type: Number, default: null },
    code: { type: String, required: true },
    title: { type: String, required: true },
    credits: { type: Number, required: true },
    mark: { type: Number, default: null },
    letterGrade: { type: String, default: '' },
    gradePoint: { type: Number, default: null },
    status: { type: String, default: 'published' },
  },
  { _id: false },
);

const certificateSchema = new Schema(
  {
    certificateNumber: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    verificationId: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentSnapshot: {
      studentId: { type: String, required: true },
      fullName: { type: String, required: true },
      sex: { type: String, default: '' },
      dateOfBirth: { type: Date, default: null },
      admissionDate: { type: Date, default: null },
      batchCode: { type: String, default: '' },
      batchCategory: { type: String, default: '' },
      photo: { type: assetSchema, default: () => ({}) },
    },
    programSnapshot: {
      code: { type: String, required: true },
      name: { type: String, required: true },
      qualificationType: { type: String, required: true },
      durationYears: { type: Number, default: null },
    },
    selectedLevels: { type: [Number], default: [] },
    departmentSnapshot: { code: String, name: String },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', default: null },
    academicYearLabel: { type: String, default: '' },
    completionDate: { type: Date, required: true },
    cgpa: { type: Number, default: null },
    curriculumPlan: { type: Schema.Types.ObjectId, ref: 'CurriculumPlan', default: null },
    planVersion: { type: Number, default: null },
    template: { type: Schema.Types.ObjectId, ref: 'CertificateTemplate', required: true },
    templateVersion: { type: Number, required: true },
    academicSnapshot: { type: [snapshotCourseSchema], default: [] },
    gradingLegend: [
      {
        letter: String,
        min: Number,
        max: Number,
        points: Number,
        pass: Boolean,
      },
    ],
    requiredCredits: { type: Number, default: 0 },
    earnedCredits: { type: Number, default: 0 },
    status: { type: String, enum: CERTIFICATE_STATUSES, default: 'issued', index: true },
    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, trim: true, maxlength: 1000, default: '' },
    supersedes: { type: Schema.Types.ObjectId, ref: 'Certificate', default: null },
    supersededBy: { type: Schema.Types.ObjectId, ref: 'Certificate', default: null },
    reissueReason: { type: String, trim: true, maxlength: 1000, default: '' },
    pdfGeneratedAt: { type: Date, default: null },
    idempotencyKey: { type: String, trim: true, maxlength: 120, default: null, index: true },
  },
  { timestamps: true },
);

certificateSchema.index(
  { student: 1, academicYear: 1 },
  { unique: true, partialFilterExpression: { status: 'issued' } },
);

const transcriptSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentSnapshot: {
      studentId: { type: String, required: true },
      fullName: { type: String, required: true },
      sex: { type: String, default: '' },
      dateOfBirth: { type: Date, default: null },
      admissionDate: { type: Date, default: null },
      batchCode: { type: String, default: '' },
      batchCategory: { type: String, default: '' },
      photo: { type: assetSchema, default: () => ({}) },
    },
    programSnapshot: {
      code: { type: String, required: true },
      name: { type: String, required: true },
      qualificationType: { type: String, required: true },
      durationYears: { type: Number, default: null },
    },
    selectedLevels: { type: [Number], default: [] },
    departmentSnapshot: { code: String, name: String },
    purpose: { type: String, trim: true, maxlength: 300, default: '' },
    academicSnapshot: { type: [snapshotCourseSchema], default: [] },
    gradingLegend: [
      {
        letter: String,
        min: Number,
        max: Number,
        points: Number,
        pass: Boolean,
      },
    ],
    cgpa: { type: Number, default: null },
    totalCredits: { type: Number, default: 0 },
    status: { type: String, enum: ['issued', 'revoked'], default: 'issued', index: true },
    verificationId: { type: String, required: true, unique: true, trim: true },
    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true },
);

transcriptSchema.index({ student: 1, createdAt: -1 });

export const CertificateTemplate = mongoose.model('CertificateTemplate', templateSchema);
export const Certificate = mongoose.model('Certificate', certificateSchema);
export const Transcript = mongoose.model('Transcript', transcriptSchema);
