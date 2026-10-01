import { useEffect } from 'react';
import { RuntimeSettings } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useSettings, useSaveSettings } from '../queries';
import { EMPTY_SETTINGS, toSettingsRequest, toSettingsValues } from '../model/settingsValues';
export function useSettingsForm(enabled: boolean) {
  const settings = useSettings(enabled);
  const save = useSaveSettings();
  const form = useZodForm(RuntimeSettings, EMPTY_SETTINGS);
  const { reset } = form;

  // Seed the form once the current values arrive; a controlled input cannot
  // start empty and later adopt a value without this. `reset` is deliberately
  // not a dependency: it is recreated every render, and only new server values
  // should replace what the admin is typing.
  useEffect(() => {
    const current = settings.data?.settings;
    if (current) reset(toSettingsValues(current));
  }, [settings.data]);

  function onSave(): void {
    const patch = form.validate(toSettingsRequest(form.values));
    if (patch) save.mutate(patch);
  }
  return {
    settings,
    save,
    values: form.values,
    errors: form.errors,
    setField: form.setField,
    hasErrors: Object.values(form.errors).some(Boolean),
    onSave,
  };
}
export type SettingsForm = ReturnType<typeof useSettingsForm>;
