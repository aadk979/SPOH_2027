import { useState } from 'react';
import { AuditQuery } from '@spoh/shared';
import { useEvent } from '@/shared/lib/eventContext';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { eventWallTimeInstant } from '@/shared/lib/eventWallTime';

export function useAuditFilters() {
  const event = useEvent();
  const [filters, setFilters] = useState<AuditQuery>({ limit: 50 });
  const [error, setError] = useState<string | null>(null);
  const form = useZodForm(
    AuditQuery,
    {
      action: '',
      entityType: '',
      entityId: '',
      actorId: '',
      fromWall: '',
      toWall: '',
    },
    { from: 'fromWall', to: 'toWall' },
  );
  function apply() {
    try {
      setError(null);
      const { fromWall, toWall, ...text } = form.values;
      const input = {
        limit: 50,
        ...Object.fromEntries(Object.entries(text).filter(([, value]) => value.trim())),
        ...(fromWall ? { from: eventWallTimeInstant(fromWall, event.timezone) } : {}),
        ...(toWall ? { to: eventWallTimeInstant(toWall, event.timezone) } : {}),
      };
      if (input.from && input.to && input.from >= input.to)
        throw new Error('The end must be after the start.');
      const parsed = form.validate(input);
      if (parsed) setFilters(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Check the filters.');
    }
  }
  return { form, filters, error, apply, timezone: event.timezone };
}
