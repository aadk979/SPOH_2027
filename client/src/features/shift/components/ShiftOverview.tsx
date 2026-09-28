'use client';

import { useState, type ReactNode } from 'react';
import type { MeResponse } from '@spoh/shared';

import { stationTiles } from '../model/stationTiles';
import { ShiftActions } from './ShiftActions';
import { NavTile } from '@/shared/ui/NavTile';

import { Callout, ButtonLink, Card, CardGrid, CardTitle, Section } from '@/shared/ui';

import { useAttendance } from '@/features/attendance';
import { useCheckIn, useCheckOut } from '../queries';
import { blockLabel, readableRole } from '@/shared/lib/format';
import { useClientSettings } from '@/shared/lib/runtimeSettings';

export function ShiftCard({ me }: { me: MeResponse }): ReactNode {
  const assignment = me.currentAssignment;
  const { shiftBlocks } = useClientSettings();
  const [confirmingCheckOut, setConfirmingCheckOut] = useState(false);
  const attendance = useAttendance();
  const checkIn = useCheckIn(assignment);
  const checkOut = useCheckOut();

  if (!assignment) {
    return (
      <Card>
        <CardTitle>You are not on shift right now</CardTitle>
        <p className="mt-xs text-text-muted">
          {me.upcomingAssignments.length > 0
            ? 'Your next shift is on the Shift screen.'
            : 'No shifts are assigned to you yet. Check with your IC.'}
        </p>
        <div className="mt-md flex flex-wrap gap-sm">
          <ButtonLink href="/shift" variant="secondary">
            My shifts
          </ButtonLink>
          <ButtonLink href="/attendance" variant="quiet">
            Attendance & verification
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-caption font-semibold tracking-[0.06em] text-text-muted uppercase">
        {assignment.dayLabel} · {blockLabel(assignment.block, shiftBlocks)}
      </p>

      {/* The station name is the largest thing on the home screen, because it
          is the answer to "where am I meant to be" a volunteer opens the app
          to get. */}
      <h2 className="mt-xxs text-title">{assignment.station.name}</h2>
      <p className="text-text-muted">{assignment.roleLabel}</p>

      <ShiftActions
        assignment={assignment}
        attendance={attendance}
        checkIn={checkIn}
        checkOut={checkOut}
        confirmingCheckOut={confirmingCheckOut}
        setConfirmingCheckOut={setConfirmingCheckOut}
      />
      {checkIn.isError || checkOut.isError ? (
        <Callout tone="alert" className="mt-sm">
          Your shift could not be updated. Please try again.
        </Callout>
      ) : null}
    </Card>
  );
}

/**
 * Capture tiles, filtered by capability AND by what this station actually does.
 * A counter tile at the sign-up booth would be a tap that always fails.
 */
export function RoleTiles({ me }: { me: MeResponse }): ReactNode {
  const assignment = me.currentAssignment;
  if (!assignment) return null;

  const tiles = stationTiles(me);

  if (tiles.length === 0) return null;

  return (
    <Section title="Your station">
      <CardGrid>
        {tiles.map((tile) => (
          <NavTile key={tile.href} {...tile} emphasis="primary" />
        ))}
      </CardGrid>
    </Section>
  );
}

/**
 * The caller's assigned team contacts, kept with the safety and help tools.
 */
export function EscalationChain({ me }: { me: MeResponse }): ReactNode {
  if (me.escalationChain.length === 0) return null;

  return (
    <Card>
      <CardTitle>If you need help</CardTitle>
      <ul className="mt-sm flex flex-col divide-y divide-line-soft">
        {me.escalationChain.map((contact) => (
          <li key={contact.id} className="flex items-center justify-between gap-sm py-xs">
            <span className="min-w-0">
              <span className="block font-semibold">{contact.displayName}</span>
              <span className="block text-caption text-text-muted">
                {contact.portfolio ?? readableRole(contact.role)}
              </span>
            </span>

            {contact.phone ? (
              <ButtonLink
                href={`tel:${contact.phone.replace(/\s/g, '')}`}
                variant="secondary"
                size="sm"
                // The name is in the label, not just "Call": a screen-reader
                // user tabbing this list otherwise hears "Call, Call, Call".
                aria-label={`Call ${contact.displayName}`}
              >
                Call
              </ButtonLink>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Slide 57. Short enough to actually be read before a shift starts. */
export function FiveThings(): ReactNode {
  const things = [
    'Know where you are: your station, and the two nearest exits.',
    'Know who your IC is, and how to reach them in one tap.',
    'Know the visitor journey — the six steps from arrival to Mission Complete.',
    'If you do not know an answer: "I don\'t know, let me get someone who does."',
    'Anything unsafe goes to your IC and into an incident report, immediately.',
  ];

  return (
    <Card variant="flat" as="details">
      <summary className="cursor-pointer list-none font-semibold marker:content-none transition-colors hover:text-primary">
        <span aria-hidden="true" className="mr-xs inline-block text-primary">
          ▸
        </span>
        The five things
      </summary>
      <ol className="mt-sm flex list-decimal flex-col gap-xs pl-lg text-reading text-text-muted">
        {things.map((thing) => (
          <li key={thing}>{thing}</li>
        ))}
      </ol>
    </Card>
  );
}
