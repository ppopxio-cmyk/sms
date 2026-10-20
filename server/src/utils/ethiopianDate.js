const TZ = 'Africa/Addis_Ababa';

export const ETH_MONTHS = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit',
  'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume',
];

export const ETH_MONTHS_AM = [
  'መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት',
  'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ',
];

function julianDay(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

export function toEthiopian(input = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
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

// Downloads use the same calendar as the screens, so a date in an export cannot be
// mistaken for a different day in the interface.
export function formatEthiopian(input = new Date(), { time = false } = {}) {
  if (!input) return '—';
  const { year, month, day } = toEthiopian(input);
  const date = `${ETH_MONTHS[month - 1]} ${day}, ${year}`;
  if (!time) return date;
  const clock = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(input));
  return `${date}, ${clock}`;
}

// Kept for any future Amharic-only surface. Downloads deliberately use formatEthiopian
// above so exported labels and dates remain English.
export function formatEthiopianAmharic(input = new Date(), { time = false } = {}) {
  if (!input) return '—';
  const { year, month, day } = toEthiopian(input);
  const date = `${day} ${ETH_MONTHS_AM[month - 1]} ${year}`;
  if (!time) return date;
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(input));
  return `${date}፣ ${clock}`;
}
