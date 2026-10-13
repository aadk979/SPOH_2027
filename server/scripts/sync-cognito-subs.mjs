import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRecoveryCommand } from './recover-identities.mjs';

/** Compatibility entry point: the unaudited email-map subject writer is retired. */
export { parseRecoveryArguments, runRecoveryCommand } from './recover-identities.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runRecoveryCommand(process.argv.slice(2)).catch(() => {
    process.stderr.write('Recovery command failed. Review the private operator context before retrying.\n');
    process.exitCode = 1;
  });
}
