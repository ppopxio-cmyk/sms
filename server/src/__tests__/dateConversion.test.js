import { describe, it, expect } from 'vitest';
import {
  toEthiopian,
  fromEthiopian,
  formatEthiopian,
  parseEATDate,
  toEATDateKey,
  ETH_MONTHS,
} from '../utils/ethiopianDate.js';

describe('Ethiopian Date & Boundary Conversion Suite', () => {
  it('converts Gregorian 2026-11-19 to Ethiopian Hidar 10, 2019', () => {
    const eth = toEthiopian(new Date('2026-11-19T12:00:00Z'));
    expect(eth.year).toBe(2019);
    expect(eth.month).toBe(3); // Hidar is month 3
    expect(eth.day).toBe(10);
    expect(ETH_MONTHS[eth.month - 1]).toBe('Hidar');
  });

  it('formats Gregorian 2026-11-19 as "Hidar 10, 2019"', () => {
    const formatted = formatEthiopian(new Date('2026-11-19T12:00:00Z'));
    expect(formatted).toBe('Hidar 10, 2019');
  });

  it('keeps start of day and end of day within the same Ethiopian date (no day skipping)', () => {
    const startOfDay = parseEATDate('2026-11-19', false);
    const endOfDay = parseEATDate('2026-11-19', true);

    const ethStart = toEthiopian(startOfDay);
    const ethEnd = toEthiopian(endOfDay);

    expect(ethStart.year).toBe(2019);
    expect(ethStart.month).toBe(3);
    expect(ethStart.day).toBe(10);

    expect(ethEnd.year).toBe(2019);
    expect(ethEnd.month).toBe(3);
    expect(ethEnd.day).toBe(10);

    expect(formatEthiopian(startOfDay)).toBe('Hidar 10, 2019');
    expect(formatEthiopian(endOfDay)).toBe('Hidar 10, 2019');
  });

  it('correctly formats date keys to EAT YYYY-MM-DD', () => {
    const endOfDay = parseEATDate('2026-11-19', true);
    expect(toEATDateKey(endOfDay)).toBe('2026-11-19');
  });

  it('converts back and forth between Ethiopian and Gregorian without drift', () => {
    const original = { year: 2019, month: 2, day: 15 }; // Tikimt 15, 2019
    const greg = fromEthiopian(original.year, original.month, original.day, 12, 0, 0);
    const convertedBack = toEthiopian(greg);

    expect(convertedBack.year).toBe(original.year);
    expect(convertedBack.month).toBe(original.month);
    expect(convertedBack.day).toBe(original.day);
  });
});
