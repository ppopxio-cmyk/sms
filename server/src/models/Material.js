import mongoose from 'mongoose';

export const MATERIAL_KINDS = ['note', 'link'];
export const MATERIAL_VISIBILITIES = ['draft', 'published'];

const materialSchema = new mongoose.Schema(
  {
    offering: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
    kind: { type: String, enum: MATERIAL_KINDS, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', trim: true, maxlength: 1000 },
    content: { type: String, default: '', trim: true, maxlength: 5000 },
    url: { type: String, default: '', trim: true, maxlength: 2000 },
    visibility: { type: String, enum: MATERIAL_VISIBILITIES, default: 'draft', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

materialSchema.index({ offering: 1, deletedAt: 1, visibility: 1, updatedAt: -1 });

export const Material = mongoose.model('Material', materialSchema);
