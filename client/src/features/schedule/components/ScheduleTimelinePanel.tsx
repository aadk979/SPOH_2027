'use client';
import { useState } from 'react';
import { ScheduledActionStatus } from '@spoh/shared';
import { useCurrentSession } from '@/features/session';
import { Button, Card, Field, Section, Select } from '@/shared/ui';
import { scheduleStatusLabels } from '../model/copy';
import { ScheduleTimelineContents } from './ScheduleTimelineContents';

export function ScheduleTimelinePanel({ enabled }: { enabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<ScheduledActionStatus | 'ALL'>('PENDING');
  const session = useCurrentSession();
  if (!enabled || !session) return null;
  return (
    <Section title="Event schedule" description="View scheduled work and its outcome.">
      <Card className="flex flex-col gap-md">
        <Button
          variant="secondary"
          className="hover:bg-surface"
          aria-expanded={expanded}
          aria-controls="event-scheduled-work"
          onClick={() => setExpanded(!expanded)}
        >
          Scheduled work
        </Button>
        {expanded ? (
          <div id="event-scheduled-work" className="flex flex-col gap-md">
            <Field id="scheduled-work-status" label="Schedule status">
              {(props) => (
                <Select
                  {...props}
                  value={status}
                  onChange={(event) =>
                    setStatus(
                      event.target.value === 'ALL'
                        ? 'ALL'
                        : ScheduledActionStatus.parse(event.target.value),
                    )
                  }
                >
                  <option value="ALL">All statuses</option>
                  {ScheduledActionStatus.options.map((value) => (
                    <option key={value} value={value}>
                      {scheduleStatusLabels[value]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <ScheduleTimelineContents
              key={session.volunteerId}
              status={status === 'ALL' ? undefined : status}
            />
          </div>
        ) : null}
      </Card>
    </Section>
  );
}
