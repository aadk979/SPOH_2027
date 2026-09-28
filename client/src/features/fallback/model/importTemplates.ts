export type Target = 'registrations' | 'footfall';
export type Source = 'FALLBACK_SHEET' | 'PAPER';

export const TEMPLATES: Record<Target, string> = {
  registrations:
    'category,stationCode,timeBlockStart,count\n' +
    'SEC_4,SIGNUP_BOOTH,2027-01-07T03:30:00.000Z,12\n' +
    'PARENT_GUARDIAN,SIGNUP_BOOTH,2027-01-07T03:30:00.000Z,5',
  footfall:
    'stationCode,quantity,timeBlockStart\n' +
    'DCDF_STATION,42,2027-01-07T03:30:00.000Z\n' +
    'DCS_STATION,31,2027-01-07T03:30:00.000Z',
};
