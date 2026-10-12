import type { StationDashboardResponse } from '@spoh/shared';
import { AppLink } from '@/shared/lib/AppLink';
import { Section, Card, ControlHelp } from '@/shared/ui';
import { registrationsLink, footfallLink } from '../model/drillLinks';

const sourceLabel = { APP: 'Phone captures', FALLBACK_SHEET: 'Fallback sheet', PAPER: 'Paper', MANUAL_ADJUSTMENT: 'Manual adjustment' };
export function CaptureSources({ board }: { board: StationDashboardResponse }) {
  return <Section title="Capture sources">
    <Card>
      <SourceRows board={board} kind="registrations" rows={board.registrations.sourceBreakdown ?? []} />
      <SourceRows board={board} kind="footfall" rows={board.footfall.sourceBreakdown ?? []} />
      <ControlHelp topic="sources">Imports remain in totals. Phone activity and rates use APP captures only. Open a record to see its exact batch where retained.</ControlHelp>
    </Card>
  </Section>;
}

function SourceRows({ board, kind, rows }: { board: StationDashboardResponse; kind: 'registrations' | 'footfall'; rows: NonNullable<StationDashboardResponse['registrations']['sourceBreakdown']> }) {
  const unit = kind === 'registrations' ? 'registrations' : 'room entries';
  return <ul>{rows.map((row) => {
    const filters = { stationId: board.stationId, source: row.source };
    const href = kind === 'registrations' ? registrationsLink(board.observation, filters) : footfallLink(board.observation, filters);
    const text = `${sourceLabel[row.source]}: ${row.value} ${unit}`;
    return <li key={`${kind}:${row.source}`}>{href ? <AppLink href={href} className="text-primary underline">{text}</AppLink> : text}</li>;
  })}</ul>;
}
