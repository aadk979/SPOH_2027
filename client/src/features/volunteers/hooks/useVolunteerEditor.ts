import { useState } from 'react';
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

  const [role, setRole] = useState<CommitteeRole>(volunteer.role);
  const [phone, setPhone] = useState(volunteer.phone ?? '');
  const [portfolio, setPortfolio] = useState(volunteer.portfolio ?? '');
  const [reason, setReason] = useState('');

  const pending = update.isPending || deactivate.isPending || reactivate.isPending;
  const error = update.error ?? deactivate.error ?? reactivate.error;

  return {
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
