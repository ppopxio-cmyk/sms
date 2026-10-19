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
