import { ScopedSettingsMutationRequest, type ScopedSettingsReadResponse } from '@spoh/shared';
import { scopedSettingRow, scopedSettingReviewChanged } from '@/shared/lib/scopedSettingReview';
import {
  catalogueEditBlocked,
  catalogueEditBody,
  catalogueEditFailure,
  catalogueField,
  type CatalogueEditAction,
  type CatalogueInput,
} from '../model/catalogueEdit';
import { useScopedSettingChange } from './useScopedSettingChange';
import { useScopedReviewDraft } from './useScopedReviewDraft';

function initialProposal(
  current: ScopedSettingsReadResponse,
  action: CatalogueEditAction,
): CatalogueInput {
  const value = scopedSettingRow(current, action.key).value;
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' || typeof value === 'boolean' ? value : [...value];
}
export function useCatalogueEdit(input: {
  current: ScopedSettingsReadResponse;
  action: CatalogueEditAction;
  loadCurrent: () => Promise<ScopedSettingsReadResponse | null>;
  readUnavailable: boolean;
}) {
  const change = useScopedSettingChange(catalogueEditFailure);
  const draft = useScopedReviewDraft({
    ...input,
    schema: ScopedSettingsMutationRequest,
    initialValues: { reason: '', proposed: initialProposal(input.current, input.action) },
    errorFields: { value: 'proposed' },
    onReview: change.reset,
    onError: change.fail,
    unavailableMessage: 'Current catalogue values are unavailable. Reload before reviewing.',
  });
  const stale = scopedSettingReviewChanged(
    scopedSettingRow(draft.reviewed, input.action.key),
    scopedSettingRow(input.current, input.action.key),
  );
  const disabled =
    change.denied ||
    change.blocked ||
    change.mutation.isPending ||
    change.mutation.isSuccess ||
    draft.loading ||
    (!change.uncertain && catalogueEditBlocked({ ...input, stale }));
  function submit() {
    if (disabled) return;
    if (change.uncertain) {
      change.retry();
      return;
    }
    if (!draft.confirmed) return;
    const body = catalogueEditBody({
      current: draft.reviewed,
      action: input.action,
      fields: draft.form.values,
    });
    const parsed = draft.form.validate({ ...body, idempotencyKey: change.keyFor(body) });
    if (parsed) change.apply({ kind: 'change', body: parsed });
  }
  return { ...change, ...draft, stale, disabled, submit, field: catalogueField(input.action.key) };
}
