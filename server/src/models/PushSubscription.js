import mongoose from 'mongoose';

// A browser's push subscription, the address the OS notification is delivered to
// when no tab is open. The same endpoint is never stored twice: if another account
// signs in on the same browser, the row moves to that account instead of leaking
// one person's notices to the next.
const pushSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    // Matches the device key used for session slots, so the browser that just signed
    // in can be left out of its own "new sign-in" notice.
    deviceKey: { type: String },
    userAgent: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const PushSubscription = mongoose.model('PushSubscription', pushSchema);
