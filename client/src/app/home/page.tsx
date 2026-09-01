'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { MeResponse, MyAssignment } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { SyncIndicator } from '@/components/SyncIndicator';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';

/**
 * The role-scoped home screen (BUILD_PLAN §9.3).
 *
 * The fix for "low-level volunteers didn't even know what the event was, just
 * that they were a volunteer". A DAAA facilitator and a Sign-Up Booth volunteer
 * see entirely different first screens.
 *
 * Render order is fixed: lost-person alert, sync warning (both in AppShell),
 * my shift, the capture tiles this posting actually permits, then the universal
 * block. Nobody sees a tile they cannot use — the server would reject it
 * anyway, and showing it wastes a tap and erodes trust in the app.
 */
export default function HomePage(): ReactNode {
  const session = useRequireSession();
  const { data: me, isLoading } = useMe();

  if (!session) return null;

  return (
    <AppShell
      title={me ? `Hello, ${me.volunteer.displayName}` : 'SPOH 2027'}
      actions={<SyncIndicator />}
    >
      {isLoading || !me ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading your shift…</p>
      ) : (
        <div className="flex flex-col gap-6">
          <ShiftCard me={me} />
          <RoleTiles me={me} />
          <LeadershipTiles me={me} />
          <UniversalTiles />
          <EscalationChain me={me} />
          <FiveThings />
        </div>
      )}
    </AppShell>
  );
}

