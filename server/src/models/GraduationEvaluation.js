import mongoose from 'mongoose';

const { Schema } = mongoose;

export const EVALUATION_STATUSES = [
  'eligible',
  'in_progress',
  'pending_review',
  'not_eligible',
  'certificate_issued',
];

const graduationEvaluationSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    program: { type: Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    curriculumPlan: { type: Schema.Types.ObjectId, ref: 'CurriculumPlan', default: null },
    academicYear: { type: Schema.Types.ObjectId, ref: 'AcademicYear', default: null },
    status: { type: String, enum: EVALUATION_STATUSES, required: true, index: true },
    requiredCredits: { type: Number, default: 0 },
    earnedCredits: { type: Number, default: 0 },
    cgpa: { type: Number, default: null },
    missingRequiredCourses: [
      {
        course: { type: Schema.Types.ObjectId, ref: 'Course' },
        code: String,
        title: String,
        credits: Number,
      },
    ],
    unpublishedCourses: [{ type: String }],
    reasons: [{ type: String }],
    evaluatedAt: { type: Date, default: Date.now },
    evaluatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    snapshot: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

graduationEvaluationSchema.index({ student: 1, createdAt: -1 });

export const GraduationEvaluation = mongoose.model('GraduationEvaluation', graduationEvaluationSchema);
