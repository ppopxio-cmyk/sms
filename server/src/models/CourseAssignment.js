import mongoose from "mongoose";

const { Schema } = mongoose;

export const COURSE_ASSIGNMENT_STATUSES = ["active", "completed", "cancelled"];

const courseAssignmentSchema = new Schema(
  {
    teacher: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    program: { type: Schema.Types.ObjectId, ref: "Program", required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: "Batch", default: null, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    term: { type: String, trim: true, maxlength: 60, default: "" },
    session: { type: String, trim: true, maxlength: 40, default: "" },
    status: { type: String, enum: COURSE_ASSIGNMENT_STATUSES, default: "active", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

courseAssignmentSchema.index({ teacher: 1, program: 1, course: 1 }, { unique: true });
courseAssignmentSchema.index({ program: 1, batch: 1, course: 1 });
courseAssignmentSchema.index({ program: 1, term: 1 });

export const CourseAssignment = mongoose.model("CourseAssignment", courseAssignmentSchema);
