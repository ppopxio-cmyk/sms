import mongoose from 'mongoose';

// 1. PaymentCycle: One monthly fee collection cycle
const paymentCycleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 }, // e.g. "Tikimt 2019"
    ethYear: { type: Number, required: true, min: 2000, max: 2150, index: true },
    ethMonth: { type: Number, required: true, min: 1, max: 13, index: true },
    opensAt: { type: Date, required: true },
    dueAt: { type: Date, required: true, index: true },
    amount: { type: Number, required: true, min: 0 }, // Integer santim (e.g. 1500 ETB = 150000 santim)
    bank: {
      bank: { type: String, default: 'Commercial Bank of Ethiopia', trim: true },
      accountNumber: { type: String, required: true, trim: true },
      holderName: { type: String, required: true, trim: true },
    },
    targets: {
      all: { type: Boolean, default: true },
      departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
      programmes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Program' }],
      batches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],
      categories: [{ type: String, trim: true }], // 'regular', 'extension'
    },
    portalHash: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true }, // 32 hex chars
    status: {
      type: String,
      enum: ['draft', 'open', 'closed', 'cancelled'],
      default: 'draft',
      index: true,
    },
    deletedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

paymentCycleSchema.index({ ethYear: 1, ethMonth: 1 });
paymentCycleSchema.index({ status: 1, opensAt: 1, dueAt: 1 });

export const PaymentCycle = mongoose.model('PaymentCycle', paymentCycleSchema);

// 2. StudentCharge: One row per student per cycle, created when the cycle opens
const studentChargeSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentCycle', required: true, index: true },
    studentId: { type: String, required: true, uppercase: true, trim: true, index: true },
    studentName: { type: String, required: true, trim: true },
    department: { type: String, default: '', trim: true },
    programme: { type: String, default: '', trim: true },
    batch: { type: String, default: '', trim: true },
    category: { type: String, default: '', trim: true },
    amountDue: { type: Number, required: true, min: 0 }, // Integer santim
    status: {
      type: String,
      enum: ['unpaid', 'paid', 'waived'],
      default: 'unpaid',
      index: true,
    },
    dueAt: { type: Date, required: true, index: true },
    paidAt: { type: Date, default: null },
    waivedAt: { type: Date, default: null },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    waiver: { type: mongoose.Schema.Types.ObjectId, ref: 'Waiver', default: null },
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

studentChargeSchema.index({ student: 1, cycle: 1 }, { unique: true });
// Highly optimized index for live hold checking across all queries
studentChargeSchema.index({ student: 1, status: 1, dueAt: 1 });
studentChargeSchema.index({ cycle: 1, status: 1 });

export const StudentCharge = mongoose.model('StudentCharge', studentChargeSchema);

// 3. Payment: Append-only ledger of confirmed payments
const paymentSchema = new mongoose.Schema(
  {
    receiptNumber: { type: String, required: true, unique: true, index: true }, // REC-2019-XXXXXX
    charge: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCharge', required: true, index: true },
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentCycle', required: true, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    amount: { type: Number, required: true, min: 1 }, // Integer santim
    method: {
      type: String,
      enum: ['cbe_receipt', 'cash', 'manual'],
      default: 'cbe_receipt',
      index: true,
    },
    bankReference: { type: String, required: true, unique: true, trim: true }, // FT ref or receipt unique token
    doneHash: { type: String, required: true, unique: true, index: true }, // 32 hex chars for /monthly-payments/done/:doneHash
    status: {
      type: String,
      enum: ['confirmed', 'reversed'],
      default: 'confirmed',
      index: true,
    },
    reversalReason: { type: String, default: '', trim: true },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reversedAt: { type: Date, default: null },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    payerName: { type: String, default: '', trim: true },
    receiptUrl: { type: String, default: '', trim: true },
    cbeData: { type: mongoose.Schema.Types.Mixed, default: null },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', paymentSchema);

// 4. PaymentAttempt: Complete audit trail of receipt submissions
const paymentAttemptSchema = new mongoose.Schema(
  {
    charge: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCharge', default: null, index: true },
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentCycle', default: null, index: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, index: true },
    studentId: { type: String, default: '', trim: true, index: true },
    receiptUrl: { type: String, required: true, trim: true },
    parsedReference: { type: String, default: '', trim: true, index: true },
    cbeResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    result: {
      type: String,
      enum: ['success', 'failed', 'pending_verification', 'review_required'],
      required: true,
      index: true,
    },
    reasonCode: { type: String, default: '', trim: true },
    reviewNotes: { type: String, default: '', trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    ipAddress: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

paymentAttemptSchema.index({ createdAt: -1 });

export const PaymentAttempt = mongoose.model('PaymentAttempt', paymentAttemptSchema);

// 5. Waiver: Full or partial exemption or scholarship
const waiverSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentCycle', required: true, index: true },
    charge: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCharge', required: true },
    amount: { type: Number, required: true, min: 0 }, // Integer santim
    type: { type: String, enum: ['full', 'partial'], default: 'full' },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'revoked'],
      default: 'approved',
      index: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

export const Waiver = mongoose.model('Waiver', waiverSchema);

// 6. DeadlineExtension: Per-student extended due date
const deadlineExtensionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentCycle', required: true, index: true },
    charge: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCharge', required: true },
    originalDueAt: { type: Date, required: true },
    extendedDueAt: { type: Date, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    grantedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const DeadlineExtension = mongoose.model('DeadlineExtension', deadlineExtensionSchema);

// 7. StudentNotification: Notifications specifically targeting students
const studentNotificationSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    type: {
      type: String,
      enum: [
        'payment_reminder',
        'overdue_hold',
        'payment_confirmed',
        'waiver_applied',
        'deadline_extended',
        'general',
      ],
      default: 'payment_reminder',
      index: true,
    },
    cycle: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentCycle', default: null },
    charge: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCharge', default: null },
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    sentVia: { type: [String], default: ['in_app'] },
  },
  { timestamps: true }
);

studentNotificationSchema.index({ student: 1, createdAt: -1 });

export const StudentNotification = mongoose.model('StudentNotification', studentNotificationSchema);
