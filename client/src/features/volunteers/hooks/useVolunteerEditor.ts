import { useZodForm } from '@/shared/hooks/useZodForm';
import { UpdateVolunteerRequest, DeactivateVolunteerRequest } from '@spoh/shared';
import { type CommitteeRole, type VolunteerAdminRecord } from '@spoh/shared';

import {
  useDeactivateVolunteer,
  useReactivateVolunteer,
  useUpdateVolunteer,
} from '@/features/volunteers';

export function useVolunteerEditor(volunteer: VolunteerAdminRecord) {
  const update = useUpdateVolunteer();
  const deactivate = useDeactivateVolunteer();
  const reactivate = useReactivateVolunteer();

  const fields = useZodForm(UpdateVolunteerRequest, {
    role: volunteer.role,
    phone: volunteer.phone ?? '',
    portfolio: volunteer.portfolio ?? '',
  });
  const withdrawal = useZodForm(DeactivateVolunteerRequest, { reason: '' });
  const { role, phone, portfolio } = fields.values;
  const { reason } = withdrawal.values;
  const setRole = (value: CommitteeRole) => fields.setField('role', value);
  const setPhone = (value: string) => fields.setField('phone', value);
  const setPortfolio = (value: string) => fields.setField('portfolio', value);
  const setReason = (value: string) => withdrawal.setField('reason', value);
  function save(): void {
    const patch = fields.validate({
      role,
      phone: phone.trim() || null,
      portfolio: portfolio.trim() || null,
    });
    if (patch) update.mutate({ id: volunteer.id, patch });
  }
  function withdraw(): void {
    const body = withdrawal.validate({ reason: reason.trim(), disableIdentity: true });
    if (body) deactivate.mutate({ id: volunteer.id, body });
  }

  const pending = update.isPending || deactivate.isPending || reactivate.isPending;
  const error = update.error ?? deactivate.error ?? reactivate.error;

  return {
    save,
    withdraw,
    errors: { ...fields.errors, ...withdrawal.errors },
    update,
    deactivate,
    reactivate,
    role,
    setRole,
    phone,
    setPhone,
    portfolio,
    setPortfolio,
    reason,
    setReason,
    pending,
    error,
  };
}
export type VolunteerEditorState = ReturnType<typeof useVolunteerEditor>;
