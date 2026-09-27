/** The gift module's public API: the only file another module may import. */
export { giftRouter } from './http/routes.js';
export { createGiftTypeHandler, updateGiftTypeHandler } from './http/handlers.js';
export { listGifts } from './application/listGifts.js';
export { toGiftTypeRecord } from './data/mappers.js';
