import mongoose from 'mongoose';
import { QUALIFICATION_TYPES } from './AcademicStructure.js';

const { Schema } = mongoose;

export const PLAN_STATUSES = ['draft', 'published', 'archived'];
export const CURRICULUM_CATEGORIES = ['required', 'elective'];

const curriculumPlanSchema = new Schema(
  {
    program: { type: Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    qualificationType: { type: String, enum: QUALIFICATION_TYPES, required: true, index: true },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    title: { type: String, trim: true, maxlength: 160, default: '' },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: PLAN_STATUSES, default: 'draft', index: true },
    totalCredits: { type: Number, min: 0, default: 0 },
    sourcePlan: { type: Schema.Types.ObjectId, ref: 'CurriculumPlan', default: null },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

curriculumPlanSchema.index({ program: 1, academicYear: 1, version: 1 }, { unique: true });
curriculumPlanSchema.index(
  { program: 1, academicYear: 1 },
  { unique: true, partialFilterExpression: { status: 'published' } },
);

const curriculumCourseSchema = new Schema(
  {
    plan: { type: Schema.Types.ObjectId, ref: 'CurriculumPlan', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    term: { type: String, trim: true, maxlength: 60, default: '' },
    level: { type: Number, min: 1, max: 20, required: true, index: true },
    creditHours: { type: Number, required: true, min: 0.5, max: 1000 },
    category: { type: String, enum: CURRICULUM_CATEGORIES, default: 'required', index: true },
    prerequisites: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

curriculumCourseSchema.index({ plan: 1, course: 1, term: 1, level: 1 }, { unique: true });
curriculumCourseSchema.index({ plan: 1, level: 1, order: 1 });

export const CurriculumPlan = mongoose.model('CurriculumPlan', curriculumPlanSchema);
export const CurriculumCourse = mongoose.model('CurriculumCourse', curriculumCourseSchema);
