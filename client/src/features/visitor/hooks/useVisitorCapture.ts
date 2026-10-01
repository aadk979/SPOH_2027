'use client';

import { useRef, useState } from 'react';
import { CreateRegistrationRequest } from '@spoh/shared';
import { useEventId } from '@/shared/lib/eventContext';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { captureVisitorRegistration } from '../api';
import { useVisitorFields } from '../queries';

function useVisitorForm() {
  return useZodForm(CreateRegistrationRequest, {
    category: '',
    visitor: {} as Record<string, string>,
  });
}

function useVisitorSubmission(form: ReturnType<typeof useVisitorForm>, stationId: string) {
  const eventId = useEventId();
  const pendingKey = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const visitor = Object.fromEntries(
      Object.entries(form.values.visitor).filter(([, value]) => value.trim()),
    );
    if (Object.keys(visitor).length === 0) {
      setError('Enter at least one detail, or use a count button above.');
      return;
    }
    const key = pendingKey.current ?? crypto.randomUUID();
    const body = form.validate({
      category: form.values.category,
      stationId,
      visitor,
      idempotencyKey: key,
      clientRecordedAt: new Date().toISOString(),
    });
    if (!body) return;
    pendingKey.current = key;
    setSaving(true);
    setError(null);
    try {
      await captureVisitorRegistration(eventId, body);
      pendingKey.current = null;
      form.reset({ category: '', visitor: {} });
      setMessage('Registration recorded with the declared details.');
    } catch {
      setError(
        'Not recorded. Check the connection and retry; no details were put in the offline queue.',
      );
    } finally {
      setSaving(false);
    }
  }

  function clearPending(): void {
    pendingKey.current = null;
    setMessage(null);
  }
  return { saving, message, error, submit, clearPending };
}

/** Direct capture: visitor values never enter the offline count outbox. */
export function useVisitorCapture(stationId: string) {
  const { data: fields = [] } = useVisitorFields(true);
  const form = useVisitorForm();
  const submission = useVisitorSubmission(form, stationId);
  function editVisitor(code: string, value: string): void {
    submission.clearPending();
    form.setField('visitor', { ...form.values.visitor, [code]: value });
  }
  function editCategory(category: string): void {
    submission.clearPending();
    form.setField('category', category);
  }
  return {
    active: fields.filter((field) => field.active),
    form,
    ...submission,
    editVisitor,
    editCategory,
  };
}
