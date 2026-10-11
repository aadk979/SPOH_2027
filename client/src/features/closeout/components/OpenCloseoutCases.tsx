import { useIncidents } from '@/features/incident';
import { useActiveAlerts } from '@/features/lostPerson';
import { useFallbackWindows } from '@/features/fallback';
import { useLostFound } from '@/features/lostFound';
import { useAllows } from '@/features/session';
import { ButtonLink, Callout, Card, CardTitle, Stack } from '@/shared/ui';

export function OpenCloseoutCases() {
  const allows = useAllows();
  const incidentList = useIncidents(allows('Incident.Read'));
  const alerts = useActiveAlerts();
  const windows = useFallbackWindows(allows('Fallback.Declare'));
  const items = useLostFound({ query: '', heldOnly: true }, true);
  const incidents = incidentList.data?.pages
    .flatMap((page) => page.data)
    .filter((item) => item.status !== 'RESOLVED');
  const openWindows = windows.data?.filter((item) => item.endedAt === null);
  return (
    <Card>
      <Stack>
        <CardTitle>Review open cases</CardTitle>
        <p>
          Open cases do not prevent closing. Agree who will settle each one before freezing the
          final report.
        </p>
        <ButtonLink href="/home" variant="quiet">
          Review active lost-person alerts in the safety banner
        </ButtonLink>
        {alerts.data ? <p>{alerts.data.alerts.length} active alerts</p> : null}
        <ButtonLink href="/safety/incidents" variant="quiet">
          Review incidents and follow-ups
        </ButtonLink>
        {incidents?.map((item) => (
          <p key={item.id}>
            {item.type} · {item.status} · {item.description}
          </p>
        ))}
        <ButtonLink href="/chief/fallback" variant="quiet">
          Review fallback windows and paper imports
        </ButtonLink>
        {openWindows?.map((item) => (
          <p key={item.id}>Open fallback window: {item.reason}</p>
        ))}
        <ButtonLink href="/safety/lost-found" variant="quiet">
          Review held found items
        </ButtonLink>
        {items.data?.map((item) => (
          <p key={item.id}>{item.itemLabel}</p>
        ))}
        {[incidentList, alerts, windows, items].some((query) => query.isError) ? (
          <Callout tone="warn">
            Some case lists could not load. Open the linked screens and reload before closing.
          </Callout>
        ) : null}
      </Stack>
    </Card>
  );
}
