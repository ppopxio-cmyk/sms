import { api } from './api';
import { formatEthiopian } from './ethiopianDate';

export { formatEthiopian };
export const REGISTRAR = '/registrar';
export const registrarPath = (path) => `/registrar${path}`;

export const qualificationLabel = (type) =>
  ({ degree: 'Degree', diploma: 'Diploma', 'short-term': 'Short-term' }[type] ?? type ?? 'â€”');

export const levelLabel = (level, qualificationType) => {
  if (!level) return 'â€”';
  if (qualificationType === 'degree') return `Year ${level}`;
  return `Level ${level}`;
};

export const dateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

export const dateTimeInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export const displayDate = (value) => (value ? formatEthiopian(value) : 'â€”');

export const displayDateTime = (value) =>
  value ? formatEthiopian(value, { time: true }) : 'â€”';

export const toneForStatus = (status) => {
  switch (status) {
    case 'active':
    case 'eligible':
    case 'published':
    case 'issued':
    case 'completed':
    case 'approved':
    case 'registered':
    case 'present':
    case 'open':
      return 'success';
    case 'pending':
    case 'pending_review':
    case 'under_review':
    case 'submitted':
    case 'scheduled':
    case 'late':
    case 'in_progress':
    case 'draft':
    case 'planned':
      return 'warning';
    case 'not_eligible':
    case 'rejected':
    case 'revoked':
    case 'absent':
    case 'withdrawn':
    case 'cancelled':
    case 'failed':
      return 'danger';
    case 'certificate_issued':
    case 'graduated':
      return 'brand';
    default:
      return 'neutral';
  }
};

export const humanStatus = (status) =>
  String(status || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'â€”';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printBlob(blob) {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.opacity = '0.01';
  iframe.style.border = '0';
  iframe.src = url;
  document.body.appendChild(iframe);

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, '_blank');
    }
  };

  iframe.onload = () => {
    setTimeout(doPrint, 300);
  };

  // Fallback in case PDF in iframe doesn't trigger onload
  setTimeout(doPrint, 1500);

  setTimeout(() => {
    iframe.remove();
    URL.revokeObjectURL(url);
  }, 120000);
}

export async function printFile(path, { params, method = 'get' } = {}) {
  const response = await api.request({
    url: path,
    method,
    params,
    responseType: 'blob',
  });
  const type = response.headers?.['content-type'] || 'application/pdf';
  const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type });
  printBlob(blob);
}

function filenameFrom(response, fallback) {
  const header = response.headers?.['content-disposition'] || '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // use the plain name below
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

export async function downloadFile(path, fallbackName, { params, method = 'get' } = {}) {
  const response = await api.request({
    url: path,
    method,
    params,
    responseType: 'blob',
  });
  const type = response.headers?.['content-type'] || 'application/octet-stream';
  const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type });
  const filename = filenameFrom(response, fallbackName);
  downloadBlob(blob, filename);
  return filename;
}

export async function fileErrorMessage(error, fallback) {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed?.message || fallback;
    } catch {
      return fallback;
    }
  }
  return error?.response?.data?.message || error?.message || fallback;
}

export const studentName = (student) =>
  student?.fullName || student?.name || student?.studentId || 'Student';

// Ethiopian mobile numbers are stored abroad as +251 9XX XXX XXX. The registrar
// requires one before a student is admitted, so the field is normalised on the way in
// and shown in that form everywhere.
export function normalizePhoneInput(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  if (text.startsWith('+251')) return text;
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 9) return `+251${digits}`;
  if (digits.length === 12 && digits.startsWith('251')) return `+${digits}`;
  return text;
}

export function isValidEthiopianPhone(value) {
  const normalized = normalizePhoneInput(value);
  return /^\+251\d{9}$/.test(normalized);
}

export async function toJpegFile(file, { size = 600, quality = 0.92 } = {}) {
  const bitmap = await createImageBitmap(file);
  try {
    // 2 x 2 inches standard passport photo: 1:1 aspect ratio square (600x600 px at 300 DPI)
    const minDim = Math.min(bitmap.width, bitmap.height);
    const sx = Math.max(0, Math.round((bitmap.width - minDim) / 2));
    const sy = Math.max(0, Math.round((bitmap.height - minDim) / 2));

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(bitmap, sx, sy, minDim, minDim, 0, 0, size, size);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('The photo could not be prepared for upload.');
    return new File([blob], `${String(file.name || 'student').replace(/\.[^.]+$/, '')}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close?.();
  }
}

export function phoneError(value) {
  if (value == null || String(value).trim() === '') return 'Phone number is required.';
  if (!isValidEthiopianPhone(value)) return 'Enter a valid Ethiopian mobile number, e.g. +251 912 345 678.';
  return '';
}

export const studentOptionLabel = (student) =>
  [student?.fullName, student?.studentId].filter(Boolean).join(' Â· ');

export async function fetchAllOptions() {
  return (await api.get(`${REGISTRAR}/students/options`)).data;
}

export const emptyPage = {
  rows: [],
  pagination: { page: 1, limit: 20, total: 0, pages: 1 },
};

// Empty date inputs must be omitted, not sent as "" or null: the server coerces dates and
// would otherwise receive an invalid date or the Unix epoch.
export const cleanPayload = (value) =>
  Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined && field !== ''),
  );


