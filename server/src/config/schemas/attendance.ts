import { z } from 'zod';
import { parseCidr } from '../../platform/http/campusNetwork.js';
import { CsvList } from './common.js';

/** Verified attendance: the root account, its signing key and the campus network. */
export const attendanceFields = {
  ATTENDANCE_ROOT_EMAIL: z
    .email()
    .transform((value) => value.toLowerCase())
    .optional(),
  ATTENDANCE_SIGNING_SECRET: z.string().min(32).optional(),
  ATTENDANCE_SP_CIDRS: CsvList.default([]).superRefine((cidrs, ctx) => {
    for (const cidr of cidrs) {
      try {
        parseCidr(cidr);
      } catch {
        ctx.addIssue({ code: 'custom', message: `Invalid campus CIDR: ${cidr}` });
      }
    }
  }),
};
