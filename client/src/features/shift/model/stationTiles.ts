import type { MeResponse } from '@spoh/shared';
export function stationTiles(me: MeResponse) {
  const assignment = me.currentAssignment;
  if (!assignment) return [];
  const can = (capability: string): boolean => me.capabilities.includes(capability as never);

  const tiles: Array<{ href: string; label: string; hint: string }> = [];

  if (can('registration.create') && assignment.station.kind === 'SIGNUP_BOOTH') {
    tiles.push({
      href: '/capture/registration',
      label: 'Register a visitor',
      hint: 'One tap per person',
    });
  }

  if (can('footfall.create') && assignment.station.countsEntry) {
    tiles.push({
      href: '/capture/footfall',
      label: 'Count entries',
      hint: assignment.station.name,
    });
  }

  if (can('card.stamp') && assignment.station.issuesStamp) {
    tiles.push({
      href: '/capture/stamp',
      label: 'Stamp a card',
      hint: 'Scan after stamping by hand',
    });
  }

  if (can('gift.redeem') && assignment.station.kind === 'MISSION_COMPLETE') {
    tiles.push({
      href: '/capture/redeem',
      label: 'Redeem a gift',
      hint: 'Check the physical stamps first',
    });
  }

  return tiles;
}
