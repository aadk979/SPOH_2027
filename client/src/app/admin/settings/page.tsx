'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import type { RuntimeSettings, SettingsResponse } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import {
  Button,
  Callout,
  Card,
  CardTitle,
  Field,
  Input,
  LoadingCards,
  Section,
  Stack,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useMe, useRequireSession } from '@/features/session/useSession';

/**
 * Runtime settings (Chief and Admin).
 *
 * Everything on this screen used to be a constant compiled into the server or
 * the client. The shift boundaries are the ones that matter: station scoping
 * requires a block to be running, so those two times decide whether the capture
 * screens work at all — and a rehearsal moved to an evening should not need a
 * release to make the counters work.
 *
 * Each field says what changing it will do, because none of these numbers mean
 * anything on their own. "15" is not a fact; "a room counts as silent after 15
 * minutes with nothing recorded" is.
 */

interface FieldSpec {
  key: keyof RuntimeSettings;
  label: string;
  hint: string;
  unit: string;
  min: number;
  max: number;
}

const NUMERIC_FIELDS: readonly FieldSpec[] = [
  {
    key: 'silentStationMinutes',
    label: 'Station silence',
    hint: 'A counted room with nothing recorded for this long is flagged on the dashboard. Lower catches a stopped counter sooner and cries wolf during a genuine lull.',
    unit: 'minutes',
    min: 1,
    max: 1440,
  },
  {
    key: 'staleDeviceMinutes',
    label: 'Device silence',
    hint: 'A volunteer who has checked in but captured nothing for this long appears on the data-health list.',
    unit: 'minutes',
    min: 1,
    max: 1440,
  },
  {
    key: 'implausibleTapsPerMinute',
    label: 'Implausible tap rate',
    hint: 'Registrations per minute above which the IC console flags a device. Usually means somebody is tapping to catch up rather than counting arrivals.',
    unit: 'per minute',
    min: 1,
    max: 600,
  },
  {
    key: 'longShiftMinutes',
    label: 'Welfare threshold',
    hint: 'Time on station without a break before somebody appears on the welfare list.',
    unit: 'minutes',
    min: 1,
    max: 1440,
  },
  {
    key: 'lostPersonPurgeHours',
    label: 'Lost-person retention',
    hint: 'How long a resolved alert keeps its description before it is reduced to timings and an outcome. Shorter is safer; too short and the morning-after report loses the case.',
    unit: 'hours',
    min: 1,
    max: 720,
  },
  {
    key: 'captureUndoWindowSeconds',
    label: 'Undo window',
    hint: 'How long a volunteer can undo a tap. After this only an IC can void the record.',
    unit: 'seconds',
    min: 1,
    max: 3600,
  },
  {
    key: 'captureSendGraceSeconds',
    label: 'Send delay',
    hint: 'How long a tap waits before its first send, so undo can still cancel it outright. Longer makes undo more reliable and the dashboard slower to reflect a capture.',
    unit: 'seconds',
    min: 1,
    max: 3600,
  },
  {
    key: 'dashboardPollSeconds',
    label: 'Dashboard refresh',
    hint: 'How often the live dashboard and the ops-room display reload.',
    unit: 'seconds',
    min: 1,
    max: 3600,
  },
  {
    key: 'alertPollSeconds',
    label: 'Alert check',
    hint: 'How often every device checks for an active lost-person alert. This is the delivery guarantee — push is best effort on top of it.',
    unit: 'seconds',
    min: 1,
    max: 3600,
  },
  {
    key: 'outboxWarningCount',
    label: 'Unsent capture warning',
    hint: 'Unsent captures on one device before the volunteer is told to find their IC.',
    unit: 'captures',
    min: 1,
    max: 1000,
  },
  {
    key: 'outboxWarningAgeMinutes',
    label: 'Unsent capture age',
    hint: 'Age of the oldest unsent capture that triggers the same warning.',
    unit: 'minutes',
    min: 1,
    max: 1440,
  },
  {
    key: 'idempotencyRetentionDays',
    label: 'Idempotency retention',
    hint: 'How long a settled idempotency record is kept for replay.',
    unit: 'days',
    min: 1,
    max: 90,
  },
  {
    key: 'refreshSessionDays',
    label: 'Session duration',
    hint: 'How long a refresh session lives before the volunteer signs in again.',
    unit: 'days',
    min: 1,
    max: 90,
  },
];

