import type { Server } from 'node:http';

/**
 * How long an idle keep-alive socket stays open.
 *
 * API Gateway's private integration pools its upstream connections and reuses
 * idle ones. Node's default of 5 seconds closes a socket while the gateway may
 * be sending on it; the gateway reports that as a 33-byte 503 the app never
 * logs, which staging showed under a paced admin workload. Holding idle
 * sockets far longer makes the server's close, and so that race, rare.
 * server.close() still drops idle sockets at once, so shutdown is unchanged.
 */
export const KEEP_ALIVE_TIMEOUT_MS = 120_000;

export function applyHttpTimeouts(server: Server): Server {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  return server;
}
