import { pathToFileURL } from 'node:url';

const VERSION = /^[A-Za-z0-9-]{32,64}$/;
const configured = (value) => value && value !== 'None' ? value : undefined;

/** Validate a release's preload/flip/retire against persisted non-secret selectors. */
export function sessionVersionContext(input) {
  const priorCurrent = configured(input.priorCurrent);
  const priorPrevious = configured(input.priorPrevious);
  const current = configured(input.current) ?? priorCurrent;
  const phase = input.phase ?? 'stable';
  const previous = phase === 'retire' ? configured(input.previous)
    : configured(input.previous) ?? priorPrevious;
  if (!current || !VERSION.test(current)) throw new Error('Explicit current session VersionId is required');
  if (previous && (!VERSION.test(previous) || current === previous)) throw new Error('Distinct valid session VersionIds are required');
  if (!['stable', 'preload', 'flip', 'retire'].includes(phase)) throw new Error('Unknown signing rotation phase');
  if (phase === 'stable' && priorCurrent && (current !== priorCurrent || previous !== priorPrevious))
    throw new Error('Routine release must retain deployed signing selectors');
  if (phase === 'preload' && (!priorCurrent || priorPrevious || current !== priorCurrent || !previous))
    throw new Error('Preload keeps the old writer and installs one new verifier');
  if (phase === 'flip' && (!priorCurrent || !priorPrevious || current !== priorPrevious || previous !== priorCurrent))
    throw new Error('Flip requires the deployed preload pair and exchanges writer/verifier');
  if (phase === 'retire' && (!priorCurrent || !priorPrevious || current !== priorCurrent || previous))
    throw new Error('Retirement keeps the writer and explicitly removes its previous verifier');
  return { staging: { current, ...(previous ? { previous } : {}) } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const context = sessionVersionContext({ current: process.env.SESSION_SIGNING_CURRENT_VERSION_ID,
      previous: process.env.SESSION_SIGNING_PREVIOUS_VERSION_ID,
      priorCurrent: process.env.DEPLOYED_SESSION_SIGNING_CURRENT_VERSION_ID,
      priorPrevious: process.env.DEPLOYED_SESSION_SIGNING_PREVIOUS_VERSION_ID,
      phase: process.env.SESSION_SIGNING_ROTATION_PHASE });
    console.log(JSON.stringify(context));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Signing selector validation failed');
    process.exitCode = 1;
  }
}
