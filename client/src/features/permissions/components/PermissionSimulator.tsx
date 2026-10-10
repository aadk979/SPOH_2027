'use client';
import { useState, type ReactNode } from 'react';
import type { Action, RolePermissionsResponse, SimulatePermissionResponse } from '@spoh/shared';
import { useVolunteers } from '@/features/volunteers';
import { Button, Callout, Field, Section, Select, Stack, StatusText } from '@/shared/ui';
import { useMemberPermissions, useSimulatePermission } from '../queries';
import { asLine } from '../model/permissionTable';

type Table = RolePermissionsResponse['data'];

const EVERYONE = { q: '', role: '', active: 'true', sort: 'name' } as const;

/**
 * "Can ⟨person⟩ do ⟨action⟩ now?" with the decision and why, and "What can ⟨person⟩ do?"
 * (P11.7). Both read the same policies and grants the server decides with.
 */
export function PermissionSimulator({ table }: { table: Table }): ReactNode {
  const people = useVolunteers(EVERYONE);
  const [personId, setPersonId] = useState('');
  const [action, setAction] = useState<Action>('Registration.Create');
  const simulate = useSimulatePermission();
  return (
    <Section
      title="Check a permission"
      description="Ask what someone can do, and why a request is refused."
    >
      <Stack>
        <Field id="simulate-person" label="Person">
          {(props) => (
            <Select
              {...props}
              value={personId}
              onChange={(event) => {
                setPersonId(event.target.value);
                simulate.reset();
              }}
            >
              <option value="">Choose someone</option>
              {(people.data?.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ActionField
          table={table}
          action={action}
          onChange={(next) => {
            setAction(next);
            simulate.reset();
          }}
        />
        <Button
          disabled={!personId || simulate.isPending}
          onClick={() => simulate.mutate({ personId, action })}
        >
          Check
        </Button>
        <SimulationResult result={simulate.data?.data} error={simulate.error} />
        {personId ? <MemberCan personId={personId} table={table} /> : null}
      </Stack>
    </Section>
  );
}

function ActionField(input: {
  table: Table;
  action: Action;
  onChange: (action: Action) => void;
}): ReactNode {
  return (
    <Field id="simulate-action" label="Action">
      {(props) => (
        <Select
          {...props}
          value={input.action}
          onChange={(event) => input.onChange(event.target.value as Action)}
        >
          {input.table.actions.map((row) => (
            <option key={row.action} value={row.action}>
              {asLine(row.label)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function SimulationResult(input: {
  result: SimulatePermissionResponse['data'] | undefined;
  error: Error | null;
}): ReactNode {
  if (input.error) {
    return (
      <Callout tone="alert" role="alert">
        {input.error.message || 'Could not check.'}
      </Callout>
    );
  }
  const { result } = input;
  if (!result) return null;
  return (
    <Callout
      tone={result.allowed ? 'ok' : 'alert'}
      title={result.allowed ? 'Allowed' : 'Refused'}
      role="status"
    >
      <p>{result.explanation}</p>
      {result.policies.length > 0 ? (
        <p className="text-caption">Decided by {result.policies.join(', ')}</p>
      ) : null}
    </Callout>
  );
}

/** What the chosen person may do here at all, from the answer their own screens get. */
function MemberCan({ personId, table }: { personId: string; table: Table }): ReactNode {
  const member = useMemberPermissions(personId);
  if (!member.data) return null;
  const labels = Object.entries(member.data.data.actions)
    .filter(([, allowed]) => allowed)
    .map(([id]) => table.actions.find((row) => row.action === id)?.label ?? id);
  return (
    <div className="grid gap-xxs">
      <StatusText tone="neutral">They can:</StatusText>
      <ul className="grid list-disc gap-xxs pl-lg">
        {labels.map((label) => (
          <li key={label}>{asLine(label)}</li>
        ))}
      </ul>
    </div>
  );
}
