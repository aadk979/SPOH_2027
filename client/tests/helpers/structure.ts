import type {
  EventDayRecord,
  ManagedShiftTemplate,
  ManagedStationTag,
  ManagedStationType,
  StationSummary,
  StructureResponse,
} from '@spoh/shared';
export const STRUCTURE_TYPE: ManagedStationType = {
  id: 'type',
  code: 'ROOM',
  label: 'Room',
  active: true,
  sortOrder: 1,
  registersVisitors: true,
  countsEntry: true,
  issuesStamp: false,
  redeemsGifts: false,
};
export const STRUCTURE_TAG: ManagedStationTag = {
  id: 'tag',
  code: 'GROUP',
  label: 'Group',
  active: true,
  description: 'Description',
};
export const STRUCTURE_TEMPLATE: ManagedShiftTemplate = {
  id: 'template',
  code: 'DAY',
  label: 'Day shift',
  active: true,
  startLocal: '09:00',
  endLocal: '13:00',
  endsNextDay: false,
  sortOrder: 0,
};
export const STRUCTURE: StructureResponse['data'] = {
  eventId: 'evt_test',
  timezone: 'Asia/Singapore',
  stationTypes: [STRUCTURE_TYPE],
  stationTags: [STRUCTURE_TAG],
  categories: [
    {
      id: 'category',
      code: 'GUEST',
      label: 'Guests',
      sortOrder: 0,
      active: true,
      updatedAt: '2027-01-01T00:00:00.000Z',
    },
  ],
  templates: [STRUCTURE_TEMPLATE],
  shifts: [
    {
      id: 'shift',
      eventDayId: 'day',
      date: '2027-01-07',
      dayLabel: 'Event day',
      templateId: 'template',
      startsAt: '2027-01-07T01:00:00.000Z',
      endsAt: '2027-01-07T05:00:00.000Z',
      overridden: false,
      startLocal: '09:00',
      endLocal: '13:00',
      endsNextDay: false,
    },
  ],
};
export const STRUCTURE_DAY: EventDayRecord = {
  id: 'day',
  date: '2027-01-07',
  label: 'Event day',
  isPublicDay: false,
  isTourDay: true,
  assignmentCount: 0,
  shifts: [
    {
      id: 'shift',
      code: 'DAY',
      label: 'Day shift',
      startsAt: '2027-01-07T01:00:00.000Z',
      endsAt: '2027-01-07T05:00:00.000Z',
    },
  ],
  createdAt: '2027-01-01T00:00:00.000Z',
};
export const STRUCTURE_STATION: StationSummary = {
  id: 'station',
  code: 'ROOM_ONE',
  name: 'Room One',
  active: true,
  floor: null,
  sortOrder: 0,
  type: {
    id: 'type',
    code: 'ROOM',
    label: 'Room',
    registersVisitors: true,
    countsEntry: true,
    issuesStamp: false,
    redeemsGifts: false,
  },
  tags: [{ id: 'tag', code: 'GROUP', label: 'Group' }],
};
