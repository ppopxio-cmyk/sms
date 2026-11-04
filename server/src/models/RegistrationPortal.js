import mongoose from 'mongoose';

const registrationPortalSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    portalId: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    category: { type: String, enum: ['regular', 'extension'], default: 'regular', index: true },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    tutorialVideoUrl: { type: String, default: '', trim: true }, // e.g. YouTube tutorial URL
    instructions: { type: String, default: '', trim: true, maxlength: 3000 },
    status: { type: String, enum: ['draft', 'open', 'closed', 'archived'], default: 'open', index: true },
    maxApplications: { type: Number, default: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const RegistrationPortal = mongoose.model('RegistrationPortal', registrationPortalSchema);
