import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true },
    // An approximate browser fingerprint sent by the client. It is only ever used
    // to count device slots and to replace a browser's own older session, never to
    // decide who somebody is: a fingerprint is easy to fake or to change (see the
    // security checklist, section 9).
    fingerprint: { type: String },
    refreshHash: { type: String, required: true, index: true },
    prevRefreshHash: { type: String, index: true },
    rotatedAt: Date,
    ip: String,
    userAgent: String,
    browser: String,
    os: String,
    deviceType: String,
    deviceName: String,
    // A name a person gave this device ("HP EliteBook 830 G8"), because no browser can read
    // the hardware model of a laptop. It wins over the detected name wherever it is shown.
    deviceLabel: String,
    deviceModelSource: String,
    location: String,
    locationSource: String,
    // Canonical place fields. `location` remains the sentence older screens render;
    // these make the same answer queryable and auditable without parsing a label.
    country: String,
    countryCode: String,
    city: String,
    region: String,
    detectionStatus: {
      type: String,
      enum: ['pending', 'estimated', 'unavailable', 'proxy', 'local', 'legacy'],
    },
    detectedAt: Date,
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    revokedAt: Date,
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    revokeReason: String,
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

sessionSchema.index({ userId: 1, status: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
