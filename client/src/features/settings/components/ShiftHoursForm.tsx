import { useState, type ReactNode } from 'react';
import type { ShiftTemplateRecord } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';
import { Button, Callout, Card, LoadingRows, Section } from '@/shared/ui';
import { shiftHoursError } from '../model/shiftHours';
import { useSaveShiftTemplate, useShiftTemplates } from '../queries';
import { ShiftRow } from './ShiftRow';

/** One shift's hours, saved on their own: they move every day's shift of it. */
function TemplateHours({
  template,
  canEdit,
}: {
  template: ShiftTemplateRecord;
  canEdit: boolean;
}): ReactNode {
  const [hours, setHours] = useState({ start: template.startLocal, end: template.endLocal });
  const save = useSaveShiftTemplate();
  const changed = hours.start !== template.startLocal || hours.end !== template.endLocal;
  const error = changed ? shiftHoursError(hours, template.endsNextDay) : undefined;
  return (
    <div className="flex flex-col gap-xs">
      <ShiftRow
        id={template.code}
        label={template.label}
        value={hours}
        error={error}
        disabled={!canEdit || save.isPending}
        onChange={setHours}
      />
      {canEdit && changed ? (
        <div>
          <Button
            variant="secondary"
            disabled={Boolean(error) || save.isPending}
            onClick={() =>
              save.mutate({
                id: template.id,
                body: { startLocal: hours.start, endLocal: hours.end },
              })
            }
          >
            Save {template.label} hours
          </Button>
        </div>
      ) : null}
      {save.isError ? (
        <Callout tone="alert" role="alert" title="Not saved">
          {save.error instanceof ApiError ? save.error.message : 'Try again in a moment.'}
        </Callout>
      ) : null}
    </div>
  );
}

/**
 * The event's shifts and their hours (ADR-002). Capture and check-in follow
 * them, so an edit here moves every day's shift that has not been changed by
 * hand, at once.
 */
export function ShiftHoursForm({
  enabled,
  canEdit,
}: {
  enabled: boolean;
  canEdit: boolean;
}): ReactNode {
  const templates = useShiftTemplates(enabled);
  return (
    <Section
      title="Shift hours"
      description="The event's local time. A capture screen only works while the volunteer is rostered on a shift that is running, so these hours decide when the system accepts data at all. Shifts may overlap — a handover is deliberate."
    >
      <Card className="flex flex-col gap-md">
        {templates.isPending ? (
          <LoadingRows />
        ) : (
          (templates.data ?? []).map((template) => (
            <TemplateHours
              key={`${template.id}:${template.startLocal}-${template.endLocal}`}
              template={template}
              canEdit={canEdit}
            />
          ))
        )}
      </Card>
    </Section>
  );
}
