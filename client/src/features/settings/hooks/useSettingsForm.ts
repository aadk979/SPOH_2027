import { useEffect, useState } from 'react';
import { useSettings, useSaveSettings } from '../queries';
import { NUMERIC_FIELDS } from '../model/numericFields';
import { buildSettingsPatch } from '../model/buildSettingsPatch';
export function useSettingsForm(enabled: boolean) {
  const settings = useSettings(enabled);
  const save = useSaveSettings();

  const [eventName, setEventName] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [morning, setMorning] = useState({ start: '', end: '' });
  const [afternoon, setAfternoon] = useState({ start: '', end: '' });
  const [validationError, setValidationError] = useState<string | null>(null);

  // Seed the form once the current values arrive; a controlled input cannot
  // start empty and later adopt a value without this.
  useEffect(() => {
    const current = settings.data?.settings;
    if (!current) return;

    setEventName(current.eventName ?? '');
    setDraft(
      Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, String(current[field.key])])),
    );
    setMorning(current.shiftBlocks.MORNING);
    setAfternoon(current.shiftBlocks.AFTERNOON);
  }, [settings.data]);

  function onSave(): void {
    setValidationError(null);
    const result = buildSettingsPatch({ eventName, draft, morning, afternoon });
    if ('error' in result) {
      setValidationError(result.error);
      return;
    }
    save.mutate(result.patch);
  }
  return {
    settings,
    save,
    eventName,
    setEventName,
    draft,
    setDraft,
    morning,
    setMorning,
    afternoon,
    setAfternoon,
    validationError,
    onSave,
  };
}
export type SettingsForm = ReturnType<typeof useSettingsForm>;
