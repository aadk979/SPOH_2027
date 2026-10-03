import { z } from 'zod';

const normalizedUrl = z.url({ normalize: true });

/** Origins are infrastructure destinations, never request-selected redirect paths. */
export function isClientConfigOrigin(value: string): boolean {
  const parsed = normalizedUrl.safeParse(value);
  return /^https?:\/\/[^/?#\s@\\]+$/.test(value) && parsed.success && parsed.data === `${value}/`;
}

const common = {
  version: z.literal(1),
  apiBaseUrl: z
    .string()
    .max(2048)
    .refine((value) => value === '' || isClientConfigOrigin(value)),
  envLabel: z.enum(['development', 'test', 'staging', 'production']),
};
const cognito = z.strictObject({
  region: z.string().min(1).max(64),
  userPoolId: z.string().min(1).max(128),
  clientId: z.string().min(1).max(128),
  domain: z.string().max(2048).refine(isClientConfigOrigin),
});

/** Explicit provider selection: missing Cognito metadata never means development auth. */
export const ClientConfigurationSchema = z.discriminatedUnion('authProvider', [
  z.strictObject({ ...common, authProvider: z.literal('local'), cognito: z.null() }),
  z.strictObject({ ...common, authProvider: z.literal('cognito'), cognito }),
]);
export type ClientConfiguration = z.infer<typeof ClientConfigurationSchema>;
export interface ClientConfigurationResponse {
  data: ClientConfiguration;
}
