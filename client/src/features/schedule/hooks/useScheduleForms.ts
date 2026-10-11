'use client';
import { useState, type FormEvent } from 'react';
import { useLifecycleReadiness } from '@/features/events';
import { useRetryKey } from '@/shared/hooks/useRetryKey';
import { useZodForm } from '@/shared/hooks/useZodForm';
import {
  LifecycleScheduleFields,
  ReportScheduleFields,
  lifecycleScheduleBody,
  reportScheduleBody,
} from '../model/producerForms';
import { useScheduleProducer, type ScheduleProduction } from '../queries';

/** Shared submit plumbing: one retry key per reviewed input, cleared once the schedule exists. */
function useProduction() {
  const produce = useScheduleProducer();
  const retry = useRetryKey();
  const [invalid, setInvalid] = useState<string | null>(null);
  function send(build: (key: (input: unknown) => string) => ScheduleProduction, done: () => void) {
    setInvalid(null);
    try {
      produce.mutate(build(retry.forInput), {
        onSuccess: () => {
          retry.clear();
          done();
        },
      });
    } catch (error) {
      setInvalid(error instanceof Error ? error.message : 'Check the time and try again.');
    }
  }
  return { produce, invalid, send };
}

export function useLifecycleScheduleForm(timezone: string) {
  const readiness = useLifecycleReadiness(true);
  const form = useZodForm(LifecycleScheduleFields, {
    to: '' as LifecycleScheduleFields['to'],
    wallTime: '',
    reason: '',
  });
  const { produce, invalid, send } = useProduction();
  function submit(event: FormEvent) {
    event.preventDefault();
    const fields = form.validate();
    const lifecycle = readiness.data?.lifecycle;
    if (!fields || !lifecycle) return;
    send(
      (key) => ({
        kind: 'lifecycle',
        body: lifecycleScheduleBody({
          fields,
          expectedVersion: lifecycle.version,
          timezone,
          idempotencyKey: key({ fields, version: lifecycle.version }),
        }),
      }),
      () => form.reset(),
    );
  }
  return { readiness, form, produce, invalid, submit };
}

export function useReportScheduleForm(timezone: string) {
  const form = useZodForm(ReportScheduleFields, {
    eventDayId: '',
    wallTime: '',
    includeRehearsal: false,
  });
  const { produce, invalid, send } = useProduction();
  function submit(event: FormEvent) {
    event.preventDefault();
    const fields = form.validate();
    if (!fields) return;
    send(
      (key) => ({
        kind: 'report',
        body: reportScheduleBody({ fields, timezone, idempotencyKey: key(fields) }),
      }),
      () => form.reset(),
    );
  }
  return { form, produce, invalid, submit };
}
