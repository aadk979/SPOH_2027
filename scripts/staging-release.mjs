import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  changedPaths,
  classifyPaths,
  deliveryDecision,
  git,
  isAncestor,
} from './delivery-changes.mjs';

export function verifyDecision(manifest, expectedHead, cwd) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.head !== expectedHead ||
    typeof manifest.fullCi !== 'boolean' ||
    !(manifest.base === null || /^[a-f0-9]{40}$/.test(manifest.base))
  )
    throw new Error('Invalid CI delivery evidence');
  if (manifest.base === null) {
    if (!manifest.fullCi) throw new Error('Missing comparison cannot prove documentation only');
    return;
  }
  const expected = deliveryDecision(manifest.base, expectedHead, cwd);
  if (expected.base !== manifest.base || expected.fullCi !== manifest.fullCi)
    throw new Error('CI delivery evidence does not match the checked-out range');
}

export function branchDecision(candidate, main, cwd) {
  if (!isAncestor(candidate, main, cwd))
    return { eligible: false, reason: 'Release is no longer on main' };
  if (candidate !== main && classifyPaths(changedPaths(candidate, main, cwd)).fullCi)
    return { eligible: false, reason: 'A newer application change awaits its own acceptance' };
  return {
    eligible: true,
    reason: 'Latest application source, possibly followed by documentation',
  };
}

export function deployedDecision(candidate, deployed, cwd) {
  if (candidate === deployed) return { eligible: false, reason: 'Release already deployed' };
  if (!/^[a-f0-9]{40}$/.test(deployed)) throw new Error('Cannot verify current staging image');
  if (isAncestor(candidate, deployed, cwd))
    return { eligible: false, reason: 'A newer release is already deployed' };
  if (!isAncestor(deployed, candidate, cwd)) throw new Error('Automatic release histories diverge');
  return { eligible: true, reason: 'Forward staging release' };
}

export function manualDeploymentDecision(runs, ciStartedAt) {
  const started = Date.parse(ciStartedAt);
  if (!Number.isFinite(started) || !Array.isArray(runs))
    throw new Error('Cannot verify manual deployment ordering');
  for (const run of runs) {
    if (run.event !== 'workflow_dispatch') throw new Error('Unexpected manual deployment evidence');
    if (['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(run.status))
      return { eligible: false, reason: 'An explicit manual deployment is pending' };
    if (run.status !== 'completed') throw new Error('Unknown manual deployment status');
    if (['cancelled', 'skipped'].includes(run.conclusion)) continue;
    if (
      ![
        'success',
        'failure',
        'timed_out',
        'action_required',
        'neutral',
        'stale',
        'startup_failure',
      ].includes(run.conclusion)
    )
      throw new Error('Unknown manual deployment conclusion');
    const completed = Date.parse(run.updated_at);
    if (!Number.isFinite(completed)) throw new Error('Missing manual deployment timestamp');
    if (completed >= started)
      return { eligible: false, reason: 'A later manual deployment fences this in-flight release' };
  }
  return { eligible: true, reason: 'No later manual deployment' };
}

async function checkManualDeployments() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !process.env.GITHUB_TOKEN)
    throw new Error('Missing repository-scoped manual deployment evidence access');
  for (let page = 1; page <= 100; page++) {
    const url = `https://api.github.com/repos/${repository}/actions/workflows/deploy-staging.yml/runs?event=workflow_dispatch&per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Cannot verify manual deployments: HTTP ${response.status}`);
    const decision = manualDeploymentDecision(
      (await response.json()).workflow_runs,
      process.env.DELIVERY_CI_STARTED_AT,
    );
    if (!decision.eligible || !response.headers.get('link')?.includes('rel="next"'))
      return decision;
  }
  throw new Error('Manual deployment evidence exceeds the bounded page limit');
}

async function main() {
  const candidate = git(['rev-parse', 'HEAD']).trim();
  let decision;
  if (process.env.DELIVERY_MANUAL === 'true') {
    decision = { eligible: true, reason: 'Explicit manual deployment or rollback' };
  } else {
    const manifest = JSON.parse(readFileSync(process.env.DELIVERY_MANIFEST, 'utf8'));
    verifyDecision(manifest, candidate);
    if (!manifest.fullCi) {
      decision = { eligible: false, reason: 'Documentation-only CI does not deploy' };
    } else {
      git(['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
      decision = branchDecision(candidate, git(['rev-parse', 'origin/main']).trim());
      if (decision.eligible && process.env.DELIVERY_CHECK_DEPLOYED === 'true')
        decision = deployedDecision(candidate, process.env.DELIVERY_DEPLOYED_SHA ?? '');
      if (decision.eligible && process.env.DELIVERY_CHECK_MANUAL === 'true')
        decision = await checkManualDeployments();
    }
  }
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `eligible=${decision.eligible}\nsha=${candidate}\n`);
  console.log(JSON.stringify(decision));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
