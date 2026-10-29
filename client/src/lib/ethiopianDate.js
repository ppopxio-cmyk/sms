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

export function jdnToGregorian(jdn) {
  const l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  const l2 = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l2 + 1)) / 1461001);
  const l3 = l2 - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l3) / 2447);
  const d = l3 - Math.floor((2447 * j) / 80);
  const l4 = Math.floor(j / 11);
  const m = j + 2 - 12 * l4;
  const y = 100 * (n - 49) + i + l4;
  return { year: y, month: m, day: d };
}

export function fromEthiopian(yearOrObj, month, day, hour = 12, minute = 0, second = 0) {
  let y = typeof yearOrObj === 'object' ? yearOrObj?.year : yearOrObj;
  let m = typeof yearOrObj === 'object' ? yearOrObj?.month : month;
  let d = typeof yearOrObj === 'object' ? yearOrObj?.day : day;
  y = Number(y);
  m = Number(m);
  d = Number(d);
  if (!y || !m || !d) return null;
  const jdn = 1723856 + 365 * y + Math.floor(y / 4) + 30 * (m - 1) + d - 1;
  const g = jdnToGregorian(jdn);
  return new Date(Date.UTC(g.year, g.month - 1, g.day, hour - 3, minute, second));
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
