import type { StructureResponse, EventDayRecord } from '@spoh/shared';
import { EmptyState, Section } from '@/shared/ui';
import { ExceptionEditor } from './ExceptionEditor';
export function ExceptionsGrid({
  structure,
  days,
  editable,
}: {
  structure: StructureResponse['data'];
  days: EventDayRecord[];
  editable: boolean;
}) {
  const templates = structure.templates.filter((template) => template.active);
  return (
    <Section
      title="Day × shift exceptions"
      description={`All hours use ${structure.timezone}. Edit one cell to override that day only, or follow the template again.`}
    >
      {days.length === 0 || templates.length === 0 ? (
        <EmptyState title="Add days and active templates to see the exceptions grid" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Individual shift hours by event day and template</caption>
            <thead>
              <tr>
                <th scope="col" className="p-sm">
                  Day
                </th>
                {templates.map((template) => (
                  <th scope="col" key={template.id} className="p-sm">
                    {template.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.id}>
                  <th scope="row" className="p-sm">
                    {day.label}
                    <br />
                    <span className="font-normal">{day.date}</span>
                  </th>
                  {templates.map((template) => {
                    const shift = structure.shifts.find(
                      (row) => row.eventDayId === day.id && row.templateId === template.id,
                    );
                    return (
                      <td
                        key={template.id}
                        className="min-w-[230px] border-t border-line p-sm align-top"
                      >
                        {shift ? (
                          <details>
                            <summary className="min-h-control cursor-pointer">
                              {shift.startLocal}–{shift.endLocal}
                              {shift.endsNextDay ? ' (+1 day)' : ''}
                              <br />
                              <strong>{shift.overridden ? 'Exception' : 'Follows template'}</strong>
                            </summary>
                            <ExceptionEditor
                              key={`${shift.id}:${shift.startsAt}:${shift.endsAt}:${shift.overridden}`}
                              shift={shift}
                              editable={editable}
                            />
                          </details>
                        ) : (
                          <span>No shift configured</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
