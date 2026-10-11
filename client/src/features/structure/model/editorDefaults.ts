import type {
  CategoryActivityRecord,
  EventDayRecord,
  ManagedShiftTemplate,
  ManagedStationTag,
  ManagedStationType,
  StationSummary,
} from '@spoh/shared';

const EMPTY_TYPE = {
  code: '',
  label: '',
  sortOrder: 0,
  registersVisitors: false,
  countsEntry: false,
  issuesStamp: false,
  redeemsGifts: false,
  active: true,
};
export function typeValues(record?: ManagedStationType) {
  const {
    code,
    label,
    sortOrder,
    registersVisitors,
    countsEntry,
    issuesStamp,
    redeemsGifts,
    active,
  } = record ?? EMPTY_TYPE;
  return {
    code,
    label,
    sortOrder,
    registersVisitors,
    countsEntry,
    issuesStamp,
    redeemsGifts,
    active,
  };
}
const EMPTY_TAG = { code: '', label: '', description: '', active: true };
export function tagValues(record?: ManagedStationTag) {
  const { code, label, description, active } = record ?? EMPTY_TAG;
  return { code, label, description: description ?? '', active };
}
const EMPTY_CATEGORY = { code: '', label: '', sortOrder: 0, active: true };
export function categoryValues(record?: CategoryActivityRecord) {
  const { code, label, sortOrder, active } = record ?? EMPTY_CATEGORY;
  return { code, label, sortOrder, active };
}
const EMPTY_DAY = { date: '', label: '', isPublicDay: true, isTourDay: false };
export function dayValues(record?: EventDayRecord) {
  const { date, label, isPublicDay, isTourDay } = record ?? EMPTY_DAY;
  return { date, label, isPublicDay, isTourDay };
}
const EMPTY_TEMPLATE = {
  code: '',
  label: '',
  startLocal: '',
  endLocal: '',
  endsNextDay: false,
  sortOrder: 0,
  active: true,
};
export function templateValues(record?: ManagedShiftTemplate) {
  const { code, label, startLocal, endLocal, endsNextDay, sortOrder, active } =
    record ?? EMPTY_TEMPLATE;
  return { code, label, startLocal, endLocal, endsNextDay, sortOrder, active };
}
export function stationValues(record?: StationSummary) {
  if (!record)
    return {
      code: '',
      name: '',
      typeCode: '',
      tagCodes: [] as string[],
      floor: '',
      sortOrder: 0,
      active: true,
    };
  return {
    code: record.code,
    name: record.name,
    typeCode: record.type.code,
    tagCodes: record.tags.map((tag) => tag.code),
    floor: record.floor ?? '',
    sortOrder: record.sortOrder,
    active: record.active,
  };
}