function ShiftCard({ me }: { me: MeResponse }): ReactNode {
  const queryClient = useQueryClient();
  const assignment = me.currentAssignment;

  const checkIn = useMutation({
    mutationFn: (assignmentId: string) =>
      api('/me/check-in', { method: 'POST', body: { assignmentId } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  const checkOut = useMutation({
    mutationFn: (assignmentId: string) =>
      api('/me/check-out', { method: 'POST', body: { assignmentId } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  if (!assignment) {
    return (
      <section className="tile">
        <h2 className="mb-2 text-xl font-semibold">You are not on shift right now</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          {me.upcomingAssignments.length > 0
            ? 'Your next shift is on the Shift screen.'
            : 'No shifts are assigned to you yet. Check with your IC.'}
        </p>
        <Link href="/shift" className="pill mt-4 inline-block">
          My shifts
        </Link>
      </section>
    );
  }

  return (
    <section className="tile">
      <p className="text-sm uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {assignment.dayLabel} · {assignment.block === 'MORNING' ? '09:30–14:00' : '13:30–18:00'}
      </p>
      <h2
        className="mt-1 text-3xl font-semibold"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
      >
        {assignment.station.name}
      </h2>
      <p style={{ color: 'var(--text-muted)' }}>{assignment.roleLabel}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {assignment.checkedInAt === null ? (
          <button
            type="button"
            className="pill"
            onClick={() => checkIn.mutate(assignment.id)}
            disabled={checkIn.isPending}
          >
            Check in
          </button>
        ) : assignment.checkedOutAt === null ? (
          <>
            <span style={{ color: 'var(--color-ok)' }}>
              ✓ Checked in {formatTime(assignment.checkedInAt)}
            </span>
            <button
              type="button"
              className="pill-quiet"
              onClick={() => checkOut.mutate(assignment.id)}
              disabled={checkOut.isPending}
            >
              Check out
            </button>
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>
            Shift ended {formatTime(assignment.checkedOutAt)}
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * Capture tiles, filtered by capability AND by what this station actually does.
 * A counter tile at the sign-up booth would be a tap that always fails.
 */
function RoleTiles({ me }: { me: MeResponse }): ReactNode {
  const assignment = me.currentAssignment;
  if (!assignment) return null;

  const can = (capability: string): boolean => me.capabilities.includes(capability as never);

  const tiles: Array<{ href: string; label: string; hint: string }> = [];

  if (can('registration.create') && assignment.station.kind === 'SIGNUP_BOOTH') {
    tiles.push({
      href: '/capture/registration',
      label: 'Register a visitor',
      hint: 'One tap per person',
    });
  }

  if (can('footfall.create') && assignment.station.countsEntry) {
    tiles.push({
      href: '/capture/footfall',
      label: 'Count entries',
      hint: assignment.station.name,
    });
  }

  if (can('card.stamp') && assignment.station.issuesStamp) {
    tiles.push({
      href: '/capture/stamp',
      label: 'Stamp a card',
      hint: 'Scan after stamping by hand',
    });
  }

  if (can('gift.redeem') && assignment.station.kind === 'MISSION_COMPLETE') {
    tiles.push({
      href: '/capture/redeem',
      label: 'Redeem a gift',
      hint: 'Check the physical stamps first',
    });
  }

  if (tiles.length === 0) return null;

  return (
    <section>
      <h2
        className="mb-3 text-sm font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        Your station
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="capture-target flex flex-col justify-center px-5 text-left"
          >
            <span>{tile.label}</span>
            <span className="mt-1 text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
              {tile.hint}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * The oversight screens. Shown only to whoever can actually read them — the
 * server would reject the fetch anyway, and a tile that leads to a 403 erodes
 * trust in every other tile on the page.
 */
function LeadershipTiles({ me }: { me: MeResponse }): ReactNode {
  const tiles: Array<{ href: string; label: string; hint: string }> = [];

  if (me.capabilities.includes('dashboard.event.read')) {
    tiles.push({ href: '/chief', label: 'Live operations', hint: 'Everything, right now' });
  }

  if (me.capabilities.includes('dashboard.station.read')) {
    tiles.push({ href: '/ic', label: 'IC console', hint: 'Per-station and per-device' });
  }

  if (me.capabilities.includes('fallback.declare')) {
    tiles.push({ href: '/chief/fallback', label: 'Fallback', hint: 'Declare or close a window' });
  }

  if (me.capabilities.includes('fallback.import')) {
    tiles.push({ href: '/chief/imports', label: 'Import', hint: 'Recover fallback data' });
  }

  if (me.capabilities.includes('report.generate')) {
    tiles.push({ href: '/reports', label: 'Reports', hint: 'The post-event dataset' });
  }

  if (tiles.length === 0) return null;

  return (
    <section>
      <h2
        className="mb-3 text-sm font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        Oversight
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className="tile-flat block">
            <span className="font-semibold">{tile.label}</span>
            <span className="mt-1 block text-sm" style={{ color: 'var(--text-muted)' }}>
              {tile.hint}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Everything every volunteer gets, whatever their role (PRODUCT_BRIEF §1.1). */
function UniversalTiles(): ReactNode {
  const tiles = [
    { href: '/map', label: 'Floor map', hint: 'Stations, toilets, AED, exits' },
    { href: '/journey', label: 'Visitor journey', hint: 'The six steps' },
    { href: '/brief', label: 'What do I say', hint: 'Course one-liners, five things' },
    { href: '/shift', label: 'My shift', hint: 'Times, contacts, sync status' },
    {
      href: '/safety/incident/new',
      label: 'Report an incident',
      hint: 'Injury, near-miss, hazard',
    },
  ];

  return (
    <section>
      <h2
        className="mb-3 text-sm font-semibold uppercase tracking-wide"
        style={{ color: 'var(--text-muted)' }}
      >
        Everyone
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className="tile-flat block">
            <span className="font-semibold">{tile.label}</span>
            <span className="mt-1 block text-sm" style={{ color: 'var(--text-muted)' }}>
              {tile.hint}
            </span>
          </Link>
        ))}
      </div>

      {/*
        The alert button. Deliberately styled as the loudest thing on the page
        after the lost-person banner, and deliberately NOT presented as the
        emergency channel — for a genuine emergency the standing instruction
        remains phone and voice (PRODUCT_BRIEF §7.3).
      */}
      <Link
        href="/safety/lost-person/new"
        className="mt-3 flex w-full items-center justify-center rounded-lg px-5 py-5 text-lg font-semibold"
        style={{ background: 'var(--color-alert)', color: '#ffffff', minHeight: 64 }}
      >
        Report a lost person
      </Link>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        For a medical or fire emergency, call — do not tap.
      </p>
    </section>
  );
}

function EscalationChain({ me }: { me: MeResponse }): ReactNode {
  if (me.escalationChain.length === 0) return null;

  return (
    <section className="tile">
      <h2 className="mb-3 font-semibold">If you need help</h2>
      <ul className="flex flex-col gap-2">
        {me.escalationChain.map((contact) => (
          <li key={contact.id} className="flex items-center justify-between gap-3">
            <span>
              {contact.displayName}
              <span className="ml-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                {contact.portfolio ?? readableRole(contact.role)}
              </span>
            </span>
            {contact.phone ? (
              <a
                href={`tel:${contact.phone.replace(/\s/g, '')}`}
                className="pill-quiet"
                style={{ color: 'var(--color-primary)' }}
              >
                Call
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Slide 57. Short enough to actually be read before a shift starts. */
function FiveThings(): ReactNode {
  const things = [
    'Know where you are: your station, and the two nearest exits.',
    'Know who your IC is, and how to reach them in one tap.',
    'Know the visitor journey — the six steps from arrival to Mission Complete.',
    'If you do not know an answer: "I don\'t know, let me get someone who does."',
    'Anything unsafe goes to your IC and into an incident report, immediately.',
  ];

  return (
    <details className="tile-flat">
      <summary className="cursor-pointer font-semibold">The five things</summary>
      <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5">
        {things.map((thing) => (
          <li key={thing}>{thing}</li>
        ))}
      </ol>
    </details>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  });
}

function readableRole(role: MyAssignment['block'] | string): string {
  return String(role)
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
