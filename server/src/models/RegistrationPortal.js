import mongoose from 'mongoose';

const registrationPortalSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    portalId: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', default: null, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    programs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Program' }],
    batches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],
    category: { type: String, enum: ['regular', 'extension', 'both', 'evening', 'weekend', 'distance'], default: 'regular', index: true },
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    tutorialVideoUrl: { type: String, required: true, trim: true }, // e.g. YouTube tutorial URL
    instructions: { type: String, default: '', trim: true, maxlength: 3000 },
    entryPoints: {
      degree: { type: Number, default: 350 },
      diploma: { type: Number, default: 275 },
      shortTerm: { type: Number, default: 200 },
    },
    status: { type: String, enum: ['draft', 'open', 'closed', 'archived'], default: 'open', index: true },
    maxApplications: { type: Number, default: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const RegistrationPortal = mongoose.model('RegistrationPortal', registrationPortalSchema);
