#!/usr/bin/env node
/* eslint-disable no-console -- a CLI; stdout is its interface */
/**
 * Progress tracker for the remediation programme.
 *
 * The phase files and DECISIONS.md define the structure (phases, steps,
 * decisions). progress.json holds the state (status, timestamps, commits,
 * notes). `sync` merges the first into the second without ever discarding
 * state, so editing a phase file never loses progress.
 *
 *   node remediation/tools/progress.mjs status             where are we, what is next
 *   node remediation/tools/progress.mjs next               the next actionable step only
 *   node remediation/tools/progress.mjs start P06.3        mark a step (or phase) in progress
 *   node remediation/tools/progress.mjs done P06.3 --commit abc1234 --note "split admin"
 *   node remediation/tools/progress.mjs skip P00.9 --note "no staging access"
 *   node remediation/tools/progress.mjs block P08.5 --note "waiting on domain (D-08)"
 *   node remediation/tools/progress.mjs reset P06.3        back to not_started
 *   node remediation/tools/progress.mjs decide D-05 --answer "fast-forward approved"
 *   node remediation/tools/progress.mjs decide G1 --answer "design approved 2026-10-07"
 *   node remediation/tools/progress.mjs log "Finished P03; context high, handing over"
 *   node remediation/tools/progress.mjs sync               re-read phase files / decisions
 *   node remediation/tools/progress.mjs validate           consistency check (exit 1 on error)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..');
const REPO = join(DIR, '..');
const PROGRESS = join(DIR, 'progress.json');
const PHASES_DIR = join(DIR, 'phases');
const DECISIONS = join(DIR, 'DECISIONS.md');

const STEP_STATUSES = ['not_started', 'in_progress', 'blocked', 'done', 'skipped'];
const FINISHED = new Set(['done', 'skipped']);

const GATES = [
  { id: 'G0', title: 'Facts established: baseline and audits', signoff: false },
  { id: 'G1', title: 'Design signed off by the owner', signoff: true },
  { id: 'G2', title: 'Clean architecture, identical behaviour', signoff: false },
  { id: 'G3', title: 'Platform core on staging', signoff: false },
  { id: 'G4', title: 'Product complete and interlinked', signoff: false },
  { id: 'G5', title: 'Production ready', signoff: false },
];

// ---------------------------------------------------------------------------
// Parsing the structure

function parseList(value) {
  if (!value || /^[—-]$/.test(value.trim())) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function headerField(text, name) {
  const match = text.match(new RegExp(`^\\|\\s*${name}\\s*\\|\\s*(.*?)\\s*\\|\\s*$`, 'm'));
  return match ? match[1].replace(/\*/g, '').trim() : '';
}

function parsePhaseFile(file) {
  const text = readFileSync(join(PHASES_DIR, file), 'utf8');
  const heading = text.match(/^# (P\d{2}) — (.+)$/m);
  if (!heading) throw new Error(`${file}: missing "# Pnn — Title" heading`);
  const steps = [...text.matchAll(/^### (P\d{2}\.\d+) — (.+)$/gm)].map((m) => ({
    id: m[1],
    title: m[2].trim(),
  }));
  return {
    id: heading[1],
    title: heading[2].replace(/\s*⛔.*$/, '').trim(),
    file: relative(DIR, join(PHASES_DIR, file)),
    gate: headerField(text, 'Gate'),
    dependsOn: parseList(headerField(text, 'Depends on')),
    decisions: parseList(headerField(text, 'Decisions')),
    changesBehaviour: headerField(text, 'Changes behaviour'),
    size: headerField(text, 'Size'),
    steps,
  };
}

function parsePhases() {
  return readdirSync(PHASES_DIR)
    .filter((f) => /^P\d{2}-.+\.md$/.test(f))
    .sort()
    .map(parsePhaseFile);
}

