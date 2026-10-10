'use client';
import type { ReactNode } from 'react';
import type { EventContent } from '@spoh/shared';
import { AppShell } from '@/shared/shell/AppShell';
import { Card, CardTitle, Section } from '@/shared/ui';
import { useRequireSession } from '@/features/session';
import { PublishedGuideState } from '@/features/content';
import { useStations } from '@/features/stations';
export default function BriefScreen(): ReactNode {
  const session = useRequireSession();
  if (!session) return null;
  return (
    <AppShell title="What do I say" back={{ href: '/home', label: 'Home' }}>
      <PublishedGuideState>
        {(record) => (
          <>
            <Card tone="info">
              <CardTitle>If you do not know</CardTitle>
              <p className="mt-xs text-reading">{record.body.brief.escalationScript}</p>
            </Card>
            <ProgrammeBrief programmes={record.body.brief.programmes} />
            <Section title="The essential points">
              <Card>
                <ol className="flex list-decimal flex-col gap-xs pl-lg text-reading">
                  {record.body.brief.fiveThings
                    .filter((thing) => !thing.roles || thing.roles.includes(session.role))
                    .map((thing, i) => (
                      <li key={i}>{thing.text}</li>
                    ))}
                </ol>
              </Card>
            </Section>
          </>
        )}
      </PublishedGuideState>
    </AppShell>
  );
}
function ProgrammeBrief({
  programmes,
}: {
  programmes: EventContent['brief']['programmes'];
}): ReactNode {
  const { data: stations } = useStations();
  const tags = new Map(
    stations?.flatMap((station) => station.tags).map((tag) => [tag.id, tag.label]),
  );
  return (
    <Section title="The programmes, in one line each">
      <div className="flex flex-col gap-xs">
        {programmes.map((programme, i) => (
          <Card as="details" variant="flat" key={programme.stationTagId}>
            <summary className="cursor-pointer font-semibold">
              {tags.get(programme.stationTagId) ?? `Programme ${i + 1}`}
            </summary>
            <p className="mt-sm text-reading">{programme.oneLiner}</p>
            <dl className="mt-sm flex flex-col gap-xs">
              {programme.faqs.map((item, n) => (
                <div key={n}>
                  <dt className="font-semibold">{item.question}</dt>
                  <dd className="text-reading text-text-muted">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    </Section>
  );
}
