import { useEffect, useRef, useState } from 'react';
const IDLE_NUDGE_MS = 20 * 60 * 1000;
export function useIdleNudge(sessionCount: number) {
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdle = (): void => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_NUDGE_MS);
  };

  useEffect(() => {
    resetIdle();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // Restart the idle clock whenever a tap lands.
  }, [sessionCount]);

  return { idle, resetIdle };
}
