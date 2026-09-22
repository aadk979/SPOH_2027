'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  outranks,
  type CommitteeRole,
  type ShiftAssignmentRecord,
  type ShiftBlock,
  type VolunteerAdminRecord,
} from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import {
  Button,
  ButtonLink,
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
import { blockWord } from '@/lib/format';
import { useMe, useRequireSession } from '@/features/session/useSession';
import {
  ROLE_LABELS,
  roleLabel,
  useCreateAssignment,
  useDeactivateVolunteer,
  useDeleteAssignment,
  useEventDays,
  useExportRoster,
  useManagers,
  useProvisionVolunteer,
  useReactivateVolunteer,
  useResendInvite,
  useStations,
  useUpdateVolunteer,
  useVolunteerDetail,
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
 *
 * Adding one person lives here too, next to the list it adds to. Adding two
 * hundred does not: that is a file, and the import screen previews it first.
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
  const exportRoster = useExportRoster();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  if (!session) return null;

  const canManage = me?.capabilities.includes('user.provision') ?? false;
  const canImport = me?.capabilities.includes('roster.edit') ?? false;
  const viewerRole = me?.volunteer.role;
  const rows = volunteers.data?.data ?? [];

  /** Jump the list to one person — used when adding somebody who already exists. */
  function reveal(email: string, includeDeactivated: boolean): void {
    setSearchInput(email);
    setFilters((prev) => ({ ...prev, q: email, active: includeDeactivated ? '' : prev.active }));
    setAdding(false);
  }

  return (
    <AppShell title="Volunteers" back={{ href: '/chief', label: 'Ops' }} width="wide">
      <Stack>
        {!canManage ? (
          <Callout tone="info">
            You can see the roster but not change it. Editing a role or withdrawing access is Chief
            and Admin only.
          </Callout>
        ) : null}

        {canManage || canImport ? (
          <div className="flex flex-wrap gap-sm">
            {canManage ? (
              <Button
                variant={adding ? 'quiet' : 'primary'}
                onClick={() => setAdding(!adding)}
                aria-expanded={adding}
              >
                {adding ? 'Close' : 'Add a volunteer'}
              </Button>
            ) : null}
            {canImport ? (
              <ButtonLink href="/admin/users/import" variant="secondary">
                Import a file
              </ButtonLink>
            ) : null}
            <Button
              variant="quiet"
              disabled={exportRoster.isPending}
              onClick={() => exportRoster.mutate()}
            >
              {exportRoster.isPending ? 'Preparing…' : 'Export CSV'}
            </Button>
          </div>
        ) : null}

        {exportRoster.error ? (
          <Callout tone="alert" role="alert">
            The export did not download.{' '}
            {exportRoster.error instanceof ApiError ? exportRoster.error.message : 'Try again.'}
          </Callout>
        ) : null}

        {adding && canManage && viewerRole ? (
          <ProvisionForm viewerRole={viewerRole} onExisting={reveal} />
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
                  canImport={canImport}
                  viewerRole={viewerRole}
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
  return viewerRole !== undefined && outranks(viewerRole, targetRole);
}

/** The roles this viewer may hand out: strictly below their own. */
function grantableRoles(viewerRole: CommitteeRole): typeof ROLE_LABELS {
  return ROLE_LABELS.filter((entry) => outranks(viewerRole, entry.value));
}

// ─────────────────────────────────────────────────────────────
// ADD ONE PERSON
// ─────────────────────────────────────────────────────────────

function ProvisionForm({
  viewerRole,
  onExisting,
}: {
  viewerRole: CommitteeRole;
  onExisting(email: string, includeDeactivated: boolean): void;
}): ReactNode {
  const provision = useProvisionVolunteer();
  const managers = useManagers();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CommitteeRole>('VOLUNTEER');
  const [phone, setPhone] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [reportsToEmail, setReportsToEmail] = useState('');

  const existing =
    provision.error instanceof ApiError && provision.error.code === 'VOLUNTEER_EXISTS'
      ? (provision.error.details as { volunteerId: string; active: boolean })
      : null;

  function submit(): void {
    provision.mutate(
      {
        displayName: displayName.trim(),
        email: email.trim(),
        role,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(portfolio.trim() ? { portfolio: portfolio.trim() } : {}),
        ...(reportsToEmail ? { reportsToEmail } : {}),
      },
      {
        onSuccess: () => {
          setDisplayName('');
          setEmail('');
          setPhone('');
          setPortfolio('');
        },
      },
    );
  }

  const ready = displayName.trim().length > 0 && email.trim().includes('@');

  return (
    <Card as="section" tone="info" className="flex flex-col gap-md">
      <div>
        <CardTitle>Add a volunteer</CardTitle>
        <p className="mt-xxs text-caption text-text-muted">
          They get an email with a temporary password and set their own before the event. Shifts are
          added after, from their row.
        </p>
      </div>

      {provision.isSuccess ? (
        <Callout tone="ok" role="status" title={`Added ${provision.data.volunteer.displayName}`}>
          {provision.data.identityCreated
            ? `An invite is on its way to ${provision.data.volunteer.email}. If it does not arrive, check spam, then use "Resend invite" on their row.`
            : `${provision.data.volunteer.email} already had a sign-in account, so no new invite was sent. Use "Resend invite" on their row if they need one.`}
        </Callout>
      ) : null}

      {existing ? (
        <Callout tone="warn" role="alert" title="Already on the roster">
          <p>{provision.error?.message}</p>
          <Button
            variant="quiet"
            size="sm"
            className="mt-sm"
            onClick={() => onExisting(email.trim().toLowerCase(), !existing.active)}
          >
            Show their row
          </Button>
        </Callout>
      ) : provision.error ? (
        <Callout tone="alert" role="alert" title="Nobody was added">
          {provision.error instanceof ApiError
            ? provision.error.message
            : 'Could not reach the server. Try again in a moment.'}
        </Callout>
      ) : null}

      <div className="grid gap-sm sm:grid-cols-2">
        <Field id="new-name" label="Name">
          {(props) => (
            <Input
              {...props}
              value={displayName}
              autoComplete="off"
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="As it should appear on the roster"
            />
          )}
        </Field>

        <Field
          id="new-email"
          label="Email"
          hint="The invite goes here, and it is how they sign in."
        >
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field id="new-role" label="Committee role">
          {(props) => (
            <Select
              {...props}
              value={role}
              onChange={(event) => setRole(event.target.value as CommitteeRole)}
            >
              {grantableRoles(viewerRole).map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id="new-reports-to" label="Reports to" optional>
          {(props) => (
            <Select
              {...props}
              value={reportsToEmail}
              onChange={(event) => setReportsToEmail(event.target.value)}
            >
              <option value="">Nobody yet</option>
              {(managers.data ?? []).map((manager) => (
                <option key={manager.id} value={manager.email}>
                  {manager.displayName} · {roleLabel(manager.role)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id="new-phone" label="Phone" optional>
          {(props) => (
            <Input
              {...props}
              type="tel"
              value={phone}
              autoComplete="off"
              onChange={(event) => setPhone(event.target.value)}
            />
          )}
        </Field>

        <Field id="new-portfolio" label="Portfolio" optional>
          {(props) => (
            <Input
              {...props}
              value={portfolio}
              autoComplete="off"
              onChange={(event) => setPortfolio(event.target.value)}
              placeholder="Operations & Crowd Management"
            />
          )}
        </Field>
      </div>

      <Button size="lg" disabled={!ready || provision.isPending} onClick={submit}>
        {provision.isPending ? 'Adding…' : 'Add and send the invite'}
      </Button>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// ONE ROW
// ─────────────────────────────────────────────────────────────

function VolunteerRow({
  volunteer,
  canManage,
  canImport,
  viewerRole,
  isSelf,
  open,
  onToggle,
}: {
  volunteer: VolunteerAdminRecord;
  canManage: boolean;
  canImport: boolean;
  viewerRole: CommitteeRole | undefined;
  isSelf: boolean;
  open: boolean;
  onToggle(): void;
}): ReactNode {
  const actionable = !isSelf && canActOn(viewerRole, volunteer.role);
  // Shifts are roster editing, which a Deputy holds, and which the escalation
  // rule does not cover: a Chief may roster an Admin at a booth.
  const canOpen = (canManage && actionable) || canImport;

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
            {volunteer.reportsToName ? ` · reports to ${volunteer.reportsToName}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-sm">
          <StatusChip volunteer={volunteer} />
          {canManage && !actionable ? (
            // Said in words, even when a Shifts button follows: the admin
            // should know why this row opens to less than the others.
            <span className="text-caption text-text-subtle whitespace-nowrap">
              {isSelf ? 'Your account' : 'Above your level'}
            </span>
          ) : null}
          {canOpen ? (
            <Button variant="quiet" size="sm" onClick={onToggle} aria-expanded={open}>
              {open ? 'Close' : canManage && actionable ? 'Manage' : 'Shifts'}
            </Button>
          ) : null}
        </div>
      </div>

      {!volunteer.active && volunteer.deactivatedReason ? (
        <p className="text-caption text-text-muted">Deactivated: {volunteer.deactivatedReason}</p>
      ) : null}

      {open ? (
        <div className="flex flex-col gap-md border-t border-line pt-sm">
          {canManage && actionable && viewerRole ? (
            <VolunteerEditor volunteer={volunteer} viewerRole={viewerRole} />
          ) : null}
          {volunteer.active ? <ShiftsPanel volunteer={volunteer} canEdit={canImport} /> : null}
        </div>
      ) : null}
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

// ─────────────────────────────────────────────────────────────
// EDITOR
// ─────────────────────────────────────────────────────────────

function VolunteerEditor({
  volunteer,
  viewerRole,
}: {
  volunteer: VolunteerAdminRecord;
  viewerRole: CommitteeRole;
}): ReactNode {
  const update = useUpdateVolunteer();
  const deactivate = useDeactivateVolunteer();
  const reactivate = useReactivateVolunteer();
  const resend = useResendInvite();
  const managers = useManagers();

  const [displayName, setDisplayName] = useState(volunteer.displayName);
  const [role, setRole] = useState<CommitteeRole>(volunteer.role);
  const [phone, setPhone] = useState(volunteer.phone ?? '');
  const [portfolio, setPortfolio] = useState(volunteer.portfolio ?? '');
  const [reportsToId, setReportsToId] = useState(volunteer.reportsToId ?? '');
  const [reason, setReason] = useState('');

  const pending =
    update.isPending || deactivate.isPending || reactivate.isPending || resend.isPending;
  const error = update.error ?? deactivate.error ?? reactivate.error ?? resend.error;

  return (
    <div className="flex flex-col gap-sm">
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
          Access restored for {volunteer.displayName}. They sign in again as normal.
        </Callout>
      ) : null}

      {resend.isSuccess ? (
        <Callout tone="ok" role="status">
          {resend.data.delivery === 'invite'
            ? `Invite resent to ${volunteer.email} with a fresh temporary password. Ask them to check spam.`
            : resend.data.delivery === 'reset'
              ? `${volunteer.displayName} has signed in before, so a password-reset code went to ${volunteer.email}. They use "Forgot password" at the sign-in screen.`
              : 'This environment sends no email — sign-in is local — so nothing was sent.'}
        </Callout>
      ) : null}

      <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-3">
        <Field id={`name-${volunteer.id}`} label="Name">
          {(props) => (
            <Input
              {...props}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          )}
        </Field>

        <Field id={`role-${volunteer.id}`} label="Committee role">
          {(props) => (
            <Select
              {...props}
              value={role}
              onChange={(event) => setRole(event.target.value as CommitteeRole)}
            >
              {grantableRoles(viewerRole).map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id={`reports-${volunteer.id}`} label="Reports to" optional>
          {(props) => (
            <Select
              {...props}
              value={reportsToId}
              onChange={(event) => setReportsToId(event.target.value)}
            >
              <option value="">Nobody</option>
              {(managers.data ?? [])
                .filter((manager) => manager.id !== volunteer.id)
                .map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.displayName} · {roleLabel(manager.role)}
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
          disabled={pending || displayName.trim().length === 0}
          onClick={() =>
            update.mutate({
              id: volunteer.id,
              patch: {
                displayName: displayName.trim(),
                role,
                phone: phone.trim() || null,
                portfolio: portfolio.trim() || null,
                reportsToId: reportsToId || null,
              },
            })
          }
        >
          {update.isPending ? 'Saving…' : 'Save changes'}
        </Button>

        {volunteer.active ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => resend.mutate(volunteer.id)}
          >
            {resend.isPending
              ? 'Sending…'
              : volunteer.hasSignedIn
                ? 'Send a password reset'
                : 'Resend invite'}
          </Button>
        ) : (
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

// ─────────────────────────────────────────────────────────────
// SHIFTS
// ─────────────────────────────────────────────────────────────

/**
 * A person with no shift cannot capture anything: station scoping asks "is
 * this volunteer rostered here, now", and the answer for them is always no.
 * So the shifts sit on the same screen as the account, not on a separate one
 * the admin finds after the first "the app says I'm not on shift" call.
 */
function ShiftsPanel({
  volunteer,
  canEdit,
}: {
  volunteer: VolunteerAdminRecord;
  canEdit: boolean;
}): ReactNode {
  const detail = useVolunteerDetail(volunteer.id);
  const remove = useDeleteAssignment();
  const assignments = detail.data?.assignments ?? [];

  return (
    <div className="flex flex-col gap-sm">
      <CardTitle as="h4">Shifts</CardTitle>

      {detail.isPending ? (
        <LoadingRows />
      ) : assignments.length === 0 ? (
        <p className="text-caption text-text-muted">
          No shifts yet. Until they have one, the capture screens will tell them they are not on
          shift.
        </p>
      ) : (
        <ul className="flex flex-col gap-xs">
          {assignments.map((assignment) => (
            <ShiftLine
              key={assignment.id}
              assignment={assignment}
              canEdit={canEdit}
              removing={remove.isPending && remove.variables === assignment.id}
              onRemove={() => remove.mutate(assignment.id)}
            />
          ))}
        </ul>
      )}

      {remove.error ? (
        <Callout tone="alert" role="alert">
          {remove.error instanceof ApiError ? remove.error.message : 'Could not remove that shift.'}
        </Callout>
      ) : null}

      {canEdit ? <AddShiftForm volunteerId={volunteer.id} /> : null}
    </div>
  );
}

function ShiftLine({
  assignment,
  canEdit,
  removing,
  onRemove,
}: {
  assignment: ShiftAssignmentRecord;
  canEdit: boolean;
  removing: boolean;
  onRemove(): void;
}): ReactNode {
  return (
    <li className="flex flex-wrap items-center justify-between gap-sm text-body">
      <span>
        <span className="font-semibold">{assignment.stationName}</span>
        <span className="text-text-muted">
          {' '}
          · {assignment.date} · {blockWord(assignment.block)} · {assignment.roleLabel}
          {assignment.checkedInAt ? ' · checked in' : ''}
        </span>
      </span>
      {canEdit ? (
        // A shift somebody has worked is an attendance record, and the server
        // refuses to delete it. No button is clearer than a button that fails.
        assignment.checkedInAt ? (
          <span className="text-caption text-text-subtle">Worked</span>
        ) : (
          <Button variant="quiet" size="sm" disabled={removing} onClick={onRemove}>
            {removing ? 'Removing…' : 'Remove'}
          </Button>
        )
      ) : null}
    </li>
  );
}

function AddShiftForm({ volunteerId }: { volunteerId: string }): ReactNode {
  const stations = useStations();
  const days = useEventDays();
  const create = useCreateAssignment();

  const [stationId, setStationId] = useState('');
  const [eventDayId, setEventDayId] = useState('');
  const [block, setBlock] = useState<ShiftBlock>('MORNING');
  const [roleLabel, setRoleLabel] = useState('Volunteer');

  const ready = stationId !== '' && eventDayId !== '' && roleLabel.trim().length > 0;

  return (
    <div className="flex flex-col gap-sm border-t border-line pt-sm">
      {create.error ? (
        <Callout tone="alert" role="alert">
          {create.error instanceof ApiError ? create.error.message : 'Could not add that shift.'}
        </Callout>
      ) : null}

      <div className="grid gap-sm sm:grid-cols-2 lg:grid-cols-4">
        <Field id={`shift-station-${volunteerId}`} label="Station">
          {(props) => (
            <Select
              {...props}
              value={stationId}
              onChange={(event) => setStationId(event.target.value)}
            >
              <option value="">Choose a station</option>
              {(stations.data ?? []).map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id={`shift-day-${volunteerId}`} label="Day">
          {(props) => (
            <Select
              {...props}
              value={eventDayId}
              onChange={(event) => setEventDayId(event.target.value)}
            >
              <option value="">Choose a day</option>
              {(days.data ?? []).map((day) => (
                <option key={day.id} value={day.id}>
                  {day.date} · {day.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field id={`shift-block-${volunteerId}`} label="Block">
          {(props) => (
            <Select
              {...props}
              value={block}
              onChange={(event) => setBlock(event.target.value as ShiftBlock)}
            >
              <option value="MORNING">Morning</option>
              <option value="AFTERNOON">Afternoon</option>
            </Select>
          )}
        </Field>

        <Field id={`shift-role-${volunteerId}`} label="Role on shift">
          {(props) => (
            <Input
              {...props}
              value={roleLabel}
              onChange={(event) => setRoleLabel(event.target.value)}
              placeholder="Usher, Counter, Station IC"
            />
          )}
        </Field>
      </div>

      <Button
        size="sm"
        variant="secondary"
        className="self-start"
        disabled={!ready || create.isPending}
        onClick={() =>
          create.mutate({
            volunteerId,
            stationId,
            eventDayId,
            block,
            roleLabel: roleLabel.trim(),
          })
        }
      >
        {create.isPending ? 'Adding…' : 'Add shift'}
      </Button>
      <p className="text-caption text-text-muted">
        One station per person per block. Adding a shift for a block they already hold moves them to
        the new station.
      </p>
    </div>
  );
}
