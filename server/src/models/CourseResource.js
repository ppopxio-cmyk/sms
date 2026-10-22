import mongoose from 'mongoose';

const courseResourceSchema = new mongoose.Schema(
  {
    program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    courseName: { type: String, required: true, trim: true, maxlength: 160 },
    courseCode: { type: String, required: true, trim: true, maxlength: 40 },
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    filePath: { type: String, required: true, trim: true, maxlength: 1000 },
    fileId: { type: String, required: true, trim: true, maxlength: 120 },
    contentType: { type: String, required: true, trim: true, maxlength: 120 },
    bytes: { type: Number, required: true, min: 1 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

courseResourceSchema.index({ program: 1, deletedAt: 1, updatedAt: -1 });

export const CourseResource = mongoose.model('CourseResource', courseResourceSchema);
