import mongoose from 'mongoose';

const codeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // email_verify_link holds the hash of a one-time link id, not of a code: the link
  // itself is a signed ticket, and the row is what makes it single use and gives the
  // "wait before sending another one" its memory.
  purpose: {
    type: String,
    enum: ['email_verify_link', 'login_2fa', 'password_reset', 'session_terminate', 'account_delete', 'student_delete'],
    required: true,
  },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

codeSchema.index({ userId: 1, purpose: 1 }, { unique: true });
codeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const VerificationCode = mongoose.model('VerificationCode', codeSchema);
