'use client';
import type { ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { Card, CardTitle, StatusText } from '@/shared/ui';
import { useRequireSession } from '@/features/session';
import { PublishedGuideState, PublishedFloorImage } from '@/features/content';
export default function MapScreen(): ReactNode {
  const session = useRequireSession();
  if (!session) return null;
  return (
    <AppShell width="wide" title="Floor map" back={{ href: '/home', label: 'Home' }}>
      <PublishedGuideState>
        {(record) => (
          <>
            <p className="mb-md text-text-muted">{record.body.map.intro}</p>
            <div className="grid gap-sm sm:gap-md lg:grid-cols-2">
              {record.body.map.levels.map((floor, index) => (
                <Card as="section" key={index}>
                  <CardTitle>{floor.label}</CardTitle>
                  {floor.image ? (
                    <PublishedFloorImage
                      path={record.images[floor.image.mediaKey]}
                      alt={floor.image.alt}
                    />
                  ) : null}
                  <ul className="mt-sm flex flex-col gap-xs">
                    {floor.points.map((point, i) => (
                      <li key={i} className="flex items-start gap-sm">
                        <span
                          aria-hidden="true"
                          className="w-[1.25em] shrink-0 text-center leading-[1.47]"
                        >
                          {point.kind === 'safety' ? '⛑' : '·'}
                        </span>
                        <span className="min-w-0">
                          {point.label}
                          {point.kind === 'safety' ? (
                            <StatusText tone="alert" className="ml-xs">
                              Safety
                            </StatusText>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </>
        )}
      </PublishedGuideState>
    </AppShell>
  );
}
