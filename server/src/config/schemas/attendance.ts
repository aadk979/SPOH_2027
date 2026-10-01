import { z } from 'zod';

/** Verified attendance needs only its signing key at process boot. */
export const attendanceFields = {
  ATTENDANCE_SIGNING_SECRET: z.string().min(32).optional(),
};
