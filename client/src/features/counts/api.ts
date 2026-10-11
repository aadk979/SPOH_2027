import {
  CardFunnelResponse,
  FootfallLiveResponse,
  FootfallSummaryResponse,
  GiftSummaryResponse,
  DataHealthResponse,
  StaffingGapsResponse,
} from '@spoh/shared';
import { eventApi } from '@/shared/lib/eventApi';
export async function getCountViews(eventId: string, signal?: AbortSignal) {
  const options = { signal, cache: 'no-store' as const };
  const [footfall, live, cards, gifts] = await Promise.all([
    eventApi(eventId, '/footfall/summary', options),
    eventApi(eventId, '/footfall/live', options),
    eventApi(eventId, '/cards/funnel', options),
    eventApi(eventId, '/gifts/summary', options),
  ]);
  return {
    footfall: FootfallSummaryResponse.parse(footfall),
    live: FootfallLiveResponse.parse(live),
    cards: CardFunnelResponse.parse(cards),
    gifts: GiftSummaryResponse.parse(gifts),
  };
}
export async function getDataHealth(eventId: string, signal?: AbortSignal) {
  const options = { signal, cache: 'no-store' as const };
  const [health, staffing] = await Promise.all([
    eventApi(eventId, '/dashboard/data-health', options),
    eventApi(eventId, '/roster/gaps', options),
  ]);
  return { ...DataHealthResponse.parse(health), staffing: StaffingGapsResponse.parse(staffing) };
}
