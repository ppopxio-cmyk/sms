import { z } from 'zod';
import { Student } from '../models/Student.js';
import { ImageKitEvent } from '../models/RegistrarSupport.js';
import { verifyWebhook, payloadHash, signedImageUrl } from '../services/imagekit.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../utils/logger.js';

const webhookSchema = z.object({
  type: z.string().min(1).max(80),
  data: z
    .object({
      fileId: z.string().min(1).max(160),
      filePath: z.string().max(1000).optional().default(''),
      name: z.string().max(300).optional().default(''),
      url: z.string().max(2000).optional().default(''),
      thumbnailUrl: z.string().max(2000).optional().default(''),
      fileType: z.string().max(80).optional().default(''),
      mime: z.string().max(120).optional().default(''),
      size: z.coerce.number().optional().default(0),
      width: z.coerce.number().optional().default(0),
      height: z.coerce.number().optional().default(0),
    })
    .passthrough(),
}).passthrough();

export const imagekitWebhook = asyncHandler(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    throw new AppError(400, 'EMPTY_WEBHOOK', 'The webhook body is empty.');
  }
  // The SDK verifies the standard-webhooks signature against the exact raw bytes. The
  // body is parsed only after that check, so an unsigned caller cannot influence it.
  verifyWebhook(req.body, req.headers);
  const hash = payloadHash(req.body);
  let payload;
  try {
    payload = webhookSchema.parse(JSON.parse(req.body.toString('utf8')));
  } catch (err) {
    if (err instanceof SyntaxError) throw new AppError(400, 'BAD_WEBHOOK_JSON', 'The webhook body is not valid JSON.');
    throw new AppError(400, 'BAD_WEBHOOK', 'The webhook body does not match the expected shape.');
  }

  const existing = await ImageKitEvent.findOne({ eventId: hash });
  if (existing) {
    if (['processed', 'ignored'].includes(existing.outcome)) {
      return res.json({ received: true, duplicate: true, outcome: existing.outcome });
    }
    const stale = existing.outcome === 'processing' && Date.now() - new Date(existing.updatedAt).getTime() > 5 * 60 * 1000;
    if (!['received', 'failed', 'processing'].includes(existing.outcome) || (existing.outcome === 'processing' && !stale)) {
      return res.json({ received: true, duplicate: true, processing: true });
    }
    // A previous delivery may have failed or stopped before recording its result. Claim
    // the stored event and reconcile again, without ever creating a second event row.
    existing.outcome = 'processing';
    existing.attempts = (existing.attempts || 0) + 1;
    existing.detail = '';
    existing.processedAt = null;
    await existing.save();
  }

  let event = existing;
  try {
    if (!event) {
      event = await ImageKitEvent.create({
        eventId: hash,
        type: payload.type,
        fileId: payload.data.fileId,
        payloadHash: hash,
        outcome: 'processing',
      });
    }
  } catch (err) {
    if (err?.code === 11000) return res.json({ received: true, duplicate: true, processing: true });
    throw err;
  }

  try {
    if (payload.type === 'file.deleted') {
      const result = await Student.updateMany(
        { 'photo.fileId': payload.data.fileId },
        {
          $set: {
            'photo.status': 'missing',
            'photo.missingAt': new Date(),
            'photo.url': null,
            'photo.thumbnailUrl': null,
          },
        },
      );
      event.outcome = result.modifiedCount ? 'processed' : 'ignored';
      event.detail = result.modifiedCount ? 'Student photo marked missing.' : 'No student references this file.';
    } else if (payload.type === 'file.created') {
      let result = await Student.updateMany(
        { 'photo.fileId': payload.data.fileId, 'photo.status': 'missing' },
        { $set: { 'photo.status': 'active', 'photo.missingAt': null }, $unset: { 'photo.url': '' } },
      );
      let detail = result.modifiedCount ? 'Student photo reference restored.' : 'No student reference to restore.';
      if (!result.modifiedCount) {
        const name = payload.data.name.trim().split(/[\\/]/).pop();
        const match = /^([A-Za-z0-9._-]+)\.(jpe?g|png|webp)$/i.exec(name);
        const student = match ? await Student.findOne({ studentId: match[1].toUpperCase() }).select('_id').lean() : null;
        if (student) {
          const extension = match[2].toLowerCase() === 'jpeg' ? 'jpg' : match[2].toLowerCase();
          const contentType = payload.data.mime
            || (payload.data.fileType.includes('/')
              ? payload.data.fileType
              : { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[extension]);
          const url = signedImageUrl(payload.data.filePath) || payload.data.url || null;
          const thumbnailUrl = signedImageUrl(payload.data.filePath, {
            transformation: [{ width: 160, height: 160, crop: 'maintain_ratio', focus: 'face' }],
          }) || payload.data.thumbnailUrl || null;
          await Student.updateOne(
            { _id: student._id },
            {
              $set: {
                'photo.provider': 'imagekit',
                'photo.fileId': payload.data.fileId,
                'photo.filePath': payload.data.filePath || null,
                'photo.url': url,
                'photo.thumbnailUrl': thumbnailUrl,
                'photo.contentType': contentType || null,
                'photo.extension': extension,
                'photo.bytes': payload.data.size || null,
                'photo.width': payload.data.width || null,
                'photo.height': payload.data.height || null,
                'photo.status': 'active',
                'photo.uploadedAt': new Date(),
                'photo.missingAt': null,
              },
            },
          );
          result = { modifiedCount: 1 };
          detail = 'Student photo linked by file name.';
        }
      }
      event.outcome = result.modifiedCount ? 'processed' : 'ignored';
      event.detail = detail;
    } else {
      event.outcome = 'ignored';
      event.detail = 'Event type is not handled by the Registrar photo store.';
    }
    event.processedAt = new Date();
    await event.save();
  } catch (err) {
    event.outcome = 'failed';
    event.detail = 'The event was verified but its reconciliation failed.';
    event.processedAt = new Date();
    await event.save().catch(() => {});
    logger.error({ err: err?.message, fileId: payload.data.fileId, type: payload.type }, 'ImageKit webhook reconciliation failed');
    throw new AppError(500, 'WEBHOOK_PROCESSING_FAILED', 'The event could not be reconciled. Please retry.');
  }

  // Bounded response and log: no file contents, tokens, or private paths.
  logger.info({ type: payload.type, fileId: payload.data.fileId, outcome: event.outcome }, 'ImageKit webhook handled');
  res.json({ received: true, outcome: event.outcome });
});
