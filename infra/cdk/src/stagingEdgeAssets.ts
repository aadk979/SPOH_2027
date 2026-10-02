import { readFileSync } from 'node:fs';
import { STAGING_EDGE } from './config.js';

function asset(name: string) {
  return readFileSync(
    new URL(`../assets/staging-edge/${name}`, import.meta.url),
    'utf8',
  ).replaceAll('\r\n', '\n');
}

/** Names and upstream are infrastructure inputs, never credentials or executable shell input. */
export function stagingCaddyfile(apiOrigin: string) {
  return asset('Caddyfile')
    .replaceAll('@@CLIENT_HOST@@', STAGING_EDGE.clientHost)
    .replaceAll('@@API_HOST@@', STAGING_EDGE.apiHost)
    .replaceAll('@@API_ORIGIN@@', apiOrigin);
}

export function stagingEdgeBootstrap(apiOrigin: string) {
  const script = asset('bootstrap.sh')
    .replace('@@CADDYFILE@@', stagingCaddyfile(apiOrigin))
    .replace('@@SERVICE@@', asset('caddy.service'));
  // Lightsail appends user data to its own /bin/sh script; an embedded shebang is ignored.
  return `bash <<'SPOH_EDGE_BOOTSTRAP'\n${script}\nSPOH_EDGE_BOOTSTRAP\n`;
}
