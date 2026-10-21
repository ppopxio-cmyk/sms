import mongoose from 'mongoose';
import { ASSESSMENT_MODES } from '../config/teacher.js';

export const ASSESSMENT_TYPES = [
  'quiz',
  'assignment',
  'project',
  'midterm',
  'final',
  'practical',
  'presentation',
  'other',
];

export const ASSESSMENT_STATUSES = ['draft', 'published', 'closed', 'submitted'];

// A mark column belongs to one course offering. The score itself lives in the registrar's
// Result document, in the shared `components` array, so the teacher screen and the
// registrar review screen read the same numbers.
const assessmentSchema = new mongoose.Schema(
  {
    offering: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    titleKey: { type: String, required: true, trim: true, maxlength: 160 },
    type: { type: String, enum: ASSESSMENT_TYPES, default: 'other', index: true },
    maxScore: { type: Number, required: true, min: 0.01, max: 1000 },
    weight: { type: Number, default: 0, min: 0, max: 100 },
    dueDate: { type: Date, default: null },
    instructions: { type: String, default: '', trim: true, maxlength: 2000 },
    assessmentMode: { type: String, enum: ASSESSMENT_MODES, default: 'numeric' },
    status: { type: String, enum: ASSESSMENT_STATUSES, default: 'draft', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

assessmentSchema.index({ offering: 1, titleKey: 1 }, { unique: true });
assessmentSchema.index({ offering: 1, status: 1, createdAt: -1 });

assessmentSchema.pre('validate', function setTitleKey() {
  if (this.isModified('title') || !this.titleKey) {
    this.titleKey = String(this.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }
});

export const Assessment = mongoose.model('Assessment', assessmentSchema);
