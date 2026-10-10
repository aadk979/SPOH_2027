import type { ScopedOperationalSettingKey, ScopedSettingsReadResponse } from '@spoh/shared';
import { scopedSettingRow } from '@/shared/lib/scopedSettingReview';
import { scopedSettingFailure } from './scopedSettingChange';
import {
  catalogueField,
  catalogueInputValue,
  type CatalogueInput,
} from '@/shared/lib/settingField';
export {
  catalogueField,
  catalogueFieldFromSchema,
  catalogueFieldHint,
  catalogueInputValue,
  catalogueProposedValue,
  type CatalogueField,
  type CatalogueInput,
} from '@/shared/lib/settingField';
export type CatalogueEditAction = { operation: 'set' | 'reset'; key: ScopedOperationalSettingKey };
export function catalogueEditBody(input: {
  current: ScopedSettingsReadResponse;
  action: CatalogueEditAction;
  fields: { reason: string; proposed: CatalogueInput };
}) {
  const body = {
    target: input.current.target,
    key: input.action.key,
    operation: input.action.operation,
    expectedVersion: scopedSettingRow(input.current, input.action.key).storedVersion,
    reason: input.fields.reason.trim(),
  };
  const field = catalogueField(input.action.key);
  return input.action.operation === 'set'
    ? { ...body, value: field ? catalogueInputValue(field, input.fields.proposed) : undefined }
    : body;
}
export function catalogueEditBlocked(input: {
  current: ScopedSettingsReadResponse;
  action: CatalogueEditAction;
  stale: boolean;
  readUnavailable: boolean;
}) {
  return (
    input.stale ||
    input.readUnavailable ||
    input.current.eventStatus === 'ARCHIVED' ||
    (input.action.operation === 'set' && !catalogueField(input.action.key)) ||
    (input.action.operation === 'reset' &&
      scopedSettingRow(input.current, input.action.key).storedVersion === 0)
  );
}
export function catalogueEditFailure(failure: unknown) {
  return scopedSettingFailure(failure, 'Catalogue settings');
}
