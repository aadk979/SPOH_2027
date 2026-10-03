import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { exportRewrites, hostingConfig } from './hostingConfig.mjs';
import { prepareRelease, productionRuntime } from './prepareRelease.mjs';

const runtime = {
  version: 1,
  apiBaseUrl: 'https://api.fixture.example',
  envLabel: 'production',
  authProvider: 'cognito',
  cognito: {
    region: 'ap-southeast-1',
    userPoolId: 'fixture-pool',
    clientId: 'fixture-client',
    domain: 'https://auth.fixture.example',
  },
};
const files = [
  'index.html',
  '404.html',
  'sign-in.html',
  'sw.js',
  'e/_/home.html',
  'e/_/capture/register.html',
  'e/_/home.txt',
  'e/_/home/__next.e/$d$event/home/__PAGE__.txt',
  'e/_/home/__next._tree.txt',
  'sign-in/__next.sign-in/__PAGE__.txt',
];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'spoh-firebase-test-'));
  // This fixture alone owns the resolved temporary directory; no workspace cleanup is used.
  assert.equal(relative(resolve(tmpdir()), root).startsWith('spoh-firebase-test-'), true);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const exportDirectory = join(root, 'export');
  mkdirSync(exportDirectory);
  for (const file of files) {
    const destination = join(exportDirectory, file);
    mkdirSync(join(destination, '..'), { recursive: true });
    writeFileSync(destination, file);
  }
  return {
    root,
    exportDirectory,
    outputDirectory: join(root, 'release'),
    configuration: { data: runtime },
  };
}

function destination(path) {
  return exportRewrites(files).find((rule) => new RegExp(rule.regex).test(path))?.destination;
}

test('any event slug and nested screen resolve to their own exported HTML', () => {
  assert.equal(destination('/e/another-event/home'), '/e/_/home.html');
  assert.equal(destination('/e/sample/capture/register'), '/e/_/capture/register.html');
  assert.equal(destination('/e/sample/home.txt'), '/e/_/home.txt');
  assert.equal(destination('/'), '/index.html');
  assert.equal(destination('/sign-in'), '/sign-in.html');
  for (const path of [
    '/api/v1/events',
    '/e/sample/unknown',
    '/sign-in/extra',
    '/e/sample/home.js',
  ]) {
    assert.equal(destination(path), undefined);
  }
});

test('dot-joined Next payloads resolve without a full-page fallback', () => {
  const target = '/e/_/home/__next.e/$d$event/home/__PAGE__.txt';
  assert.equal(destination('/e/sample/home/__next.e.$d$event.home.__PAGE__.txt'), target);
  assert.equal(destination('/e/sample/home/__next.e.sample.home.__PAGE__.txt'), target);
  assert.equal(destination('/e/sample/home/__next._tree.txt'), '/e/_/home/__next._tree.txt');
  assert.equal(
    destination('/sign-in/__next.sign-in.__PAGE__.txt'),
    '/sign-in/__next.sign-in/__PAGE__.txt',
  );
});

test('bootstrap is a local JSON rewrite, with exact-origin CSP and deliberate cache rules', () => {
  const { hosting } = hostingConfig(files, runtime);
  assert.deepEqual(hosting.rewrites[0], {
    source: '/api/v1/client-config',
    destination: '/client-config.json',
  });
  assert.equal(
    hosting.rewrites.some((rule) => rule.function || rule.run),
    false,
  );
  const policy = hosting.headers[0].headers.find(
    (header) => header.key === 'Content-Security-Policy',
  ).value;
  assert.match(policy, /connect-src 'self' https:\/\/api\.fixture\.example;/);
  assert.equal(policy.includes('unsafe-eval'), false);
  assert.equal(hosting.headers[1].headers[0].value, 'public, max-age=31536000, immutable');
  assert.equal(hosting.headers[2].headers[0].value, 'no-store');
  for (const source of ['/client-config.json', '/api/v1/client-config']) {
    assert.equal(
      hosting.headers.find((rule) => rule.source === source).headers[0].value,
      'no-store',
    );
  }
});

test('preparation preserves original export bytes and publishes only the strict public envelope', (t) => {
  const options = fixture(t);
  const result = prepareRelease(options);
  assert.equal(result.exportedFiles, files.length);
  assert.equal(readFileSync(join(options.exportDirectory, 'index.html'), 'utf8'), 'index.html');
  assert.equal(existsSync(join(options.exportDirectory, 'client-config.json')), false);
  assert.deepEqual(
    JSON.parse(readFileSync(join(options.outputDirectory, 'public/client-config.json'), 'utf8')),
    options.configuration,
  );
  assert.equal(
    JSON.parse(readFileSync(join(options.outputDirectory, 'firebase.json'), 'utf8')).hosting.target,
    'client',
  );
  assert.throws(() => prepareRelease(options), /already exists/);
});

