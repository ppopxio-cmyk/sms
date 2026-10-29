import crypto from 'node:crypto';
import ImageKit, { toFile } from '@imagekit/nodejs';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const configured = Boolean(env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_URL_ENDPOINT);

let client = null;
function getClient() {
  if (!configured) {
    throw new AppError(
      503,
      'IMAGEKIT_NOT_CONFIGURED',
      'Image storage is not configured yet. An administrator must set the ImageKit keys.',
    );
  }
  if (!client) {
    client = new ImageKit({
      privateKey: env.IMAGEKIT_PRIVATE_KEY,
      webhookSecret: env.IMAGEKIT_WEBHOOK_SECRET || undefined,
      timeout: 30_000,
      maxRetries: 1,
    });
  }
  return client;
}

export const imagekitConfigured = () => configured;

export function signedImageUrl(filePath, { transformation, expiresIn = 3600 } = {}) {
  if (!filePath) return null;
  if (!configured) return null;
  return getClient().helper.buildSrc({
    urlEndpoint: env.IMAGEKIT_URL_ENDPOINT,
    src: filePath,
    signed: true,
    expiresIn,
    ...(transformation ? { transformation } : {}),
  });
}

export function photoView(photo) {
  if (!photo) return null;
  const usable = photo.status !== 'missing';
  const url = usable && photo.filePath ? signedImageUrl(photo.filePath, { expiresIn: 3600 }) : usable ? photo.url : null;
  const thumbnailUrl = usable
    ? photo.filePath
      ? signedImageUrl(photo.filePath, {
          transformation: [{ width: 160, height: 160, crop: 'maintain_ratio', focus: 'face' }],
          expiresIn: 3600,
        })
      : photo.thumbnailUrl || url
    : null;
  return { ...photo, url, thumbnailUrl };
}

export async function uploadImage(buffer, { fileName, folder, contentType }) {
  const sdk = getClient();
  const file = await toFile(buffer, fileName, { type: contentType });
  const response = await sdk.files.upload({
    file,
    fileName,
    folder,
    isPrivateFile: true,
    useUniqueFileName: false,
    overwriteFile: true,
    tags: ['sms-registrar'],
  });
  if (!response?.fileId || !response?.filePath) {
    throw new AppError(502, 'IMAGE_UPLOAD_INCOMPLETE', 'Image storage did not confirm the upload. Please try again.');
  }
  return {
    provider: 'imagekit',
    fileId: response.fileId,
    filePath: response.filePath,
    url: signedImageUrl(response.filePath),
    thumbnailUrl: signedImageUrl(response.filePath, {
      transformation: [{ width: 160, height: 160, crop: 'maintain_ratio', focus: 'face' }],
      expiresIn: 3600,
    }),
    contentType,
    bytes: buffer.length,
    uploadedAt: new Date(),
  };
}

export async function uploadDocument(buffer, { fileName, folder, contentType }) {
  const sdk = getClient();
  const file = await toFile(buffer, fileName, { type: contentType });
  const response = await sdk.files.upload({
    file,
    fileName,
    folder,
    isPrivateFile: true,
    useUniqueFileName: true,
    tags: ['sms-course-material'],
  });
  if (!response?.fileId || !response?.filePath) {
    throw new AppError(502, 'DOCUMENT_UPLOAD_INCOMPLETE', 'File storage did not confirm the upload. Please try again.');
  }
  return {
    provider: 'imagekit',
    fileId: response.fileId,
    filePath: response.filePath,
    url: signedImageUrl(response.filePath, { expiresIn: 21600 }),
    contentType,
    bytes: buffer.length,
    uploadedAt: new Date(),
  };
}

const DOCUMENT_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
};

