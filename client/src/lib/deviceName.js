// What a browser will say about itself, and what a person can say that a browser cannot.
// A laptop's hardware model is invisible to every website, so a row either shows what was
// detected, what somebody named it, or says plainly that the model is not available.
export const deviceTitle = (s) =>
  s.deviceLabel || s.deviceName || `${s.browser ?? 'Unknown browser'} on ${s.os ?? 'unknown system'}`;

export const deviceSubtitle = (s) => {
  if (!s.deviceLabel && !s.deviceName) return '';
  return [s.browser, s.os].filter(Boolean).join(' · ');
};

export const modelBadge = (s) => {
  if (s.deviceLabel) return { text: 'Named', tone: 'neutral' };
  if (s.deviceModelSource === 'catalogue') return { text: 'Model detected', tone: 'success' };
  if (!s.deviceModelSource || s.deviceModelSource === 'unavailable') return { text: 'Model unavailable', tone: 'neutral' };
  return null;
};

export const placeLine = (s) => {
  const place = s.location || 'Unknown place';
  return s.locationSource === 'device' ? `${place} · shared by this device` : `${place} · estimated`;
};
