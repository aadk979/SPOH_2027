import type { ScopedSettingsReadResponse } from '@spoh/shared';
import { captureReviewSchema, type CaptureAction } from '../model/captureControl';
import { useScopedReviewDraft } from './useScopedReviewDraft';

export function useCaptureReviewDraft(input: {
  current: ScopedSettingsReadResponse;
  action: CaptureAction;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  onReview: () => void;
  onError: (message: string) => void;
}) {
  return useScopedReviewDraft({
    ...input,
    schema: captureReviewSchema(input.action),
    initialValues: { reason: '' },
    unavailableMessage: 'Current capture settings are unavailable. Reload before reviewing.',
  });
}
