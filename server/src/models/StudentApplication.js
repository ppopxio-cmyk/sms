import mongoose from 'mongoose';
import { normalizePhone, isValidEthiopianPhone } from '../utils/phone.js';

const applicationPhotoSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['imagekit'], default: 'imagekit' },
    fileId: { type: String, default: null },
    filePath: { type: String, default: null },
    url: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    contentType: { type: String, default: null },
    bytes: { type: Number, default: null },
    status: { type: String, enum: ['active', 'missing'], default: 'active' },
  },
  { _id: false }
);

const studentApplicationSchema = new mongoose.Schema(
  {
    portal: { type: mongoose.Schema.Types.ObjectId, ref: 'RegistrationPortal', required: true, index: true },
    applicationNumber: { type: String, required: true, unique: true, index: true, uppercase: true },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    middleName: { type: String, default: '', trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    fullName: { type: String, trim: true, maxlength: 250 },
    gender: { type: String, enum: ['female', 'male', 'other', 'unspecified'], default: 'unspecified' },
    dateOfBirth: { type: Date, default: null },
    birthDateCalendar: { type: String, default: 'ETHIOPIAN' },
    birthDateEthiopian: {
      year: { type: Number, default: null },
      month: { type: Number, default: null },
      day: { type: Number, default: null },
    },
    ethDateOfBirth: {
      year: { type: Number, default: null },
      month: { type: Number, default: null },
      day: { type: Number, default: null },
    },
    birthYear: { type: Number, default: null },
    birthMonth: { type: Number, default: null },
    birthDay: { type: Number, default: null },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      validate: {
        validator: (v) => /^[\w.%+-]+@gmail\.com$/i.test(v),
        message: 'Email must be a valid Gmail address (@gmail.com).',
      },
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      set: (value) => (value ? normalizePhone(value) : ''),
      validate: {
        validator: (value) => isValidEthiopianPhone(value),
        message: '{VALUE} is not a valid Ethiopian mobile number.',
      },
    },
    address: {
      region: { type: String, default: '', trim: true, maxlength: 80 },
      city: { type: String, default: '', trim: true, maxlength: 80 },
      woreda: { type: String, default: '', trim: true, maxlength: 80 },
      line: { type: String, default: '', trim: true, maxlength: 220 },
    },
    emergencyContact: {
      name: { type: String, default: '', trim: true },
      phone: { type: String, default: '', trim: true },
      relationship: { type: String, default: '', trim: true },
      nationalIdFront: {
        url: { type: String, default: null },
        fileId: { type: String, default: null },
        filePath: { type: String, default: null },
      },
      nationalIdBack: {
        url: { type: String, default: null },
        fileId: { type: String, default: null },
        filePath: { type: String, default: null },
      },
    },
    nationalIdFront: {
      url: { type: String, default: null },
      fileId: { type: String, default: null },
      filePath: { type: String, default: null },
    },
    nationalIdBack: {
      url: { type: String, default: null },
      fileId: { type: String, default: null },
      filePath: { type: String, default: null },
    },
    previousEducation: {
      schoolName: { type: String, default: '', trim: true },
      completionYear: { type: String, default: '', trim: true },
      gradeOrGpa: { type: String, default: '', trim: true },
    },
    qualificationType: {
      type: String,
      enum: ['degree', 'diploma', 'short-term'],
      default: 'degree',
      index: true,
    },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', default: null, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    certificateDocument: {
      fileName: { type: String, default: null },
      fileType: { type: String, default: null },
      fileSize: { type: Number, default: null },
      url: { type: String, default: null },
      fileId: { type: String, default: null },
      filePath: { type: String, default: null },
      uploadedAt: { type: Date, default: Date.now },
    },
    photo: { type: applicationPhotoSchema, default: () => ({}) },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', trim: true, maxlength: 1000 },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    generatedStudentId: { type: String, default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

export const StudentApplication = mongoose.model('StudentApplication', studentApplicationSchema);
