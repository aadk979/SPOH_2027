import {
  ScopedSettingsRevertRequest,
  type ScopedSettingsReadResponse,
  type ScopedSettingsHistoryRecord,
} from '@spoh/shared';
import { scopedSettingRow, scopedSettingReviewChanged } from '@/shared/lib/scopedSettingReview';
import {
  catalogueRestoreBlocked,
  catalogueRestoreBody,
  catalogueRestoreFailure,
} from '../model/catalogueRestore';
import { useScopedSettingChange } from './useScopedSettingChange';
import { useScopedReviewDraft } from './useScopedReviewDraft';

export function useCatalogueRestore(input: {
  current: ScopedSettingsReadResponse;
  history: ScopedSettingsHistoryRecord;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  readUnavailable: boolean;
}) {
  const change = useScopedSettingChange(catalogueRestoreFailure);
  const draft = useScopedReviewDraft({
    ...input,
    schema: ScopedSettingsRevertRequest,
    onReview: change.reset,
    onError: change.fail,
    unavailableMessage: 'Current catalogue values are unavailable. Reload before reviewing.',
  });
  const stale = scopedSettingReviewChanged(
    scopedSettingRow(draft.reviewed, input.history.key),
    scopedSettingRow(input.current, input.history.key),
  );
  const disabled =
    change.denied ||
    change.blocked ||
    change.mutation.isPending ||
    change.mutation.isSuccess ||
    draft.loading ||
    (!change.uncertain && catalogueRestoreBlocked({ ...input, stale }));
  function submit() {
    if (disabled) return;
    if (change.uncertain) {
      change.retry();
      return;
    }
    if (!draft.confirmed) return;
    const body = catalogueRestoreBody({
      current: draft.reviewed,
      history: input.history,
      reason: draft.form.values.reason,
    });
    const parsed = draft.form.validate({ ...body, idempotencyKey: change.keyFor(body) });
    if (parsed) change.apply({ kind: 'restore', body: parsed });
  }
  return { ...change, ...draft, stale, disabled, submit };
}
