import mongoose from 'mongoose';

// A device that has signed in before. Signing out deletes the session row, so the
// session table cannot answer "have we seen this browser already?". This collection
// can, which is what stops every sign-in after a sign-out looking like a new device
// and emailing a code.
const knownDeviceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // The browser fingerprint when the client sends one, otherwise the device cookie.
    key: { type: String, required: true },
    browser: String,
    os: String,
    deviceType: String,
    ip: String,
    location: String,
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

knownDeviceSchema.index({ userId: 1, key: 1 }, { unique: true });

export const KnownDevice = mongoose.model('KnownDevice', knownDeviceSchema);
