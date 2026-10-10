import type { ReactNode } from 'react';
import { useCurrentSession } from '@/features/session';
import { Card } from '@/shared/ui';
import { usePublishedContent } from '../queries';
export function PublishedFiveThings(): ReactNode {
  const content = usePublishedContent();
  const session = useCurrentSession();
  if (!content.data || !session) return null;
  const things = content.data.record.body.brief.fiveThings.filter(
    (thing) => !thing.roles || thing.roles.includes(session.role),
  );
  return (
    <Card variant="flat" as="details">
      <summary className="cursor-pointer font-semibold">Before you start</summary>
      <ol className="mt-sm flex list-decimal flex-col gap-xs pl-lg text-reading text-text-muted">
        {things.map((thing, i) => (
          <li key={i}>{thing.text}</li>
        ))}
      </ol>
    </Card>
  );
}
