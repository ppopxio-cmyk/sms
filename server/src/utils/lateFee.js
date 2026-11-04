/**
 * Overdue Late Fee calculation for College Monthly Fee Cycles:
 * - On or before Due Date: 0 ETB penalty
 * - Overdue Day 1: +20 ETB
 * - Overdue Day 2: +40 ETB (doubles: 20 * 2^1)
 * - Overdue Day 3: +80 ETB (20 * 2^2)
 * - Overdue Day 4: +160 ETB (20 * 2^3)
 * - Overdue Day 5: +320 ETB (20 * 2^4)
 * - After 5 days (Day 6+): does NOT double; adds fixed +50 ETB per additional day (320 + (days - 5) * 50)
 *
 * @param {Date|string} dueAt Due date timestamp
 * @param {number} baseAmountSantim Base charge amount in integer santim
 * @returns {{ daysOverdue: number, penaltyEtb: number, penaltySantim: number, totalAmountSantim: number }}
 */
export function calculateOverdueLateFee(dueAt, baseAmountSantim = 0) {
  const base = Math.max(0, Math.round(Number(baseAmountSantim) || 0));
  if (!dueAt) {
    return { daysOverdue: 0, penaltyEtb: 0, penaltySantim: 0, totalAmountSantim: base };
  }

  const now = Date.now();
  const dueTime = new Date(dueAt).getTime();
  const diffMs = now - dueTime;

  if (diffMs <= 0) {
    return { daysOverdue: 0, penaltyEtb: 0, penaltySantim: 0, totalAmountSantim: base };
  }

  // Number of calendar days past the due date (1-indexed: starts at 1 immediately after midnight of due date)
  const daysOverdue = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;

  let penaltyEtb = 0;
  if (daysOverdue === 1) {
    penaltyEtb = 20;
  } else if (daysOverdue === 2) {
    penaltyEtb = 40;
  } else if (daysOverdue === 3) {
    penaltyEtb = 80;
  } else if (daysOverdue === 4) {
    penaltyEtb = 160;
  } else if (daysOverdue === 5) {
    penaltyEtb = 320;
  } else if (daysOverdue > 5) {
    // After 5 days, do not double anymore; add fixed 50 ETB per day
    penaltyEtb = 320 + (daysOverdue - 5) * 50;
  }

  const penaltySantim = penaltyEtb * 100;
  const totalAmountSantim = base + penaltySantim;

  return {
    daysOverdue,
    penaltyEtb,
    penaltySantim,
    totalAmountSantim,
  };
}
