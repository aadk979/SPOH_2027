import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Shared generation is opt-in so an independent worker cannot silently overwrite it. */
export function actionOutputOptions(root, arguments_) {
  const allowed = new Set(['--check', '--shared-output']);
  const unknown = arguments_.find((argument) => !allowed.has(argument));
  if (unknown) throw new Error(`Unknown action generation option: ${unknown}`);
  const outputs = [join(root, 'src', 'generated', 'actions.ts')];
  if (arguments_.includes('--shared-output')) {
    outputs.push(join(root, '..', 'shared', 'src', 'generated', 'actions', 'index.ts'));
  }
  return { check: arguments_.includes('--check'), outputs };
}

/** Check mode only reads; a missing or stale selected artifact must stop acceptance. */
export function applyActionOutputs(generated, options) {
  if (options.check) {
    for (const output of options.outputs) {
      if (readFileSync(output, 'utf8') !== generated) {
        throw new Error(`${output} is out of date: regenerate the selected action outputs`);
      }
    }
    return;
  }
  for (const output of options.outputs) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, generated);
  }
}
