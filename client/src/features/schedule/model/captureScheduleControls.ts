import type {
  CaptureScheduleRecord,
  ScopedSettingsReadResponse,
  ScopedOperationalSettingKey,
} from '@spoh/shared';
import type { CaptureScheduleAction } from './captureScheduleReview';

export type CaptureScheduleControlsInput = {
  settingKey?: ScopedOperationalSettingKey;
  current: ScopedSettingsReadResponse;
  readUnavailable: boolean;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  onApplied: (current: ScopedSettingsReadResponse) => void;
  onClose: () => void;
  onDenied: () => void;
  onLockChange: (locked: boolean) => void;
};
export type CaptureScheduleReviewInput = {
  action: CaptureScheduleAction;
  current: ScopedSettingsReadResponse;
  latest?: CaptureScheduleRecord;
  timezone: string;
  readUnavailable: boolean;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  onApplied: (current: ScopedSettingsReadResponse) => void;
  refreshSchedules: () => Promise<void>;
};
