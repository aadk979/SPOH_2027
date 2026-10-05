import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/;
const DOC_ROOT_FILES = new Set(['README.md', 'ONBOARDING_AND_FEATURES.md']);

export function isDocumentation(path) {
  if (typeof path !== 'string' || path.includes('\\') || path.split('/').includes('..'))
    return false;
  // Pricing snapshots and coverage floors are executable validation inputs.
  if (/^remediation\/reports\/P\d{2}\/pricing\//.test(path)) return false;
  return (
    DOC_ROOT_FILES.has(path) ||
    /^(docs|remediation)\/.+\.md$/.test(path) ||
    path === 'remediation/progress.json' ||
    /^remediation\/reports\/P\d{2}\/staging-[a-z0-9-]+-evidence-\d{4}-\d{2}-\d{2}\.json$/.test(path)
  );
}

export function classifyPaths(paths) {
  const fullCi = paths.length === 0 || paths.some((path) => !isDocumentation(path));
  return {
    fullCi,
    reason: fullCi ? 'Application, validation or unknown inputs' : 'Documentation only',
  };
}

export function git(args, cwd = process.cwd()) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function isAncestor(base, head, cwd) {
  if (!SHA.test(base) || !SHA.test(head)) throw new Error('Expected immutable commit SHAs');
  try {
    git(['merge-base', '--is-ancestor', base, head], cwd);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

export function changedPaths(base, head, cwd) {
  if (!SHA.test(base) || !SHA.test(head) || /^0+$/.test(base))
    throw new Error('Comparison commits are unavailable');
  // No rename detection: both a removed source and its new documentation name count.
  return git(['diff', '--no-renames', '--name-only', '-z', base, head, '--'], cwd)
    .split('\0')
    .filter(Boolean);
}

export function deliveryDecision(base, head, cwd) {
  if (!SHA.test(head)) throw new Error('Expected the checked-out immutable head SHA');
  try {
    if (!isAncestor(base, head, cwd)) throw new Error('Comparison is not an ancestor of head');
    const paths = changedPaths(base, head, cwd);
    return { schemaVersion: 1, base, head, ...classifyPaths(paths) };
  } catch {
    // Missing history never converts an unverified application into a docs run.
    return { schemaVersion: 1, base: null, head, fullCi: true, reason: 'Comparison unavailable' };
  }
}

function main() {
  const head = git(['rev-parse', 'HEAD']).trim();
  const decision = deliveryDecision(process.env.DELIVERY_BASE_SHA ?? '', head);
  if (decision.base) git(['diff', '--check', decision.base, head, '--']);
  writeFileSync('delivery-decision.json', `${JSON.stringify(decision, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `full_ci=${decision.fullCi}\n`);
  console.log(JSON.stringify(decision));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