export default function AdminSettingsPage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api<SettingsResponse>('/admin/settings'),
    enabled: session !== null,
    staleTime: 30_000,
  });

  const save = useMutation({
    mutationFn: (patch: Partial<RuntimeSettings>) =>
      api<SettingsResponse>('/admin/settings', { method: 'PATCH', body: patch }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
  });

  const [eventName, setEventName] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [morning, setMorning] = useState({ start: '', end: '' });
  const [afternoon, setAfternoon] = useState({ start: '', end: '' });
  const [validationError, setValidationError] = useState<string | null>(null);

  // Seed the form once the current values arrive; a controlled input cannot
  // start empty and later adopt a value without this.
  useEffect(() => {
    const current = settings.data?.settings;
    if (!current) return;

    setEventName(current.eventName ?? '');
    setDraft(
      Object.fromEntries(NUMERIC_FIELDS.map((field) => [field.key, String(current[field.key])])),
    );
    setMorning(current.shiftBlocks.MORNING);
    setAfternoon(current.shiftBlocks.AFTERNOON);
  }, [settings.data]);

  if (!session) return null;

  const canEdit = me?.capabilities.includes('config.manage') ?? false;
  const overridden = new Set(settings.data?.overriddenKeys ?? []);

  function onSave(): void {
    setValidationError(null);
    const patch: Record<string, unknown> = {};

    if (!eventName.trim()) {
      setValidationError('Event name cannot be empty.');
      return;
    }
    if (eventName.trim().length > 80) {
      setValidationError('Event name must be 80 characters or fewer.');
      return;
    }
    patch.eventName = eventName.trim();

    for (const field of NUMERIC_FIELDS) {
      const raw = draft[field.key]?.trim() ?? '';
      if (!raw) {
        setValidationError(`${field.label} cannot be empty.`);
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < field.min || value > field.max) {
        setValidationError(
          `${field.label} must be a number between ${field.min} and ${field.max} ${field.unit}.`,
        );
        return;
      }
      if (field.key !== 'implausibleTapsPerMinute' && !Number.isInteger(value)) {
        setValidationError(`${field.label} must be a whole number.`);
        return;
      }
      patch[field.key] = value;
    }

    if (!morning.start || !morning.end || !afternoon.start || !afternoon.end) {
      setValidationError('All shift block start and end times must be specified.');
      return;
    }
    if (morning.start >= morning.end) {
      setValidationError('Morning shift block must end after it starts.');
      return;
    }
    if (afternoon.start >= afternoon.end) {
      setValidationError('Afternoon shift block must end after it starts.');
      return;
    }

    patch.shiftBlocks = { MORNING: morning, AFTERNOON: afternoon };
    save.mutate(patch as Partial<RuntimeSettings>);
  }

  return (
    <AppShell title="Event settings" back={{ href: '/chief', label: 'Ops' }} width="reading">
      <Stack>
        {!canEdit ? (
          <Callout tone="info">
            These are the values the event is currently running on. Changing them is Chief and Admin
            only.
          </Callout>
        ) : null}

        {validationError ? (
          <Callout tone="alert" role="alert" title="Invalid input">
            {validationError}
          </Callout>
        ) : null}

        {save.isError ? (
          <Callout tone="alert" role="alert" title="Not saved">
            {save.error instanceof ApiError ? save.error.message : 'Try again in a moment.'}
          </Callout>
        ) : null}

        {save.isSuccess ? (
          <Callout tone="ok" role="status">
            Saved. Every server picks this up within a minute; this one already has.
          </Callout>
        ) : null}

        {settings.isPending ? (
          <LoadingCards />
        ) : (
          <>
            <Section
              title="Event identity"
              description="Display name for the event, used in reports, exports and the ops-room display."
            >
              <Card variant="flat">
                <Field id="event-name" label="Event name">
                  {(props) => (
                    <Input
                      {...props}
                      disabled={!canEdit}
                      value={eventName}
                      onChange={(event) => setEventName(event.target.value)}
                      maxLength={80}
                      placeholder="SPOH 2027"
                    />
                  )}
                </Field>
              </Card>
            </Section>

            <Section
              title="Shift blocks"
              description="Singapore time. A capture screen only works while the volunteer is rostered on a block that is running, so these two rows decide when the system accepts data at all. They are allowed to overlap — the handover is deliberate."
            >
              <Card className="flex flex-col gap-md">
                <ShiftRow
                  label="Morning"
                  value={morning}
                  disabled={!canEdit}
                  onChange={setMorning}
                />
                <ShiftRow
                  label="Afternoon"
                  value={afternoon}
                  disabled={!canEdit}
                  onChange={setAfternoon}
                />
              </Card>
            </Section>

            <Section
              title="Thresholds"
              description="A value in bold has been changed from what the system shipped with."
            >
              <div className="flex flex-col gap-sm">
                {NUMERIC_FIELDS.map((field) => {
                  const isChanged = overridden.has(field.key);
                  return (
                    <Card key={field.key} variant="flat" className={isChanged ? 'border-primary/40' : undefined}>
                      <Field
                        id={field.key}
                        label={field.label}
                        hint={field.hint}
                      >
                        {(props) => (
                          <div className="flex items-center gap-sm">
                            <Input
                              {...props}
                              type="number"
                              inputMode="numeric"
                              min={field.min}
                              max={field.max}
                              disabled={!canEdit}
                              value={draft[field.key] ?? ''}
                              onChange={(event) =>
                                setDraft({ ...draft, [field.key]: event.target.value })
                              }
                              className={`max-w-[140px] ${isChanged ? 'font-bold text-primary' : ''}`}
                            />
                            <span
                              className={`text-caption ${
                                isChanged ? 'font-semibold text-primary' : 'text-text-muted'
                              }`}
                            >
                              {field.unit}
                              {isChanged ? ' (changed from default)' : ''}
                            </span>
                          </div>
                        )}
                      </Field>
                    </Card>
                  );
                })}
              </div>
            </Section>

            {canEdit ? (
              <Card className="flex flex-col gap-sm">
                <CardTitle as="h3">Apply</CardTitle>
                <p className="text-caption text-text-muted">
                  Recorded in the audit log against your name, with the previous value.
                </p>
                <Button size="lg" block disabled={save.isPending} onClick={onSave}>
                  {save.isPending ? 'Saving…' : 'Save settings'}
                </Button>
              </Card>
            ) : null}

            {settings.data?.updatedByName ? (
              <p className="text-caption text-text-muted">
                Last changed by {settings.data.updatedByName}.
              </p>
            ) : null}
          </>
        )}
      </Stack>
    </AppShell>
  );
}

function ShiftRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: { start: string; end: string };
  disabled: boolean;
  onChange(next: { start: string; end: string }): void;
}): ReactNode {
  return (
    <div className="grid gap-sm sm:grid-cols-2">
      <Field id={`${label}-start`} label={`${label} starts`}>
        {(props) => (
          <Input
            {...props}
            type="time"
            disabled={disabled}
            value={value.start}
            onChange={(event) => onChange({ ...value, start: event.target.value })}
          />
        )}
      </Field>
      <Field id={`${label}-end`} label={`${label} ends`}>
        {(props) => (
          <Input
            {...props}
            type="time"
            disabled={disabled}
            value={value.end}
            onChange={(event) => onChange({ ...value, end: event.target.value })}
          />
        )}
      </Field>
    </div>
  );
}