test('development, HTTP, placeholders, secret-shaped and incomplete metadata refuse before writes', (t) => {
  const options = fixture(t);
  const invalid = [
    { ...runtime, envLabel: 'staging' },
    { ...runtime, authProvider: 'local', cognito: null },
    { ...runtime, apiBaseUrl: '' },
    { ...runtime, apiBaseUrl: 'http://api.fixture.example' },
    { ...runtime, apiBaseUrl: 'https://api.example.invalid' },
    { ...runtime, apiBaseUrl: 'https://api.fixture.example/path' },
    { ...runtime, cognito: { ...runtime.cognito, domain: 'https://localhost' } },
    { ...runtime, cognito: { ...runtime.cognito, clientId: '' } },
    { ...runtime, SESSION_SIGNING_SECRET: 'never-copy-this' },
  ];
  for (const data of invalid)
    assert.throws(() => prepareRelease({ ...options, configuration: { data } }));
  assert.throws(() => productionRuntime({ data: runtime, secret: 'never-copy-this' }));
  assert.equal(existsSync(options.outputDirectory), false);
});

test('overlapping paths and incomplete exports cannot alter the source directory', (t) => {
  const options = fixture(t);
  assert.throws(
    () => prepareRelease({ ...options, outputDirectory: join(options.exportDirectory, 'new') }),
    /contain each other/,
  );
  assert.throws(
    () => prepareRelease({ ...options, outputDirectory: options.root }),
    /already exists/,
  );
  rmSync(join(options.exportDirectory, 'sw.js'));
  assert.throws(() => prepareRelease(options), /Incomplete static export/);
  assert.equal(existsSync(options.outputDirectory), false);
});

test('hidden inputs, API paths and symbolic links are refused before copying', (t) => {
  const options = fixture(t);
  const hidden = join(options.exportDirectory, '.env');
  writeFileSync(hidden, 'secret');
  assert.throws(() => prepareRelease(options), /Hidden files/);
  rmSync(hidden);
  mkdirSync(join(options.exportDirectory, 'api'));
  writeFileSync(join(options.exportDirectory, 'api/response.json'), '{}');
  assert.throws(() => prepareRelease(options), /API path/);
  rmSync(join(options.exportDirectory, 'api/response.json'));
  rmdirSync(join(options.exportDirectory, 'api'));
  symlinkSync(options.root, join(options.exportDirectory, 'linked'), 'junction');
  assert.throws(() => prepareRelease(options), /symlinks/);
  assert.equal(existsSync(options.outputDirectory), false);
});

test('CLI reports invalid public input without echoing secret values', (t) => {
  const options = fixture(t);
  const input = join(options.root, 'input.json');
  writeFileSync(input, JSON.stringify({ data: runtime, secret: 'DO-NOT-PRINT' }));
  const result = spawnSync(
    process.execPath,
    [
      'infra/firebase/prepareRelease.mjs',
      '--export',
      options.exportDirectory,
      '--runtime',
      input,
      '--output',
      options.outputDirectory,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid public configuration/);
  assert.equal(result.stderr.includes('DO-NOT-PRINT'), false);
  assert.equal(existsSync(options.outputDirectory), false);
  writeFileSync(input, '{"secret": "DO-NOT-PRINT", malformed');
  const malformed = spawnSync(
    process.execPath,
    [
      'infra/firebase/prepareRelease.mjs',
      '--export',
      options.exportDirectory,
      '--runtime',
      input,
      '--output',
      options.outputDirectory,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(malformed.status, 1);
  assert.equal(malformed.stderr.includes('DO-NOT-PRINT'), false);
});

test('directory aliases cannot bypass overlap checks or source-root validation', (t) => {
  const options = fixture(t);
  const alias = join(options.root, 'alias');
  symlinkSync(options.exportDirectory, alias, 'junction');
  assert.throws(() => prepareRelease({ ...options, exportDirectory: alias }), /regular directory/);
  assert.throws(
    () => prepareRelease({ ...options, outputDirectory: join(alias, 'nested/release') }),
    /contain each other/,
  );
  assert.equal(existsSync(join(options.exportDirectory, 'nested')), false);
});
