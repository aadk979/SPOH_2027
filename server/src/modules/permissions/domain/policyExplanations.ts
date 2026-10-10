/**
 * What each policy that can decide a request means, for the permissions screen and its
 * simulator (P11.7). Guardrails are shown read-only: no grant overrides them.
 */
export const GUARDRAILS: readonly { id: string; explanation: string }[] = [
  { id: 'guardrail.inactive-member', explanation: 'A deactivated member can do nothing.' },
  { id: 'guardrail.inactive-person', explanation: 'A deactivated person can do nothing.' },
  {
    id: 'guardrail.same-event',
    explanation: 'Members act only inside their own event; another event is invisible to them.',
  },
  {
    id: 'guardrail.not-on-yourself',
    explanation: 'Nobody changes their own role, standing or account.',
  },
  {
    id: 'guardrail.outrank-target',
    explanation: 'Nobody changes a member at or above their own level.',
  },
  {
    id: 'guardrail.grant-below-own-rank',
    explanation: 'Nobody grants a role at or above their own.',
  },
  {
    id: 'guardrail.capture-window',
    explanation: 'Capture happens only while the event is in rehearsal or live.',
  },
  {
    id: 'guardrail.archived-read-only',
    explanation: 'An archived event can be read but not changed.',
  },
  {
    id: 'guardrail.structure-frozen-when-live',
    explanation: 'Once live, stations, event days, gift types and visitor fields cannot be added.',
  },
  {
    id: 'guardrail.locked-actions',
    explanation:
      'Reopening, archiving, permissions, and security and privacy settings are for platform admins only.',
  },
];

const OTHERS: Readonly<Record<string, string>> = {
  'station-scope.capture': 'Capture at a station needs a running shift there, or IC and above.',
  'station-scope.ic-own-stations': 'An IC works at the stations they are rostered on.',
  'platform.admin': 'A platform admin may administer the event.',
  'platform.locked-actions': 'A platform admin may take the locked actions.',
  'platform.locked-actions-as-member': 'A platform admin may take the locked actions as a member.',
  'platform.assign-any-role': 'A platform admin may grant any role.',
};

const BY_ID = new Map<string, string>([
  ...GUARDRAILS.map(({ id, explanation }): [string, string] => [id, explanation]),
  ...Object.entries(OTHERS),
]);

/** A decision in plain language, from the policies that decided it. */
export function explain(allowed: boolean, policies: readonly string[], label: string): string {
  const reasons = policies.map((id) => BY_ID.get(id)).filter((text): text is string => !!text);
  if (reasons.length > 0) return reasons.join(' ');
  if (allowed) return `Their role may ${label} in this event.`;
  if (policies.length === 0) return `Their role has not been given permission to ${label}.`;
  return `Refused by ${policies.join(', ')}.`;
}
