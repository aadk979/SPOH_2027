import { z } from 'zod';

/** Cognito owns the format; an exact provider read, not UUID bits, proves identity. */
export const cognitoSubject = z
  .string()
  .min(1)
  .max(2048)
  .refine(
    (value) =>
      value.trim() === value && !value.toLowerCase().startsWith('local:') && !/\p{Cc}/u.test(value),
  );
