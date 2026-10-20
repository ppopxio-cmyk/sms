import { useEffect, useState } from 'react';

// A tiny ticking clock. It is used by live timestamps and "updated N seconds ago"
// labels, not by data fetching; React Query owns refresh intervals.
export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);

  return now;
}

export function useLiveTimestamp(value, interval = 30_000) {
  const now = useNow(interval);
  if (!value) return '';
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
