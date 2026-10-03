import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { ClientConfigurationSchema } from '@spoh/shared';
import { hostingConfig } from './hostingConfig.mjs';

const envelope = z.strictObject({ data: ClientConfigurationSchema });

/** A public allowlist is the only environment-specific addition to the immutable export. */
export function productionRuntime(input) {
  const { data } = envelope.parse(input);
  if (data.envLabel !== 'production' || data.authProvider !== 'cognito') {
    throw new Error('Firebase release requires explicit production Cognito metadata');
  }
  for (const origin of [data.apiBaseUrl, data.cognito.domain]) {
    const url = new URL(origin);
    if (
      url.protocol !== 'https:' ||
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.invalid')
    ) {
      throw new Error('Firebase release requires concrete HTTPS origins');
    }
  }
  return data;
}

function exportFiles(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
      throw new Error(`Hidden files and symlinks are not static export inputs: ${path}`);
    }
    if (entry.isDirectory()) return exportFiles(root, path);
    if (!entry.isFile()) throw new Error(`Not a regular static export file: ${path}`);
    return [path];
  });
}

function assertSeparatePaths(exportRoot, outputRoot) {
  for (const [parent, child] of [
    [exportRoot, outputRoot],
    [outputRoot, exportRoot],
  ]) {
    const path = relative(parent, child);
    if (path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))) {
      throw new Error('Export and output directories must not contain each other');
    }
  }
  if (existsSync(outputRoot))
    throw new Error('Output already exists; choose a new release directory');
}

function resolvedOutput(path) {
  if (existsSync(path)) throw new Error('Output already exists; choose a new release directory');
  let ancestor = resolve(path, '..');
  while (!existsSync(ancestor)) ancestor = resolve(ancestor, '..');
  return resolve(realpathSync(ancestor), relative(ancestor, path));
}

function publicInput(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('Cannot read public configuration JSON');
  }
}

/** Preparation never contacts Firebase, deploys, deletes, or changes the original export. */
export function prepareRelease({ exportDirectory, outputDirectory, configuration }) {
  const runtime = productionRuntime(configuration);
  const exportInput = resolve(exportDirectory);
  if (!lstatSync(exportInput).isDirectory() || lstatSync(exportInput).isSymbolicLink()) {
    throw new Error('Static export root must be a regular directory');
  }
  const exportRoot = realpathSync(exportInput);
  const outputRoot = resolvedOutput(resolve(outputDirectory));
  assertSeparatePaths(exportRoot, outputRoot);
  const files = exportFiles(exportRoot);
  if (!['index.html', '404.html', 'sign-in.html', 'sw.js'].every((file) => files.includes(file))) {
    throw new Error(
      'Incomplete static export: index, 404, sign-in and service worker are required',
    );
  }
  if (files.some((file) => file.startsWith('api/') || file === 'client-config.json')) {
    throw new Error('Static export must not supply runtime metadata or an API path');
  }
  const config = hostingConfig(files, runtime);
  mkdirSync(outputRoot, { recursive: true });
  cpSync(exportRoot, join(outputRoot, 'public'), { recursive: true });
  writeFileSync(join(outputRoot, 'public', 'client-config.json'), json({ data: runtime }));
  writeFileSync(join(outputRoot, 'firebase.json'), json(config));
  return { outputRoot, exportedFiles: files.length, rewrites: config.hosting.rewrites.length };
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function main() {
  const { values } = parseArgs({
    options: {
      export: { type: 'string' },
      runtime: { type: 'string' },
      output: { type: 'string' },
    },
  });
  if (!values.export || !values.runtime || !values.output) {
    throw new Error(
      'Usage: --export <static export> --runtime <public JSON envelope> --output <new dir>',
    );
  }
  const result = prepareRelease({
    exportDirectory: values.export,
    outputDirectory: values.output,
    configuration: publicInput(values.runtime),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    // Validation diagnostics may contain rejected input; never print potentially secret values.
    process.stderr.write(
      `Firebase preparation refused: ${error instanceof z.ZodError ? 'invalid public configuration' : error.message}\n`,
    );
    process.exitCode = 1;
  }
}