export function validateDocument(buffer, fileName) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError(400, 'EMPTY_DOCUMENT', 'Choose a PDF or Word document to upload.');
  }
  if (buffer.length > 50 * 1024 * 1024) {
    throw new AppError(413, 'DOCUMENT_TOO_LARGE', 'The course material must be smaller than 50 MB.');
  }
  const extension = String(fileName || '').split('.').pop()?.toLowerCase();
  if (!DOCUMENT_TYPES[extension]) {
    throw new AppError(400, 'DOCUMENT_TYPE', 'Upload a PDF, DOC or DOCX file.');
  }
  if (extension === 'pdf' && buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new AppError(400, 'INVALID_DOCUMENT', 'That file is not a valid PDF.');
  }
  if (extension === 'docx' && buffer.subarray(0, 4).toString('hex') !== '504b0304') {
    throw new AppError(400, 'INVALID_DOCUMENT', 'That file is not a valid DOCX document.');
  }
  if (extension === 'doc' && buffer.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') {
    throw new AppError(400, 'INVALID_DOCUMENT', 'That file is not a valid Word document.');
  }
  return { extension, contentType: DOCUMENT_TYPES[extension] };
}

export async function deleteImage(fileId) {
  if (!fileId) return;
  try {
    await getClient().files.delete(fileId);
  } catch (err) {
    // A provider 404 means the asset is already gone; that is the desired end state.
    if (err?.status === 404) return;
    throw err;
  }
}

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([name, value]) => [name.toLowerCase(), Array.isArray(value) ? value.join(',') : String(value)]),
  );
}

export function verifyWebhook(rawBody, headers) {
  if (!env.IMAGEKIT_WEBHOOK_SECRET) {
    throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'Webhook verification is not configured.');
  }
  try {
    return getClient().webhooks.unwrap(rawBody.toString('utf8'), {
      headers: normalizeHeaders(headers),
      key: env.IMAGEKIT_WEBHOOK_SECRET,
    });
  } catch (err) {
    logger.warn({ err: err?.message }, 'ImageKit webhook rejected');
    throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'The webhook signature could not be verified.');
  }
}

export function payloadHash(rawBody) {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

// Content is checked from the bytes, not from the request header or file name.
export function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    throw new AppError(400, 'INVALID_IMAGE', 'Choose a valid JPEG, PNG or WebP image.');
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    const size = jpegSize(buffer);
    return { contentType: 'image/jpeg', extension: 'jpg', ...size };
  }

  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') === pngSignature) {
    if (buffer.length < 24) throw new AppError(400, 'INVALID_IMAGE', 'That PNG is incomplete.');
    return {
      contentType: 'image/png',
      extension: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { contentType: 'image/webp', extension: 'webp', ...webpSize(buffer) };
  }

  throw new AppError(400, 'INVALID_IMAGE', 'Choose a JPEG, PNG or WebP image.');
}

function jpegSize(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) break;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new AppError(400, 'INVALID_IMAGE', 'The JPEG dimensions could not be read.');
}

function webpSize(buffer) {
  const chunk = buffer.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  throw new AppError(400, 'INVALID_IMAGE', 'The WebP dimensions could not be read.');
}

export function validateImage(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError(400, 'EMPTY_IMAGE', 'Choose an image to upload.');
  }
  if (buffer.length > env.IMAGEKIT_PHOTO_MAX_BYTES) {
    throw new AppError(
      413,
      'IMAGE_TOO_LARGE',
      `The photo must be smaller than ${Math.round(env.IMAGEKIT_PHOTO_MAX_BYTES / (1024 * 1024))} MB.`,
    );
  }
  const info = detectImage(buffer);
  if (!info.width || !info.height) {
    throw new AppError(400, 'INVALID_IMAGE', 'The image dimensions could not be read.');
  }
  if (info.width < env.IMAGEKIT_PHOTO_MIN_PX || info.height < env.IMAGEKIT_PHOTO_MIN_PX) {
    throw new AppError(
      400,
      'IMAGE_TOO_SMALL',
      `The photo must be at least ${env.IMAGEKIT_PHOTO_MIN_PX} x ${env.IMAGEKIT_PHOTO_MIN_PX} pixels.`,
    );
  }
  return info;
}
