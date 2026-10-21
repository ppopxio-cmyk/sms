const TZ = 'Africa/Addis_Ababa';

export const ETH_MONTHS = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit',
  'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume',
];

function julianDay(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

export function toEthiopian(input = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(input))
    .split('-')
    .map(Number);
  const jdn = julianDay(parts[0], parts[1], parts[2]);
  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  return {
    year: 4 * Math.floor((jdn - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    month: Math.floor(n / 30) + 1,
    day: (n % 30) + 1,
  };
}

export function formatEthiopian(input = new Date(), { time = false } = {}) {
  if (!input) return '—';
  const { year, month, day } = toEthiopian(input);
  const date = `${ETH_MONTHS[month - 1]} ${day}, ${year}`;
  if (!time) return date;
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(input));
  return `${date}, ${clock}`;
}

// A date field starts from a stored Gregorian key and shows the Ethiopian calendar. The
// reverse search is deliberately small: it compares real formatted dates, so leap years
// and Pagume are handled by the same conversion used everywhere else on the screen.
export function fromEthiopian({ year, month, day } = {}) {
  const targetYear = Number(year);
  const targetMonth = Number(month);
  const targetDay = Number(day);
  if (!targetYear || !targetMonth || !targetDay) return null;

  let low = Date.UTC(1800, 0, 1, 12);
  let high = Date.UTC(2200, 11, 31, 12);
  while (low <= high) {
    const middle = low + Math.floor((high - low) / (2 * 86_400_000)) * 86_400_000;
    const value = toEthiopian(new Date(middle));
    const order =
      value.year - targetYear ||
      value.month - targetMonth ||
      value.day - targetDay;
    if (order === 0) return new Date(middle);
    if (order < 0) low = middle + 86_400_000;
    else high = middle - 86_400_000;
  }
  return null;
}

export function dateKeyToEthiopian(key) {
  if (!key) return toEthiopian();
  return toEthiopian(new Date(`${key}T12:00:00+03:00`));
}

export function ethiopianToDateKey(parts) {
  const date = fromEthiopian(parts);
  return date ? date.toISOString().slice(0, 10) : '';
}

export function formatEthiopianKey(key, options) {
  if (!key) return '—';
  return formatEthiopian(new Date(`${key}T12:00:00+03:00`), options);
}

// Chart axes need a smaller label than a sentence. The month is abbreviated, the year is
// carried by the range already on screen, and the day is enough to read the trend.
export function formatEthiopianShort(input = new Date()) {
  if (!input) return '—';
  const { month, day } = toEthiopian(input);
  return `${ETH_MONTHS[month - 1].slice(0, 3)} ${day}`;
}

export function timeAgo(input) {
  if (!input) return '—';
  const diff = Date.now() - new Date(input).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
