import type { LifecycleReadinessResponse } from '@spoh/shared';
import { ButtonLink, Section } from '@/shared/ui';
import { goLiveChecklistItem } from '../model/goLiveChecklist';

/** The server owns each outcome; unavailable evidence stays visibly unavailable. */
export function GoLiveChecklist({
  items,
}: {
  items: LifecycleReadinessResponse['goLiveReadiness'];
}) {
  return (
    <Section title="Go-live checklist">
      <ul aria-label="Go-live checklist" className="flex flex-col gap-md">
        {items.map((item) => {
          const copy = goLiveChecklistItem(item.code);
          const state =
            item.state === 'passed'
              ? 'Passed'
              : item.state === 'failed'
                ? 'Needs attention'
                : 'Evidence unavailable';
          return (
            <li key={item.code} className="flex flex-col gap-xs">
              <p className="text-body font-semibold">
                {copy.label}: {state}
              </p>
              {item.state !== 'passed' ? (
                <>
                  <p className="text-caption text-text-muted">{copy.help}</p>
                  <ButtonLink href={copy.path} variant="quiet" size="sm">
                    Review {copy.destination}: {copy.label}
                  </ButtonLink>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
