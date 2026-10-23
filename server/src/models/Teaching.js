import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TEACHING_ASSIGNMENT_STATUSES = ['active', 'revoked'];
export const TEACHING_ASSIGNMENT_SOURCES = ['program', 'offering', 'backfill', 'manual'];

// A programme assignment is the durable relationship behind the teacher's programme
// workspace. Course offerings remain the unit of write authority: this row only lets a
// teacher read the programme, its classes and its students.
const teacherProgramAssignmentSchema = new Schema(
  {
    teacher: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    program: { type: Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    status: { type: String, enum: TEACHING_ASSIGNMENT_STATUSES, default: 'active', index: true },
    source: { type: String, enum: TEACHING_ASSIGNMENT_SOURCES, default: 'program' },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: { type: Date, default: Date.now },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    note: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true },
);

teacherProgramAssignmentSchema.index({ teacher: 1, program: 1 }, { unique: true });
teacherProgramAssignmentSchema.index({ program: 1, status: 1 });
teacherProgramAssignmentSchema.index({ teacher: 1, status: 1 });

export const TeacherProgramAssignment = mongoose.model(
  'TeacherProgramAssignment',
  teacherProgramAssignmentSchema,
);
