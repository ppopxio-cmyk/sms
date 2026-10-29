import mongoose from 'mongoose';

const { Schema } = mongoose;

const studentIdCardSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    studentSnapshot: {
      studentId: { type: String, required: true },
      fullName: { type: String, required: true },
      photo: { type: Schema.Types.Mixed, default: null },
      qualificationType: { type: String, default: 'degree' },
      departmentName: { type: String, default: '' },
      programName: { type: String, default: '' },
      batchCode: { type: String, default: '' },
      admissionYear: { type: String, default: '2019' },
    },
    issueNumber: { type: Number, required: true, min: 1, max: 2 }, // Maximum 2 times limit
    printCount: { type: Number, default: 0, min: 0 },
    promotedStages: [{ type: Number }], // e.g. [1, 2] meaning Year 1 and Year 2 are sealed as Promoted
    currentLevel: { type: Number, default: 1 },
    qualificationType: { type: String, enum: ['degree', 'diploma', 'short-term'], default: 'degree' },
    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['active', 'replaced'], default: 'active' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

studentIdCardSchema.index({ student: 1, issueNumber: 1 }, { unique: true });

export const StudentIdCard = mongoose.model('StudentIdCard', studentIdCardSchema);
