import { useEffect, useRef } from 'react';

/** Inline review replaces its opener; restore the new opener after cancellation. */
export function useReviewFocus(open: boolean) {
  const origin = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open && document.activeElement === document.body) origin.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return origin;
}
