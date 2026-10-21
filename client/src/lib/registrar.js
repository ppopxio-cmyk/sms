import { api } from './api';
import { formatEthiopian } from './ethiopianDate';

export const REGISTRAR = '/registrar';
export const registrarPath = (path) => `/registrar${path}`;

export const qualificationLabel = (type) =>
  ({ degree: 'Degree', diploma: 'Diploma', 'short-term': 'Short-term' }[type] ?? type ?? '—');

export const levelLabel = (level, qualificationType) => {
  if (!level) return '—';
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

export const displayDate = (value) => (value ? formatEthiopian(value) : '—');

export const displayDateTime = (value) =>
  value ? formatEthiopian(value, { time: true }) : '—';

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
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) || '—';

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

export const studentOptionLabel = (student) =>
  [student?.fullName, student?.studentId].filter(Boolean).join(' · ');

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

