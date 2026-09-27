import type { GiftTypeRecord } from '@spoh/shared';
import { dispatch } from '../../notification/index.js';

/**
 * Tell the Deputy Coordinator and the Chief that stock is running out.
 *
 * The deck makes this an IC duty (§5); what actually happens when it is left to
 * someone noticing is that the first anyone hears of it is a visitor being
 * turned away at the desk.
 */
export function notifyLowStock(gift: GiftTypeRecord): void {
  void dispatch({
    kind: 'gift.lowStock',
    priority: 'OPERATIONAL',
    title: `${gift.name} is running low`,
    body: `${gift.remaining} left. Restock, or brief the desk on an alternative.`,
    url: '/chief',
    tag: `gift-low:${gift.id}`,
    audience: { everyone: false, minimumRole: 'DEPUTY_COORDINATOR', volunteerIds: [] },
  });
}
