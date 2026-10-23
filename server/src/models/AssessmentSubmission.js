import mongoose from 'mongoose';

export const SUBMISSION_STATUSES = ['submitted', 'graded', 'returned'];

const submissionSchema = new mongoose.Schema(
  {
    assessment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessment', required: true, index: true },
    offering: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    studentName: { type: String, required: true, trim: true, maxlength: 250 },
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    fileId: { type: String, required: true, trim: true, maxlength: 120 },
    filePath: { type: String, required: true, trim: true, maxlength: 1000 },
    contentType: { type: String, required: true, trim: true, maxlength: 120 },
    bytes: { type: Number, required: true, min: 1 },
    note: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: SUBMISSION_STATUSES, default: 'submitted', index: true },
    score: { type: Number, min: 0, max: 1000, default: null },
    feedback: { type: String, trim: true, maxlength: 2000, default: '' },
    submittedAt: { type: Date, default: Date.now },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    revision: { type: Number, min: 1, default: 1 },
  },
  { timestamps: true },
);

submissionSchema.index({ assessment: 1, student: 1 }, { unique: true });
submissionSchema.index({ offering: 1, status: 1, submittedAt: -1 });

export const AssessmentSubmission = mongoose.model('AssessmentSubmission', submissionSchema);
