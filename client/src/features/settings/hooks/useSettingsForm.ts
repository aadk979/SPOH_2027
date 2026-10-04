import { RuntimeSettings } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useSettings, useSaveSettings } from '../queries';
import { useSettingsBaseline } from './useSettingsBaseline';
import {
  EMPTY_SETTINGS,
  hasSettingsChanges,
  toSettingsPatch,
  toSettingsRequest,
} from '../model/settingsValues';
export function useSettingsForm(enabled: boolean) {
  const settings = useSettings(enabled);
  const save = useSaveSettings();
  const form = useZodForm(RuntimeSettings, EMPTY_SETTINGS);
  const { original, accept } = useSettingsBaseline({
    enabled,
    settings: settings.data?.settings,
    values: form.values,
    reset: form.reset,
  });
  const canSave =
    enabled &&
    !!original &&
    !!settings.data &&
    !settings.isError &&
    !save.isPending &&
    hasSettingsChanges(form.values, original);

  function onSave(): void {
    if (!canSave || !original) return;
    const parsed = form.validate(toSettingsRequest(form.values));
    if (!parsed) return;
    const patch = toSettingsPatch(parsed, original);
    if (Object.keys(patch).length === 0) return;
    save.mutate(patch, {
      onSuccess: (response) => accept(response.settings),
    });
  }
  return {
    settings,
    save,
    values: form.values,
    errors: form.errors,
    setField: form.setField,
    hasErrors: Object.values(form.errors).some(Boolean),
    canSave,
    onSave,
  };
}
export type SettingsForm = ReturnType<typeof useSettingsForm>;
