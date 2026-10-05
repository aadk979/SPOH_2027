import { captureFailure } from '../model/captureControl';
import { useScopedSettingChange } from './useScopedSettingChange';

export function useCaptureChange() {
  return useScopedSettingChange(captureFailure);
}
