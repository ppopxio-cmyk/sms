import { formatEthiopianKey } from './ethiopianDate';

export const TERM_LABELS = {
  '1': 'Term 1',
  '2': 'Term 2',
  '3': 'Term 3',
  semester1: 'Semester 1',
  semester2: 'Semester 2',
  annual: 'Annual',
};

export const termLabel = (term) => TERM_LABELS[term] ?? (term ? String(term) : '—');

export const classTitle = (row) => {
  if (!row) return 'Class';
  return [row.courseCode, row.courseTitle].filter(Boolean).join(' · ') || 'Class';
};

export const classMeta = (row) =>
  [row.program, row.academicYear, termLabel(row.term), row.level ? `Level ${row.level}` : '']
    .filter(Boolean)
    .join(' · ');

export const periodLabel = (period) => {
  if (!period || period === 'day') return 'Full day';
  return String(period).replace('period-', 'Period ');
};

export const assessmentTypeLabel = (type) =>
  ({ quiz: 'Quiz', assignment: 'Assignment', project: 'Project', midterm: 'Midterm', final: 'Final', practical: 'Practical', presentation: 'Presentation', other: 'Other' })[
    type
  ] ?? type ?? 'Assessment';

export const statusTone = (status) => {
  if (['finalized', 'submitted', 'completed'].includes(status)) return 'success';
  if (['published', 'in_progress', 'open'].includes(status)) return 'brand';
  if (['closed', 'late', 'excused'].includes(status)) return 'warning';
  if (['absent'].includes(status)) return 'danger';
  return 'neutral';
};

export const statusLabel = (status) => {
  if (!status) return 'Not marked';
  return String(status)
    .replaceAll('_', ' ')
    .replace(/^\w/, (letter) => letter.toUpperCase());
};

export const errorCode = (error) => error?.response?.data?.code ?? '';

export const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export const displayDate = (key) => formatEthiopianKey(key);
