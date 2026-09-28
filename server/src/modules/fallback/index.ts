/** The fallback module's public API: the only file another module may import. */
export { fallbackRouter } from './http/routes.js';
export { listFallbackWindows } from './application/listFallbackWindows.js';
export { rangeOverlapsFallbackWindow } from './data/repo.js';
