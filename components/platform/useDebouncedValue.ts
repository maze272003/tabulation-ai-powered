import { useEffect, useState } from "react";

/**
 * Debounce a fast-changing value (e.g. a search input) so downstream
 * subscriptions do not re-fire on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
