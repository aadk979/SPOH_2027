'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import type {
  AttendanceChallenge,
  AttendanceProof,
  AttendanceRecord,
  AttendanceStatus,
} from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { Button, ButtonLink, Callout, Card, Field, Input, Section, Stack } from '@/components/ui';
import { AttendanceScanner } from '@/features/attendance/AttendanceScanner';
import { VerifierCode } from '@/features/attendance/VerifierCode';
import { useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';
import { formatTime } from '@/lib/format';

export default function AttendancePage(): ReactNode {
  const session = useRequireSession();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [scanning, setScanning] = useState(true);
  const [code, setCode] = useState<AttendanceChallenge | null>(null);
  const inFlight = useRef(false);
  const status = useQuery({
    queryKey: ['attendance'],
    queryFn: () => api<AttendanceStatus>('/attendance'),
    enabled: Boolean(session),
    refetchInterval: 30_000,
  });
  async function refresh(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['attendance'] }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
    ]);
  }
  function confirm(attendance: AttendanceRecord): void {
    queryClient.setQueryData<AttendanceStatus>(['attendance'], (previous) =>
      previous ? { ...previous, attendance } : previous,
    );
  }
  const submit = useMutation({
    mutationFn: (proof: AttendanceProof) =>
      api<{ attendance: AttendanceRecord }>('/attendance/submit', { method: 'POST', body: proof }),
    onSuccess: async (result) => {
      confirm(result.attendance);
      setPin('');
      await refresh();
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });
  const start = useMutation({
    mutationFn: () =>
      api<{ attendance: AttendanceRecord }>('/attendance/start', { method: 'POST' }),
    onSuccess: async (result) => {
      confirm(result.attendance);
      await refresh();
    },
  });
  const issue = useMutation({
    mutationFn: () => api<AttendanceChallenge>('/attendance/challenge', { method: 'POST' }),
    onSuccess: setCode,
  });
  function send(proof: AttendanceProof): void {
    if (inFlight.current) return;
    inFlight.current = true;
    setScanning(false);
    submit.mutate(proof);
  }
  if (!session) return null;
  const data = status.data;
  const present = data?.attendance;
  const error = submit.error ?? start.error ?? issue.error;
  return (
    <AppShell title="Attendance" back={{ href: '/shift', label: 'My shift' }}>
      <Stack>
        {status.isPending ? <Callout>Loading attendance…</Callout> : null}
        {status.isError ? (
          <Callout tone="alert">
            Could not load attendance. Check your connection.{' '}
            <Button variant="quiet" onClick={() => void status.refetch()}>
              Try again
            </Button>
          </Callout>
        ) : null}
        {data && !data.configured ? (
          <Callout tone="alert">
            The root attendance admin has not been configured yet. Contact the event administrator.
          </Callout>
        ) : null}
        {data && !data.eventDay ? (
          <Callout>Attendance opens on configured event days.</Callout>
        ) : null}
        {error ? (
          <Callout tone="alert" role="alert">
            {error.message}
          </Callout>
        ) : null}
        {data?.configured && data.eventDay ? (
          <>
            <Section title={data.eventDay.label}>
              {present ? (
                <Card>
                  <p className="font-semibold">You are marked present</p>
                  <p className="mt-xs text-text-muted">
                    {formatTime(present.presentAt)} ·{' '}
                    {present.method === 'ROOT'
                      ? 'Root admin opened attendance'
                      : `${present.verifiedByName ?? 'Verifier'} · ${present.method === 'PIN' ? 'Secondary PIN' : 'QR scan'}`}
                  </p>
                  <ButtonLink className="mt-md" variant="secondary" href="/home">
                    Back to home
                  </ButtonLink>
                </Card>
              ) : data.isRoot ? (
                <Card>
                  <p>
                    Open attendance when you are physically at the event. Excos can then scan your
                    QR or enter your secondary PIN.
                  </p>
                  <Button
                    className="mt-md"
                    onClick={() => start.mutate()}
                    disabled={start.isPending}
                  >
                    I am at the event — open attendance
                  </Button>
                </Card>
              ) : (
                <>
                  <p className="text-text-muted">
                    {data.isExco
                      ? 'Scan the root admin’s attendance QR.'
                      : 'Scan a present exco’s or the root admin’s attendance QR.'}{' '}
                    Both phones should be on SP Wi-Fi.
                  </p>
                  {!data.networkConfigured ? (
                    <Callout>
                      SP network verification is not configured yet. Use your verifier’s secondary
                      PIN.
                    </Callout>
                  ) : !data.onCampusNetwork ? (
                    <Callout>
                      This phone is outside the configured SP network. Connect to SP Wi-Fi or use
                      the secondary PIN.
                    </Callout>
                  ) : null}
                  {scanning ? (
                    <AttendanceScanner onScan={(token) => send({ method: 'QR', token })} />
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        submit.reset();
                        setScanning(true);
                      }}
                      disabled={submit.isPending}
                    >
                      Scan again
                    </Button>
                  )}
                  <Card>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        send({ method: 'PIN', pin });
                      }}
                      className="flex flex-col gap-sm"
                    >
                      <Field
                        id="attendance-pin"
                        label="Secondary verification PIN"
                        hint="On mobile data or unable to scan? Ask your verifier for their current 10-digit PIN. An internet connection is still required."
                      >
                        {(props) => (
                          <Input
                            {...props}
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={10}
                            pattern="[0-9]{10}"
                            value={pin}
                            placeholder="10-digit PIN"
                            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                            onPaste={(event) => {
                              event.preventDefault();
                              const pasted = event.clipboardData.getData('text');
                              const cleaned = pasted.replace(/\D/g, '').slice(0, 10);
                              setPin(cleaned);
                            }}
                            scale="lg"
                            className="text-center font-mono tracking-widest font-semibold"
                          />
                        )}
                      </Field>
                      <Button type="submit" disabled={pin.length !== 10 || submit.isPending}>
                        {submit.isPending ? 'Verifying…' : 'Submit attendance with PIN'}
                      </Button>
                    </form>
                  </Card>
                </>
              )}
            </Section>
            {data.canIssue ? (
              <Section
                title="Verify attendance"
                description={
                  data.isRoot
                    ? 'Show your code to excos and volunteers present with you.'
                    : 'Show your code to volunteers present with you. Excos must verify through the root admin.'
                }
              >
                {code ? (
                  <>
                    <VerifierCode
                      key={code.token}
                      challenge={code}
                      pending={issue.isPending}
                      refresh={() => issue.mutate()}
                    />
                    <Button variant="quiet" onClick={() => setCode(null)}>
                      Hide QR and PIN
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
                    {issue.isPending ? 'Generating…' : 'Show my QR and secondary PIN'}
                  </Button>
                )}
              </Section>
            ) : null}
          </>
        ) : null}
      </Stack>
    </AppShell>
  );
}
