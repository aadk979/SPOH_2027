import type { MyPermissionsResponse } from '@spoh/shared';

/**
 * What a screen test's viewer may do (P11.8): screens ask `useAllows` and `useMyPermissions`,
 * answered by the server's policies, rather than reading capabilities from `/me`.
 */
export function permissionsFor(
  actions: readonly string[],
  settings: Partial<MyPermissionsResponse['settings']> = {},
): MyPermissionsResponse {
  return {
    actions: Object.fromEntries(actions.map((action) => [action, true])),
    settings: { operational: false, security: false, privacy: false, ...settings },
  };
}

/** The `@/features/session` hooks a mocked module needs for these answers. */
export function permissionHooks(read: () => MyPermissionsResponse) {
  return {
    useAllows: () => (action: string) => read().actions[action] === true,
    useMyPermissions: () => ({ data: read(), isError: false, error: null, isPending: false }),
  };
}
