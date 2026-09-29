import { CreateGroupRegistrationRequest, type VisitorCategory } from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { useMe } from '@/features/session';
import { adjustGroup, groupTotal } from '../model/groupMembers';
import { EMPTY_GROUP, GROUP_ERROR_FIELDS } from '../model/groupRequest';
import { useGroupSubmit } from './useGroupSubmit';
export function useGroupRegistration() {
  const { data: me } = useMe();
  const form = useZodForm(CreateGroupRegistrationRequest, EMPTY_GROUP, GROUP_ERROR_FIELDS);
  const { counts, shortCode } = form.values;
  const stationId = me?.currentAssignment?.station.id;
  const total = groupTotal(counts);
  function adjust(category: VisitorCategory, delta: number): void {
    form.updateField('counts', (current) => adjustGroup(current, category, delta));
  }
  const submission = useGroupSubmit({ stationId, total, values: form.values, form });
  return {
    stationId,
    counts,
    shortCode,
    setShortCode: form.setter('shortCode'),
    errors: form.errors,
    total,
    adjust,
    ...submission,
  };
}
export type GroupRegistrationForm = ReturnType<typeof useGroupRegistration>;
