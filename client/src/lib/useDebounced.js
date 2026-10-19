import { useEffect, useState } from 'react';

// Typing should not fire a request per keystroke. The value settles first, and only then
// does anything ask the server.
export function useDebounced(value, delay = 300) {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return settled;
}

export default useDebounced;
