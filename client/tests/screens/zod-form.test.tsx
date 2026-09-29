import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CreateAnnouncementRequest,
  CreateLostFoundRequest,
  RaiseLostPersonRequest,
  UpdateVolunteerRequest,
} from '@spoh/shared';
import { useZodForm } from '@/shared/hooks/useZodForm';
import { ChoiceGroup } from '@/shared/ui';

afterEach(cleanup);

describe('shared request form', () => {
  it('returns server schema messages and clears only the changed field', () => {
    const { result } = renderHook(() =>
      useZodForm(RaiseLostPersonRequest, { descriptionText: '', approxAge: 'x'.repeat(41) }),
    );
    const input = { ...result.current.values, idempotencyKey: crypto.randomUUID() };
    const parsed = RaiseLostPersonRequest.safeParse(input);
    act(() => {
      expect(result.current.validate(input)).toBeNull();
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('Expected shared-schema rejection');
    expect(result.current.errors.descriptionText).toBe(
      parsed.error.issues.find((issue) => issue.path[0] === 'descriptionText')?.message,
    );
    act(() => result.current.setField('descriptionText', 'Child in red'));
    expect(result.current.errors.descriptionText).toBeUndefined();
    expect(result.current.errors.approxAge).toBeTruthy();
  });

  it('returns transformed data without changing editable text and resets values/errors', () => {
    const { result } = renderHook(() =>
      useZodForm(CreateLostFoundRequest, { itemLabel: '  Bottle  ' }),
    );
    act(() => {
      expect(result.current.validate()).toEqual({ itemLabel: 'Bottle' });
    });
    expect(result.current.values.itemLabel).toBe('  Bottle  ');
    act(() => result.current.setField('itemLabel', ''));
    act(() => {
      result.current.validate();
    });
    expect(result.current.errors.itemLabel).toBeTruthy();
    act(() => result.current.reset({ itemLabel: 'Bag' }));
    expect(result.current.values.itemLabel).toBe('Bag');
    expect(result.current.errors).toEqual({});
  });

  it('clears previous errors after a successful validation', () => {
    const { result } = renderHook(() => useZodForm(CreateLostFoundRequest, { itemLabel: '' }));
    act(() => {
      result.current.validate();
    });
    act(() => {
      result.current.validate({ itemLabel: 'Keys' });
    });
    expect(result.current.errors).toEqual({});
  });

  it('maps nested schema paths to the editable field that owns them', () => {
    const { result } = renderHook(() =>
      useZodForm(
        CreateAnnouncementRequest,
        { body: 'Hello', stationId: '' },
        { target: 'stationId' },
      ),
    );
    act(() => {
      result.current.validate({ body: 'Hello', target: { stationId: '' } });
    });
    expect(result.current.errors.stationId).toBeTruthy();
    expect(result.current.errors['target.stationId']).toBeUndefined();
    act(() => result.current.setField('stationId', 'room-a'));
    expect(result.current.errors.stationId).toBeUndefined();
  });

  it('keeps a root refinement under _form and clears it on the next edit', () => {
    const { result } = renderHook(() => useZodForm(UpdateVolunteerRequest, { phone: '' }));
    act(() => {
      result.current.validate({});
    });
    expect(result.current.errors._form).toBe('supply at least one field to change');
    act(() => result.current.setField('phone', '91234567'));
    expect(result.current.errors._form).toBeUndefined();
  });

  it('applies repeated updates to the latest value', () => {
    const { result } = renderHook(() => useZodForm(CreateLostFoundRequest, { count: 0 }));
    act(() => {
      result.current.updateField('count', (count) => count + 1);
      result.current.updateField('count', (count) => count + 1);
    });
    expect(result.current.values.count).toBe(2);
  });

  it('associates a Choice error with its radio group', () => {
    render(
      <ChoiceGroup
        legend="Priority"
        name="priority"
        value="LOW"
        options={[{ value: 'LOW', label: 'Low' }]}
        onChange={() => {}}
        error="Choose a priority"
      />,
    );
    const group = screen.getByRole('group');
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(group.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });
});
