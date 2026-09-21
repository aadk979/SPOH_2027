'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ROLE_PRECEDENCE, type CommitteeRole, type VolunteerAdminRecord } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import {
  Button,
  Callout,
  Card,
  CardTitle,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingRows,
  Section,
  Select,
  Stack,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useMe, useRequireSession } from '@/features/session/useSession';
import {
  ROLE_LABELS,
  roleLabel,
  useDeactivateVolunteer,
  useReactivateVolunteer,
  useUpdateVolunteer,
  useVolunteers,
  type VolunteerFilters,
} from '@/features/admin/useVolunteers';

/**
 * Roster administration (Chief and Admin).
 *
 * The column that earns its place is "last seen". In the week before the event
 * the question is never "does this account exist" — the import created it — but
 * "has this person ever actually opened the app", and that is the difference
 * between a roster of 200 and a workforce of 140 discovering the problem at
 * 09:25 on the day.
 *
 * Deactivation asks for a reason and says plainly what it will do, because it
 * does more than the button implies: it revokes every signed-in device, drops
 * the volunteer's push subscriptions, and disables the account at the identity
 * provider. An admin who thinks they are hiding a row should not discover they
 * locked somebody out of the building's ops app mid-shift.
 */
export default function AdminUsersPage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();

  const [filters, setFilters] = useState<VolunteerFilters>({
    q: '',
    role: '',
    active: 'true',
    sort: 'name',
  });
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.q === searchInput ? prev : { ...prev, q: searchInput }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const volunteers = useVolunteers(filters);
  const [editing, setEditing] = useState<string | null>(null);

  if (!session) return null;

  const canManage = me?.capabilities.includes('user.provision') ?? false;
  const rows = volunteers.data?.data ?? [];

  return (
    <AppShell title="Volunteers" back={{ href: '/chief', label: 'Ops' }} width="wide">
      <Stack>
        {!canManage ? (
          <Callout tone="info">
            You can see the roster but not change it. Editing a role or withdrawing access is Chief
            and Admin only.
          </Callout>
        ) : null}

        <Section title="Find someone">
          <Card className="flex flex-col gap-sm sm:flex-row sm:items-end">
            <Field id="q" label="Name or email" className="flex-1">
              {(props) => (
                <Input
                  {...props}
                  type="search"
                  value={searchInput}
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search the roster"
                />
              )}
            </Field>

            <Field id="role" label="Filter by role" className="sm:w-[220px]">
              {(props) => (
                <Select
                  {...props}
                  value={filters.role}
                  onChange={(event) =>
                    setFilters({ ...filters, role: event.target.value as CommitteeRole | '' })
                  }
                >
                  <option value="">Every role</option>
                  {ROLE_LABELS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field id="sort" label="Sort by" className="sm:w-[200px]">
              {(props) => (
                <Select
                  {...props}
                  value={filters.sort}
                  onChange={(event) =>
                    setFilters({ ...filters, sort: event.target.value as VolunteerFilters['sort'] })
                  }
                >
                  <option value="name">Name</option>
                  <option value="role">Role</option>
                  <option value="lastSeen">Never signed in first</option>
                  <option value="created">Recently added</option>
                </Select>
              )}
            </Field>

            <Checkbox
              label="Include deactivated"
              checked={filters.active === ''}
              onChange={(event) =>
                setFilters({ ...filters, active: event.target.checked ? '' : 'true' })
              }
              className="sm:h-control"
            />
          </Card>
        </Section>

        <Section
          // No count while the count is unknown. A heading reading "0
          // volunteers" during the first load says the roster is empty, which
          // is the one thing an admin opening this screen must not be told.
          title={
            volunteers.isPending
              ? 'Roster'
              : `${rows.length} ${rows.length === 1 ? 'volunteer' : 'volunteers'}`
          }
          description="A name that has never signed in is a volunteer who cannot capture anything on the day."
        >
          {volunteers.isPending ? (
            <LoadingRows />
          ) : rows.length === 0 ? (
            <EmptyState title="Nobody matches that">
              Clear the search, or widen the role filter.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-xs">
              {rows.map((volunteer) => (
                <VolunteerRow
                  key={volunteer.id}
                  volunteer={volunteer}
                  canManage={canManage}
                  viewerRole={me?.volunteer.role}
                  isSelf={volunteer.id === me?.volunteer.id}
                  open={editing === volunteer.id}
                  onToggle={() => setEditing(editing === volunteer.id ? null : volunteer.id)}
                />
              ))}
            </div>
          )}
        </Section>
      </Stack>
    </AppShell>
  );
}

/**
 * Mirrors the server's escalation rule.
 *
 * Affordance only — `admin/service.ts` refuses the request regardless — but
 * this screen follows the same rule as the home tiles: nobody is shown a
 * control they cannot use. A Chief who opens a full edit form on an Admin, sets
 * a role, presses Save and gets a 403 has been told the app is broken.
 */
function canActOn(viewerRole: CommitteeRole | undefined, targetRole: CommitteeRole): boolean {
  if (!viewerRole) return false;
  return ROLE_PRECEDENCE[viewerRole] < ROLE_PRECEDENCE[targetRole];
}

function VolunteerRow({
  volunteer,
  canManage,
  viewerRole,
  isSelf,
  open,
  onToggle,
}: {
  volunteer: VolunteerAdminRecord;
  canManage: boolean;
  viewerRole: CommitteeRole | undefined;
  isSelf: boolean;
  open: boolean;
  onToggle(): void;
}): ReactNode {
  const actionable = !isSelf && canActOn(viewerRole, volunteer.role);

  return (
    <Card
      variant="flat"
      tone={volunteer.active ? 'neutral' : 'warn'}
      className="flex flex-col gap-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {volunteer.displayName}
            {isSelf ? <span className="ml-xs text-caption text-text-muted">(you)</span> : null}
          </p>
          <p className="truncate text-caption text-text-muted">
            {volunteer.email} · {roleLabel(volunteer.role)}
            {volunteer.portfolio ? ` · ${volunteer.portfolio}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-sm">
          <StatusChip volunteer={volunteer} />
          {canManage && actionable ? (
            <Button variant="quiet" size="sm" onClick={onToggle} aria-expanded={open}>
              {open ? 'Close' : 'Manage'}
            </Button>
          ) : canManage ? (
            <span className="text-caption text-text-subtle whitespace-nowrap">
              {isSelf ? 'Your account' : 'Above your level'}
            </span>
          ) : null}
        </div>
      </div>

      {!volunteer.active && volunteer.deactivatedReason ? (
        <p className="text-caption text-text-muted">Deactivated: {volunteer.deactivatedReason}</p>
      ) : null}

      {open && canManage && actionable ? <VolunteerEditor volunteer={volunteer} /> : null}
    </Card>
  );
}

/** State in form as well as words, so the list reads at a glance. */
function StatusChip({ volunteer }: { volunteer: VolunteerAdminRecord }): ReactNode {
  const [label, className] = !volunteer.active
    ? ['Deactivated', 'bg-warn-surface text-warn']
    : !volunteer.hasSignedIn
      ? ['Never signed in', 'bg-alert-surface text-alert']
      : [
          `${volunteer.assignmentCount} ${volunteer.assignmentCount === 1 ? 'shift' : 'shifts'}`,
          'bg-surface-alt text-text-muted',
        ];

  return (
    <span
      className={`rounded-pill px-sm py-xxs text-caption font-semibold whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
}

function VolunteerEditor({ volunteer }: { volunteer: VolunteerAdminRecord }): ReactNode {
  const update = useUpdateVolunteer();
  const deactivate = useDeactivateVolunteer();
  const reactivate = useReactivateVolunteer();

  const [role, setRole] = useState<CommitteeRole>(volunteer.role);
  const [phone, setPhone] = useState(volunteer.phone ?? '');
  const [portfolio, setPortfolio] = useState(volunteer.portfolio ?? '');
  const [reason, setReason] = useState('');

  const pending = update.isPending || deactivate.isPending || reactivate.isPending;
  const error = update.error ?? deactivate.error ?? reactivate.error;

  return (
    <div className="flex flex-col gap-sm border-t border-line pt-sm">
      {error ? (
        <Callout tone="alert" role="alert" title="That change did not go through">
          {error instanceof ApiError ? error.message : 'Try again in a moment.'}
        </Callout>
      ) : null}

      {update.isSuccess ? (
        <Callout tone="ok" role="status">
          {update.data && update.data.sessionsRevoked > 0
            ? `Saved. ${update.data.sessionsRevoked} signed-in ${
                update.data.sessionsRevoked === 1 ? 'device was' : 'devices were'
              } signed out, so the new role takes effect immediately.`
            : 'Changes saved successfully.'}
        </Callout>
      ) : null}

      {reactivate.isSuccess ? (
        <Callout tone="ok" role="status">
          Access restored for {volunteer.displayName}.
        </Callout>
      ) : null}

      <div className="grid gap-sm sm:grid-cols-3">
        <Field id={`role-${volunteer.id}`} label="Committee role">
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

        <Field id={`phone-${volunteer.id}`} label="Phone" optional>
          {(props) => (
            <Input
              {...props}
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </Field>

        <Field id={`portfolio-${volunteer.id}`} label="Portfolio" optional>
          {(props) => (
            <Input
              {...props}
              value={portfolio}
              onChange={(event) => setPortfolio(event.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-wrap gap-sm">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            update.mutate({
              id: volunteer.id,
              patch: {
                role,
                phone: phone.trim() || null,
                portfolio: portfolio.trim() || null,
              },
            })
          }
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>

        {volunteer.active ? null : (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => reactivate.mutate(volunteer.id)}
          >
            Restore access
          </Button>
        )}
      </div>

      {volunteer.active ? (
        <div className="flex flex-col gap-sm border-t border-line pt-sm">
          <CardTitle as="h4">Withdraw access</CardTitle>
          <p className="text-caption text-text-muted">
            Signs out every device they are signed in on, stops alerts reaching their phone, and
            disables the account at sign-in. Their captured records are kept.
          </p>

          <Field
            id={`reason-${volunteer.id}`}
            label="Reason"
            hint="Shown on the roster, so the next person to look knows why."
          >
            {(props) => (
              <Input
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Lost their phone / left the committee"
              />
            )}
          </Field>

          <Button
            variant="danger"
            size="sm"
            disabled={pending || reason.trim().length < 3}
            onClick={() =>
              deactivate.mutate({
                id: volunteer.id,
                body: { reason: reason.trim(), disableIdentity: true },
              })
            }
          >
            {deactivate.isPending ? 'Withdrawing…' : `Deactivate ${volunteer.displayName}`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
