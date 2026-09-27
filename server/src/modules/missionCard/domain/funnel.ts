import type { CardFunnelResponse } from '@spoh/shared';

export interface FunnelCounts {
  issued: number;
  completed: number;
  redeemed: number;
  stations: ReadonlyArray<{ id: string; code: string; name: string }>;
  perStation: ReadonlyMap<string, number>;
}

/**
 * The funnel's stages: of the cards issued, how many reached each station,
 * Mission Complete and a gift. Every stage counts CARDS — journeys, not
 * people.
 */
export function buildFunnelStages(counts: FunnelCounts): CardFunnelResponse['stages'] {
  const { issued, completed, redeemed } = counts;
  const rate = (value: number): number => (issued === 0 ? 0 : value / issued);
  return [
    { key: 'issued', label: 'Issued', value: issued, rateOfIssued: issued === 0 ? 0 : 1 },
    ...counts.stations.map((station) => {
      const value = counts.perStation.get(station.id) ?? 0;
      return { key: station.code, label: station.name, value, rateOfIssued: rate(value) };
    }),
    { key: 'completed', label: 'Completed', value: completed, rateOfIssued: rate(completed) },
    { key: 'redeemed', label: 'Gift redeemed', value: redeemed, rateOfIssued: rate(redeemed) },
  ];
}