function parseDecisions() {
  const text = readFileSync(DECISIONS, 'utf8');
  const blocks = text.split(/^### /m).slice(1);
  return blocks
    .map((block) => {
      const head = block.match(/^(D-\d{2}) — (.+)$/m);
      if (!head) return null;
      const field = (name) => (block.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`)) ?? [])[1];
      return {
        id: head[1],
        title: head[2].trim(),
        owner: (field('Owner') ?? '').trim(),
        blocks: parseList(field('Blocks')),
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// State

function now() {
  return new Date().toISOString();
}

function emptyState() {
  return {
    schemaVersion: 1,
    programme: 'SPOH platform remediation',
    repository: 'aadk979/SPOH_2027',
    workingBranch: 'claude/inspiring-ritchie-203bp3',
    baseline: {
      commit: 'd2497b6',
      auditBranchCommit: '319d06d',
      measuredAt: '2026-09-25',
      file: 'baseline.md',
    },
    createdAt: now(),
    updatedAt: now(),
    current: { phase: null, step: null },
    gates: [],
    decisions: [],
    phases: [],
    sessionLog: [],
  };
}

function load() {
  return existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : emptyState();
}

function save(state) {
  state.updatedAt = now();
  writeFileSync(PROGRESS, `${JSON.stringify(state, null, 2)}\n`);
  formatIfPossible();
}

/** Keep the file prettier-clean when the repo's prettier is installed; never required. */
function formatIfPossible() {
  const bin = join(REPO, 'node_modules', '.bin', 'prettier');
  if (!existsSync(bin)) return;
  try {
    execFileSync(bin, ['--write', PROGRESS], { stdio: 'ignore' });
  } catch {
    // Formatting is cosmetic; the JSON is already valid.
  }
}

function mergeById(existing, incoming, build) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  return incoming.map((item) => build(item, byId.get(item.id)));
}

function sync(state) {
  state.gates = mergeById(state.gates, GATES, (gate, prev) => ({
    ...gate,
    status: prev?.status ?? 'pending',
    passedAt: prev?.passedAt ?? null,
    note: prev?.note ?? null,
  }));
  state.decisions = mergeById(state.decisions, parseDecisions(), (d, prev) => ({
    ...d,
    status: prev?.status ?? 'open',
    answer: prev?.answer ?? null,
    answeredAt: prev?.answeredAt ?? null,
  }));
  state.phases = mergeById(state.phases, parsePhases(), (phase, prev) => ({
    ...phase,
    status: prev?.status ?? 'not_started',
    startedAt: prev?.startedAt ?? null,
    completedAt: prev?.completedAt ?? null,
    steps: mergeById(prev?.steps ?? [], phase.steps, (step, prevStep) => ({
      ...step,
      status: prevStep?.status ?? 'not_started',
      startedAt: prevStep?.startedAt ?? null,
      completedAt: prevStep?.completedAt ?? null,
      commits: prevStep?.commits ?? [],
      notes: prevStep?.notes ?? [],
    })),
  }));
  return state;
}

// ---------------------------------------------------------------------------
// Queries

function findPhase(state, id) {
  return state.phases.find((p) => p.id === id);
}

function findStep(state, id) {
  const phase = findPhase(state, id.split('.')[0]);
  return phase?.steps.find((s) => s.id === id);
}

function openDecisionsBlocking(state, id) {
  const phaseId = id.split('.')[0];
  return state.decisions.filter(
    (d) => d.status !== 'answered' && (d.blocks.includes(id) || d.blocks.includes(phaseId)),
  );
}

function unmetDependencies(state, phase) {
  const unmet = phase.dependsOn.filter((dep) => findPhase(state, dep)?.status !== 'done');
  const needsG1 = phase.gate !== 'G0' && phase.gate !== 'G1';
  const g1 = state.gates.find((g) => g.id === 'G1');
  if (needsG1 && g1?.status !== 'passed') unmet.push('G1 sign-off');
  return unmet;
}

function actionableSteps(state) {
  const result = [];
  for (const phase of state.phases) {
    if (phase.status === 'done') continue;
    if (unmetDependencies(state, phase).length > 0) continue;
    for (const step of phase.steps) {
      if (FINISHED.has(step.status) || step.status === 'blocked') continue;
      if (openDecisionsBlocking(state, step.id).length > 0) continue;
      result.push({ phase, step });
    }
  }
  return result;
}

function gateComplete(state, gate) {
  const phases = state.phases.filter((p) => p.gate === gate.id);
  return phases.length > 0 && phases.every((p) => p.status === 'done');
}

// ---------------------------------------------------------------------------
// Commands

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1] ?? true;
      i += 1;
    }
  }
  return flags;
}

function setStepStatus(state, id, status, flags) {
  const step = findStep(state, id);
  if (!step) throw new Error(`unknown step ${id}`);
  const phase = findPhase(state, id.split('.')[0]);
  if (status === 'in_progress' && !flags.force) assertStartable(state, phase, id);
  step.status = status;
  if (status === 'in_progress') step.startedAt ??= now();
  if (FINISHED.has(status)) step.completedAt = now();
  if (status === 'not_started') Object.assign(step, { startedAt: null, completedAt: null });
  if (flags.commit) step.commits.push(String(flags.commit));
  if (flags.note) step.notes.push({ at: now(), text: String(flags.note) });
  if (status === 'in_progress' && phase.status === 'not_started') {
    phase.status = 'in_progress';
    phase.startedAt = now();
  }
  state.current = status === 'in_progress' ? { phase: phase.id, step: id } : state.current;
}

function assertStartable(state, phase, id) {
  const unmet = unmetDependencies(state, phase);
  if (unmet.length > 0)
    throw new Error(`${id}: waiting on ${unmet.join(', ')} (use --force to override)`);
  const blocking = openDecisionsBlocking(state, id);
  if (blocking.length > 0) {
    throw new Error(`${id}: blocked by open ${blocking.map((d) => d.id).join(', ')} (use --force)`);
  }
}

function setPhaseStatus(state, id, status, flags) {
  const phase = findPhase(state, id);
  if (!phase) throw new Error(`unknown phase ${id}`);
  const open = phase.steps.filter((s) => !FINISHED.has(s.status));
  if (status === 'done' && open.length > 0 && !flags.force) {
    throw new Error(
      `${id}: ${open.length} step(s) not finished: ${open.map((s) => s.id).join(', ')}`,
    );
  }
  if (status === 'in_progress' && !flags.force) assertStartable(state, phase, id);
  phase.status = status;
  if (status === 'in_progress') phase.startedAt ??= now();
  if (status === 'done') phase.completedAt = now();
  if (status === 'done') {
    const next = actionableSteps(state)[0];
    state.current = next ? { phase: next.phase.id, step: null } : { phase: null, step: null };
  }
}

function decide(state, id, flags) {
  if (!flags.answer) throw new Error('decide needs --answer "…"');
  const gate = state.gates.find((g) => g.id === id);
  if (gate) {
    Object.assign(gate, { status: 'passed', passedAt: now(), note: String(flags.answer) });
    return;
  }
  const decision = state.decisions.find((d) => d.id === id);
  if (!decision) throw new Error(`unknown decision or gate ${id}`);
  Object.assign(decision, { status: 'answered', answer: String(flags.answer), answeredAt: now() });
}

function printStatus(state) {
  console.log(`${state.programme} — branch ${state.workingBranch} — updated ${state.updatedAt}`);
  const cur = state.current;
  console.log(`Current: ${cur.phase ?? '—'}${cur.step ? ` / ${cur.step}` : ''}\n`);
  for (const phase of state.phases) {
    const finished = phase.steps.filter((s) => FINISHED.has(s.status)).length;
    const unmet = phase.status === 'done' ? [] : unmetDependencies(state, phase);
    const wait = unmet.length > 0 ? `  (waits: ${unmet.join(', ')})` : '';
    const line = `${phase.id} ${phase.status.padEnd(11)} ${finished}/${phase.steps.length}`;
    console.log(`  ${line.padEnd(26)} ${phase.title}${wait}`);
  }
  console.log('\nGates:');
  for (const gate of state.gates) {
    const complete = gateComplete(state, gate) ? 'phases complete' : 'phases pending';
    const signoff = gate.signoff ? `, sign-off ${gate.status}` : '';
    console.log(`  ${gate.id} ${gate.title} — ${complete}${signoff}`);
  }
  const open = state.decisions.filter((d) => d.status !== 'answered');
  console.log(`\nOpen decisions (${open.length}):`);
  for (const d of open)
    console.log(`  ${d.id} [${d.owner}] ${d.title} — blocks ${d.blocks.join(', ')}`);
  printNext(state, 5);
}

function printNext(state, count) {
  const next = actionableSteps(state).slice(0, count);
  console.log('\nNext actionable:');
  if (next.length === 0) console.log('  nothing — check open decisions, blocked steps and gates');
  for (const { phase, step } of next) {
    console.log(`  ${step.id} [${step.status}] ${step.title}  → ${phase.file}`);
  }
}

function validate(state) {
  const errors = [];
  const structure = parsePhases();
  const ids = new Set(structure.flatMap((p) => [p.id, ...p.steps.map((s) => s.id)]));
  for (const phase of state.phases) {
    if (!ids.has(phase.id)) errors.push(`phase ${phase.id} not in phase files (run sync)`);
    for (const dep of phase.dependsOn)
      if (!ids.has(dep)) errors.push(`${phase.id} depends on unknown ${dep}`);
    for (const step of phase.steps) {
      if (!ids.has(step.id)) errors.push(`step ${step.id} not in phase files (run sync)`);
      if (!STEP_STATUSES.includes(step.status))
        errors.push(`${step.id} has bad status ${step.status}`);
    }
  }
  for (const d of state.decisions) {
    for (const target of d.blocks)
      if (!ids.has(target)) errors.push(`${d.id} blocks unknown ${target}`);
  }
  if (state.phases.length !== structure.length)
    errors.push('phase count differs from files (run sync)');
  return errors;
}

// ---------------------------------------------------------------------------

const TRANSITIONS = {
  start: 'in_progress',
  done: 'done',
  skip: 'skipped',
  block: 'blocked',
  reset: 'not_started',
};

function transition(command) {
  return (state, target, flags) => {
    const status = TRANSITIONS[command];
    if (/^P\d{2}$/.test(target ?? '')) setPhaseStatus(state, target, status, flags);
    else setStepStatus(state, target, status, flags);
    save(state);
    console.log(`${target} → ${status}`);
  };
}

function runValidate(state) {
  const errors = validate(state);
  errors.forEach((e) => console.error(`✗ ${e}`));
  console.log(errors.length === 0 ? '✓ progress.json is consistent' : `${errors.length} error(s)`);
  process.exitCode = errors.length === 0 ? 0 : 1;
}

const COMMANDS = {
  status: (state) => printStatus(state),
  next: (state) => printNext(state, 1),
  validate: runValidate,
  sync: (state) => {
    save(sync(state));
    console.log(`synced: ${state.phases.length} phases, ${state.decisions.length} decisions`);
  },
  decide: (state, target, flags) => {
    decide(state, target, flags);
    save(state);
    console.log(`${target} recorded`);
  },
  log: (state, target, _flags, rest) => {
    state.sessionLog.push({ at: now(), text: [target, ...rest].join(' ') });
    save(state);
    console.log('logged');
  },
  ...Object.fromEntries(Object.keys(TRANSITIONS).map((c) => [c, transition(c)])),
};

function main() {
  const [command = 'status', target, ...rest] = process.argv.slice(2);
  const flags = parseFlags(target?.startsWith('--') ? [target, ...rest] : rest);
  const run = COMMANDS[command];
  if (!run) {
    const self = relative(REPO, fileURLToPath(import.meta.url));
    console.error(`unknown command "${command}". See the header of ${self}`);
    process.exitCode = 1;
    return;
  }
  run(load(), target, flags, rest);
}

try {
  main();
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
