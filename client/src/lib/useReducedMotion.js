import { useEffect, useState } from 'react';

const query = '(prefers-reduced-motion: reduce)';

// Recharts animates every series by default. The CSS turns decorative motion off for
// people who ask for less of it; this keeps the charts in step with that choice.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const onChange = () => setReduced(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}

export default useReducedMotion;
