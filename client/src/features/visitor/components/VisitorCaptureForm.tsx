'use client';

import type { ReactNode } from 'react';
import type { CaptureCategoryRecord } from '@spoh/shared';
import { Button, Callout, Card, Field, Input, Select } from '@/shared/ui';
import { useVisitorCapture } from '../hooks/useVisitorCapture';

type Capture = ReturnType<typeof useVisitorCapture>;

function VisitorCaptureInputs({
  capture,
  categories,
}: {
  capture: Capture;
  categories: CaptureCategoryRecord[];
}): ReactNode {
  return (
    <>
      <Field id="visitor-category" label="Category" error={capture.form.errors.category}>
        {(props) => (
          <Select
            {...props}
            value={capture.form.values.category}
            disabled={capture.saving}
            onChange={(event) => capture.editCategory(event.target.value)}
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.code} value={category.code}>
                {category.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {capture.active.map((field) => (
        <Field
          key={field.id}
          id={`visitor-value-${field.code}`}
          label={field.label}
          optional
          hint={`Kept for ${field.retentionDays} days after the event closes.`}
          error={capture.form.errors[`visitor.${field.code}`]}
        >
          {(props) => (
            <Input
              {...props}
              type={field.type === 'text' ? 'text' : field.type}
              value={capture.form.values.visitor[field.code] ?? ''}
              disabled={capture.saving}
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => capture.editVisitor(field.code, event.target.value)}
            />
          )}
        </Field>
      ))}
    </>
  );
}

/** Optional visitor details are explicit, online only, and apart from counts. */
export function VisitorCaptureForm({
  stationId,
  categories,
}: {
  stationId: string;
  categories: CaptureCategoryRecord[];
}): ReactNode {
  const capture = useVisitorCapture(stationId);
  if (capture.active.length === 0) return null;
  return (
    <Card
      as="form"
      variant="flat"
      className="flex flex-col gap-md"
      onSubmit={(event: React.FormEvent) => {
        event.preventDefault();
        void capture.submit();
      }}
    >
      <h2 className="font-display text-section">Registration with visitor details</h2>
      <p className="text-text-muted">
        Optional. Ask only for details this event has declared. This form needs a connection; a
        registration is counted only after the server confirms it.
      </p>
      <VisitorCaptureInputs capture={capture} categories={categories} />
      {capture.error ? (
        <Callout tone="alert" role="alert">
          {capture.error}
        </Callout>
      ) : null}
      {capture.message ? <p role="status">{capture.message}</p> : null}
      <Button type="submit" disabled={capture.saving}>
        Record with details
      </Button>
    </Card>
  );
}
