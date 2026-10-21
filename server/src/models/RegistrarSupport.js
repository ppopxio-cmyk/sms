import mongoose from 'mongoose';

const { Schema } = mongoose;

const eventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, trim: true, maxlength: 160 },
    type: { type: String, required: true, trim: true, maxlength: 80, index: true },
    fileId: { type: String, trim: true, maxlength: 160, default: null, index: true },
    payloadHash: { type: String, trim: true, maxlength: 64, default: null },
    outcome: { type: String, enum: ['received', 'processing', 'processed', 'ignored', 'failed'], default: 'received', index: true },
    detail: { type: String, trim: true, maxlength: 500, default: '' },
    attempts: { type: Number, default: 1 },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

eventSchema.index({ createdAt: -1 });

const counterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    value: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const ImageKitEvent = mongoose.model('ImageKitEvent', eventSchema);
export const Counter = mongoose.model('Counter', counterSchema);
