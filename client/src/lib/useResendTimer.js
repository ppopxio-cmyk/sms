import { useCallback, useEffect, useState } from 'react';

// The server refuses a second code for two minutes, so the button waits exactly that
// long. The deadline is a timestamp in sessionStorage rather than a counter, which is
// what lets a refresh carry on where the countdown had got to.
export const RESEND_SECONDS = 120;

const storageKey = (name) => `sms.resend.${name}`;

function readSentAt(name) {
  try {
    const value = Number(sessionStorage.getItem(storageKey(name)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeSentAt(name, value) {
  try {
    if (value) sessionStorage.setItem(storageKey(name), String(value));
    else sessionStorage.removeItem(storageKey(name));
  } catch {
    // storage blocked: the countdown still works, it just cannot survive a refresh
  }
}

const secondsLeft = (sentAt) => Math.max(0, Math.ceil(RESEND_SECONDS - (Date.now() - sentAt) / 1000));

// "1m 20s" reads better than "80s" for a two-minute wait.
export function formatWait(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${mins}m ${rest}s` : `${mins}m`;
}

export default function useResendTimer(name) {
  const [left, setLeft] = useState(() => {
    const sentAt = readSentAt(name);
    return sentAt ? secondsLeft(sentAt) : 0;
  });

  useEffect(() => {
    if (left <= 0) return undefined;
    const id = setInterval(() => {
      const sentAt = readSentAt(name);
      setLeft(sentAt ? secondsLeft(sentAt) : 0);
    }, 1000);
    return () => clearInterval(id);
  }, [left, name]);

  const start = useCallback(() => {
    const now = Date.now();
    writeSentAt(name, now);
    setLeft(secondsLeft(now));
  }, [name]);

  const clear = useCallback(() => {
    writeSentAt(name, 0);
    setLeft(0);
  }, [name]);

  return { left, start, clear };
}
