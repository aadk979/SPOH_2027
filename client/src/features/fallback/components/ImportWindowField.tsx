import type { ReactNode } from 'react';
import type { ImportForm } from '../hooks/useImportForm';
import { Field, Select } from '@/shared/ui';
import { useEventTime } from '@/features/session';

export function ImportWindowField({ form }: { form: ImportForm }): ReactNode {
  const format = useEventTime();
  const tier = form.source === 'PAPER' ? 4 : 3;
  return (
    <Field
      id="source-window"
      label="Source fallback window"
      optional
      hint="Select the window the sheet came from, including closed windows. Its practice or live label stays with the import. Without a window, the preview uses the current event mode."
      error={
        form.errors.fallbackWindowId ??
        (form.windows.isError ? 'Could not load fallback windows. Try reloading this page.' : null)
      }
    >
      {(props) => (
        <Select
          {...props}
          value={form.fallbackWindowId}
          disabled={form.windows.isPending}
          onChange={(event) => form.setFallbackWindowId(event.target.value)}
        >
          <option value="">No window — current event mode</option>
          {(form.windows.data ?? [])
            .filter((window) => window.tier === tier)
            .map((window) => (
              <option key={window.id} value={window.id}>
                {window.rehearsal ? 'REHEARSAL · Practice' : 'LIVE'} ·{' '}
                {window.stationName ?? 'Event-wide'} · {format.dateTime(window.startedAt)} ·{' '}
                {window.open ? 'Open' : 'Closed'}
              </option>
            ))}
        </Select>
      )}
    </Field>
  );
}
