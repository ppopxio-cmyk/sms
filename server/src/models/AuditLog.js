import mongoose from 'mongoose';

const auditSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorRole: String,
    action: { type: String, required: true, index: true },
    targetType: String,
    targetId: String,
    status: { type: String, enum: ['success', 'fail'], default: 'success' },
    ip: String,
    // The same canonical place stored on the session, copied here so an audit entry
    // still explains a sign-in after that session row has been deleted.
    location: String,
    country: String,
    countryCode: String,
    city: String,
    region: String,
    detectionStatus: String,
    detectedAt: Date,
    sessionId: String,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditSchema.index({ createdAt: -1 });
auditSchema.index({ actorId: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditSchema);
