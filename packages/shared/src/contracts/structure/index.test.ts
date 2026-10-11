import { describe, expect, it } from 'vitest';
import {
  CreateStationTypeRequest,
  UpdateStationTypeRequest,
  CreateStationTagRequest,
  UpdateStationTagRequest,
  CreateCaptureCategoryRequest,
  UpdateCaptureCategoryRequest,
  CreateManagedTemplateRequest,
  UpdateManagedTemplateRequest,
  UpdateShiftExceptionRequest,
  ShiftHours,
} from './index.js';
import { UpdateStationRequest } from '../station/index.js';
import { UpdateEventDayRequest, UpdateShiftTemplateRequest } from '../eventDays/index.js';
const key = '00000000-0000-4000-8000-000000000001';
describe('structure contracts', () => {
  it('keeps omitted patch fields omitted, including create defaults in Zod 4', () => {
    for (const schema of [
      UpdateStationTypeRequest,
      UpdateStationTagRequest,
      UpdateCaptureCategoryRequest,
    ]) {
      expect(schema.parse({ label: 'Renamed', idempotencyKey: key })).toEqual({
        label: 'Renamed',
        idempotencyKey: key,
      });
      expect(schema.safeParse({ idempotencyKey: key }).success).toBe(false);
      expect(schema.safeParse({ code: 'NEW', label: 'Changed', idempotencyKey: key }).success).toBe(
        false,
      );
    }
    expect(UpdateStationRequest.parse({ name: 'Rename' })).toEqual({ name: 'Rename' });
    expect(UpdateEventDayRequest.parse({ label: 'Rename' })).toEqual({ label: 'Rename' });
    expect(UpdateShiftTemplateRequest.parse({ label: 'Rename' })).toEqual({ label: 'Rename' });
    for (const schema of [
      UpdateStationRequest,
      UpdateEventDayRequest,
      UpdateShiftTemplateRequest,
      UpdateManagedTemplateRequest,
    ]) {
      expect(schema.safeParse({ idempotencyKey: key }).success).toBe(false);
    }
  });
  it('normalizes metadata codes without manufacturing patch capability changes', () => {
    expect(
      CreateStationTypeRequest.parse({ code: ' type ', label: ' Room ', idempotencyKey: key }),
    ).toEqual({
      code: 'TYPE',
      label: 'Room',
      sortOrder: 0,
      registersVisitors: false,
      countsEntry: false,
      issuesStamp: false,
      redeemsGifts: false,
      idempotencyKey: key,
    });
    expect(UpdateStationTypeRequest.parse({ countsEntry: true, idempotencyKey: key })).toEqual({
      countsEntry: true,
      idempotencyKey: key,
    });
    expect(
      CreateStationTagRequest.parse({ code: ' tag ', label: 'Group', idempotencyKey: key }),
    ).toMatchObject({ code: 'TAG', description: null });
    expect(UpdateStationTagRequest.parse({ description: null, idempotencyKey: key })).toEqual({
      description: null,
      idempotencyKey: key,
    });
    expect(
      CreateCaptureCategoryRequest.parse({ code: 'GUEST', label: 'Guest', idempotencyKey: key }),
    ).toMatchObject({ sortOrder: 0 });
    expect(
      CreateCaptureCategoryRequest.safeParse({ code: 'guest', label: 'Guest', idempotencyKey: key })
        .success,
    ).toBe(false);
  });
  it.each([
    ['09:00', '09:00'],
    ['13:00', '09:00'],
  ])('rejects empty/backwards same-day hours %s–%s', (startLocal, endLocal) => {
    expect(ShiftHours.safeParse({ startLocal, endLocal, endsNextDay: false }).success).toBe(false);
    expect(
      CreateManagedTemplateRequest.safeParse({
        code: 'BLOCK',
        label: 'Block',
        startLocal,
        endLocal,
        idempotencyKey: key,
      }).success,
    ).toBe(false);
    expect(
      UpdateShiftExceptionRequest.safeParse({
        operation: 'override',
        startLocal,
        endLocal,
        endsNextDay: false,
        idempotencyKey: key,
      }).success,
    ).toBe(false);
  });
  it('accepts overnight templates, validates wall time, and keeps restore an explicit operation', () => {
    expect(
      CreateManagedTemplateRequest.parse({
        code: 'NIGHT',
        label: 'Night',
        startLocal: '22:00',
        endLocal: '02:00',
        endsNextDay: true,
        idempotencyKey: key,
      }),
    ).toMatchObject({ endsNextDay: true, sortOrder: 0 });
    expect(
      CreateManagedTemplateRequest.safeParse({
        code: 'BAD',
        label: 'Bad',
        startLocal: '25:00',
        endLocal: '26:00',
        idempotencyKey: key,
      }).success,
    ).toBe(false);
    expect(
      UpdateShiftExceptionRequest.parse({ operation: 'restore', idempotencyKey: key }),
    ).toEqual({ operation: 'restore', idempotencyKey: key });
    expect(
      UpdateShiftExceptionRequest.safeParse({
        operation: 'restore',
        startLocal: '09:00',
        idempotencyKey: key,
      }).success,
    ).toBe(false);
    expect(
      UpdateManagedTemplateRequest.safeParse({ code: 'RENAME', idempotencyKey: key }).success,
    ).toBe(false);
  });
});
