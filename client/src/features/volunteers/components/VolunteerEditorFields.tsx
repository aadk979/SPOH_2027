import { type ReactNode } from 'react';
import { type CommitteeRole, type VolunteerAdminRecord } from '@spoh/shared';

import { Field, Input, Select } from '@/shared/ui';

import { ROLE_LABELS } from '@/features/volunteers';

import type { VolunteerEditorState } from '../hooks/useVolunteerEditor';
export function VolunteerEditorFields({
  volunteer,
  form,
}: {
  volunteer: VolunteerAdminRecord;
  form: VolunteerEditorState;
}): ReactNode {
  const { role, setRole, phone, setPhone, portfolio, setPortfolio } = form;
  return (
    <>
      <div className="grid gap-sm sm:grid-cols-3">
        <Field id={`role-${volunteer.id}`} label="Committee role" error={form.errors.role}>
          {(props) => (
            <Select
              {...props}
              value={role}
              onChange={(event) => setRole(event.target.value as CommitteeRole)}
            >
              {ROLE_LABELS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id={`phone-${volunteer.id}`} label="Phone" error={form.errors.phone} optional>
          {(props) => (
            <Input
              {...props}
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </Field>

        <Field
          id={`portfolio-${volunteer.id}`}
          label="Portfolio"
          error={form.errors.portfolio}
          optional
        >
          {(props) => (
            <Input
              {...props}
              value={portfolio}
              onChange={(event) => setPortfolio(event.target.value)}
            />
          )}
        </Field>
      </div>
    </>
  );
}
