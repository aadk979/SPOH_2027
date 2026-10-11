import { z } from 'zod';
import { Id, IdempotencyKey, IsoDate, IsoDateTime } from '../common/index.js';
import { StationCode, StationTypeSummary, StationTagSummary } from '../station/index.js';
import { CategoryActivityRecord } from '../taxonomy/categoryActivity.js';
import { CategoryCode } from '../registration/index.js';
import { ShiftTemplateRecord } from '../eventDays/index.js';
import { WallClockTime } from '../settings/index.js';

const Label = z.string().trim().min(1).max(120);
const SortOrder = z.number().int().min(0).max(9999);
const Receipt = { idempotencyKey: IdempotencyKey };
const changed = (patch: object) => Object.keys(patch).some((key) => key !== 'idempotencyKey');
const changeMessage = { message: 'supply at least one field to change' };

export const ManagedStationType = StationTypeSummary.extend({
  active: z.boolean(),
  sortOrder: z.number().int(),
}).strict();
export type ManagedStationType = z.infer<typeof ManagedStationType>;
export const ManagedStationTag = StationTagSummary.extend({
  active: z.boolean(),
  description: z.string().nullable(),
}).strict();
export type ManagedStationTag = z.infer<typeof ManagedStationTag>;
export const ManagedShiftTemplate = ShiftTemplateRecord.extend({ active: z.boolean() }).strict();
export type ManagedShiftTemplate = z.infer<typeof ManagedShiftTemplate>;

const TypeFields = z
  .object({
    label: Label,
    sortOrder: SortOrder.default(0),
    registersVisitors: z.boolean().default(false),
    countsEntry: z.boolean().default(false),
    issuesStamp: z.boolean().default(false),
    redeemsGifts: z.boolean().default(false),
  })
  .strict();
export const CreateStationTypeRequest = TypeFields.extend({
  code: StationCode,
  ...Receipt,
}).strict();
export type CreateStationTypeRequest = z.infer<typeof CreateStationTypeRequest>;
export const UpdateStationTypeRequest = TypeFields.partial()
  .extend({
    sortOrder: SortOrder.optional(),
    registersVisitors: z.boolean().optional(),
    countsEntry: z.boolean().optional(),
    issuesStamp: z.boolean().optional(),
    redeemsGifts: z.boolean().optional(),
  })
  .extend({ active: z.boolean().optional(), ...Receipt })
  .strict()
  .refine(changed, changeMessage);
export type UpdateStationTypeRequest = z.infer<typeof UpdateStationTypeRequest>;

const TagFields = z
  .object({ label: Label, description: z.string().trim().max(500).nullable().default(null) })
  .strict();
export const CreateStationTagRequest = TagFields.extend({ code: StationCode, ...Receipt }).strict();
export type CreateStationTagRequest = z.infer<typeof CreateStationTagRequest>;
export const UpdateStationTagRequest = TagFields.partial()
  .extend({ description: z.string().trim().max(500).nullable().optional() })
  .extend({ active: z.boolean().optional(), ...Receipt })
  .strict()
  .refine(changed, changeMessage);
export type UpdateStationTagRequest = z.infer<typeof UpdateStationTagRequest>;

const CategoryFields = z.object({ label: Label, sortOrder: SortOrder.default(0) }).strict();
export const CreateCaptureCategoryRequest = CategoryFields.extend({
  code: CategoryCode,
  ...Receipt,
}).strict();
export type CreateCaptureCategoryRequest = z.infer<typeof CreateCaptureCategoryRequest>;
export const UpdateCaptureCategoryRequest = CategoryFields.partial()
  .extend({ sortOrder: SortOrder.optional() })
  .extend({ active: z.boolean().optional(), ...Receipt })
  .strict()
  .refine(changed, changeMessage);
export type UpdateCaptureCategoryRequest = z.infer<typeof UpdateCaptureCategoryRequest>;

export const ShiftHours = z
  .object({ startLocal: WallClockTime, endLocal: WallClockTime, endsNextDay: z.boolean() })
  .strict()
  .refine((hours) => hours.endsNextDay || hours.endLocal > hours.startLocal, {
    path: ['endLocal'],
    message: 'A shift must end after it starts; select next day for an overnight shift.',
  });
export const CreateManagedTemplateRequest = z
  .object({
    code: StationCode,
    label: Label,
    startLocal: WallClockTime,
    endLocal: WallClockTime,
    endsNextDay: z.boolean().default(false),
    sortOrder: SortOrder.default(0),
    ...Receipt,
  })
  .strict()
  .refine(
    (body) =>
      ShiftHours.safeParse({
        startLocal: body.startLocal,
        endLocal: body.endLocal,
        endsNextDay: body.endsNextDay,
      }).success,
    {
      path: ['endLocal'],
      message: 'A shift must end after it starts; select next day for an overnight shift.',
    },
  );
export type CreateManagedTemplateRequest = z.infer<typeof CreateManagedTemplateRequest>;
export const UpdateManagedTemplateRequest = z
  .object({
    label: Label.optional(),
    startLocal: WallClockTime.optional(),
    endLocal: WallClockTime.optional(),
    endsNextDay: z.boolean().optional(),
    sortOrder: SortOrder.optional(),
    active: z.boolean().optional(),
    ...Receipt,
  })
  .strict()
  .refine(changed, changeMessage);
export type UpdateManagedTemplateRequest = z.infer<typeof UpdateManagedTemplateRequest>;

export const UpdateShiftExceptionRequest = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('override'),
      startLocal: WallClockTime,
      endLocal: WallClockTime,
      endsNextDay: z.boolean(),
      ...Receipt,
    })
    .strict()
    .refine((body) => body.endsNextDay || body.endLocal > body.startLocal, {
      path: ['endLocal'],
      message: 'A shift must end after it starts.',
    }),
  z.object({ operation: z.literal('restore'), ...Receipt }).strict(),
]);
export type UpdateShiftExceptionRequest = z.infer<typeof UpdateShiftExceptionRequest>;
export const ShiftExceptionRecord = z
  .object({
    id: Id,
    eventDayId: Id,
    date: IsoDate,
    dayLabel: z.string(),
    templateId: Id,
    startsAt: IsoDateTime,
    endsAt: IsoDateTime,
    overridden: z.boolean(),
    startLocal: WallClockTime,
    endLocal: WallClockTime,
    endsNextDay: z.boolean(),
  })
  .strict();
export type ShiftExceptionRecord = z.infer<typeof ShiftExceptionRecord>;

export const StructureResponse = z
  .object({
    data: z
      .object({
        eventId: Id,
        timezone: z.string(),
        stationTypes: z.array(ManagedStationType),
        stationTags: z.array(ManagedStationTag),
        categories: z.array(CategoryActivityRecord),
        templates: z.array(ManagedShiftTemplate),
        shifts: z.array(ShiftExceptionRecord),
      })
      .strict(),
  })
  .strict();
export type StructureResponse = z.infer<typeof StructureResponse>;
export const RemoveEventDayRequest = z.object({ idempotencyKey: IdempotencyKey }).strict();
export type RemoveEventDayRequest = z.infer<typeof RemoveEventDayRequest>;
