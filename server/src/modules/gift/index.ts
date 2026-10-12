/** The gift module's public API: the only file another module may import. */
export { giftRouter } from './http/routes.js';
export { createGiftTypeHandler, updateGiftTypeHandler } from './http/handlers.js';
export { listGifts } from './application/listGifts.js';
export { toGiftTypeRecord } from './data/mappers.js';
export { readGiftNoticeSource } from './application/readNoticeSource.js';
export { giftWorkspaceSource } from './application/workspaceGifts.js';
export { redemptionWorkspaceSource } from './application/workspaceRedemptions.js';
