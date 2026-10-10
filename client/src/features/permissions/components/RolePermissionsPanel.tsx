'use client';
import { useState, type ReactNode } from 'react';
import type { RolePermissionsResponse } from '@spoh/shared';
import { roleLabel } from '@/features/volunteers';
import { Callout, Checkbox, Field, Section, Select, Stack, StatusText } from '@/shared/ui';
import { useChangeRolePermission } from '../queries';
import { asLine, canToggle, cellState, groupedRows } from '../model/permissionTable';

type Table = RolePermissionsResponse['data'];
type Role = Table['roles'][number]['role'];

/**
 * What one role may do in this event, grouped by kind of work (P11.7). A platform admin toggles
 * an Editable action for any role at or above its minimum; everything else is shown, not
 * editable. One role at a time keeps it readable on a phone.
 */
export function RolePermissionsPanel({ table }: { table: Table }): ReactNode {
  const [role, setRole] = useState<Role>('VOLUNTEER');
  const change = useChangeRolePermission();
  const column = table.roles.find((entry) => entry.role === role) ?? table.roles[0];
  if (!column) return null;
  const toggle = (action: Table['actions'][number]['action'], granted: boolean) =>
    change.mutate({ role, action, granted, idempotencyKey: crypto.randomUUID() });

  return (
    <Section
      title="What each role can do"
      description={
        table.canEdit
          ? 'Changes apply to the next request each member makes.'
          : 'Only platform admins change these.'
      }
    >
      <Stack>
        <Field id="permission-role" label="Role">
          {(props) => (
            <Select
              {...props}
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {table.roles.map((entry) => (
                <option key={entry.role} value={entry.role}>
                  {roleLabel(entry.role)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {change.isError ? (
          <Callout tone="alert" role="alert">
            {change.error instanceof Error ? change.error.message : 'The change was not saved.'}
          </Callout>
        ) : null}
        {groupedRows(table).map(({ group, rows }) => (
          <fieldset key={group} className="grid gap-xxs">
            <legend className="text-caption font-semibold text-text-muted">{group}</legend>
            {rows.map((row) => {
              const state = cellState(row, column, table);
              if (state === 'fixed' || state === 'below-minimum') {
                return (
                  <p key={row.action} className="flex min-h-control items-center gap-sm">
                    <span>{asLine(row.label)}</span>
                    <StatusText tone="neutral">
                      {state === 'fixed' ? 'fixed' : `from ${roleLabel(row.minimumRole ?? role)}`}
                    </StatusText>
                  </p>
                );
              }
              return (
                <Checkbox
                  key={row.action}
                  label={asLine(row.label)}
                  checked={state === 'granted'}
                  disabled={!canToggle(state, table.canEdit) || change.isPending}
                  onChange={(event) => toggle(row.action, event.target.checked)}
                />
              );
            })}
          </fieldset>
        ))}
        <StatusText tone="neutral">
          {column.anyStation
            ? `${roleLabel(role)} may capture at any station, off their roster.`
            : `${roleLabel(role)} captures only at stations they are on shift at.`}
        </StatusText>
      </Stack>
    </Section>
  );
}

/** The rules no grant overrides, read-only with why. */
export function GuardrailsPanel({ table }: { table: Table }): ReactNode {
  return (
    <Section title="Always enforced" description="No permission overrides these.">
      <ul className="grid list-disc gap-xxs pl-lg">
        {table.guardrails.map((guardrail) => (
          <li key={guardrail.id}>{guardrail.explanation}</li>
        ))}
      </ul>
    </Section>
  );
}
