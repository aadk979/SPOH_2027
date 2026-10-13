import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, lstatSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateStaticManifest } from './generate-csp-manifest.mjs';

const clientRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sidecar = join(clientRoot, 'out.csp.json');
try {
  if (existsSync(sidecar)) {
    if (!lstatSync(sidecar).isFile() || lstatSync(sidecar).isSymbolicLink()) throw new Error('Invalid manifest path');
    unlinkSync(sidecar);
  }
  const require = createRequire(import.meta.url);
  const build = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], {
    cwd: clientRoot, env: { ...process.env, SPOH_STATIC_EXPORT: '1' }, stdio: 'inherit',
  });
  if (build.error || build.status !== 0) process.exitCode = build.status || 1;
  else {
    const result = generateStaticManifest(join(clientRoot, 'out'));
    process.stdout.write(`Static CSP: ${result.documents} verified documents\n`);
  }
} catch { process.stderr.write('Static build/manifest pairing refused\n'); process.exitCode = 1; }
