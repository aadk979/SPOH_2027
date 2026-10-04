import { useEffect, useRef } from 'react';
import type { RuntimeSettings } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { hasSettingsChanges, toSettingsValues, type SettingsValues } from '../model/settingsValues';

/** Retain the draft's original values until it is saved or its event changes. */
export function useSettingsBaseline(input: {
  enabled: boolean;
  settings: RuntimeSettings | undefined;
  values: SettingsValues;
  reset: (values?: SettingsValues) => void;
}) {
  const eventId = useEventId();
  const baseline = useRef<{ eventId: string; settings: RuntimeSettings } | undefined>(undefined);
  const { enabled, settings, values, reset } = input;
  // A refresh may update an untouched form, but must not replace an edited
  // draft or turn another admin's unrelated changes into this draft's patch.
  // Only new server values/event/session drive seeding; reset is recreated.
  useEffect(() => {
    if (!enabled) {
      baseline.current = undefined;
      reset();
      return;
    }
    if (!settings) return;
    const previous = baseline.current;
    if (previous?.eventId === eventId && hasSettingsChanges(values, previous.settings)) return;
    baseline.current = { eventId, settings };
    reset(toSettingsValues(settings));
  }, [settings, eventId, enabled]);

  function accept(settings: RuntimeSettings): void {
    if (baseline.current?.eventId !== eventId) return;
    baseline.current = { eventId, settings };
    reset(toSettingsValues(settings));
  }
  const original = baseline.current?.eventId === eventId ? baseline.current.settings : undefined;
  return { original, accept };
}
