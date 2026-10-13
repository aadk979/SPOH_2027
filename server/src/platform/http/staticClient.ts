import express, { Router, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { staticClientCsp, validateStaticHeaderBudget } from '@spoh/shared/static-client';
import { mediaObjectOrigin, type MediaStorageLocation } from '../aws/mediaOrigin.js';
import { brandedHtml, brandingSlugFromAddress, htmlEtag, type StaticBrandingReader } from './staticBranding.js';
import { describeStaticHtml, loadStaticExport, type VerifiedStaticDocument } from './staticClientManifest.js';

/** Client headers replace the API CSP only after the real export document has been selected. */
function clientHeaders() {
  return helmet({ contentSecurityPolicy: false,
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }, crossOriginEmbedderPolicy: false,
  });
}
const HASHED = /^\/_next\/static\//;
const EVENT_SEGMENT = /^\/e\/[^/]+(?=\/|$)/;

/** Dot-joined Next navigation payloads name folders in the finished export. */
export function segmentPayloadPath(path: string): string {
  return path.replace(/\/(__next\.[^/]+)\.txt$/, (_match, name: string) => {
    const [prefix, first, ...rest] = name.split('.');
    return `/${[`${prefix}.${first}`, ...rest].join('/')}.txt`;
  });
}
export function exportedPath(path: string, fileExists: (relative: string) => boolean): string {
  const mapped = segmentPayloadPath(path.replace(EVENT_SEGMENT, '/e/_')).replace(
    /\/__next\.e\/[^/]+\//, '/__next.e/$d$event/',
  );
  if (mapped === '/') return '/index.html';
  if (/\.[a-z0-9]+$/i.test(mapped)) return mapped;
  return fileExists(`${mapped}.html`) ? `${mapped}.html` : mapped;
}
function setCacheHeaders(res: Response, path: string): void {
  res.setHeader('Cache-Control', HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
}
export interface StaticClientOptions { storage?: MediaStorageLocation; publicBranding?: StaticBrandingReader }
interface HtmlResponse { document: VerifiedStaticDocument; apiOrigin: string; branding?: StaticBrandingReader }
async function sendHtml(req: Request, res: Response, input: HtmlResponse): Promise<void> {
  let body = input.document.body;
  const slug = brandingSlugFromAddress(req.originalUrl);
  const publication = slug && input.branding ? await input.branding(slug) : null;
  if (publication) {
    body = Buffer.from(brandedHtml(body.toString('utf8'), publication.data, input.apiOrigin), 'utf8');
    const actual = describeStaticHtml(input.document.metadata.path, body);
    if (JSON.stringify(actual.scriptHashes) !== JSON.stringify(input.document.metadata.scriptHashes))
      throw new Error('Published branding changed executable static scripts');
  }
  res.type('html').set({ ETag: htmlEtag(body.toString('utf8')), 'Cache-Control': 'no-cache',
    'Content-Length': String(body.byteLength) });
  validateStaticHeaderBudget(res.getHeaders());
  if (req.fresh) { res.status(304).removeHeader('Content-Length'); res.end(); return; }
  if (req.method === 'HEAD') { res.end(); return; }
  res.send(body);
}
/** The verified export/adjacent manifest pair is loaded once; served HTML uses those exact bytes. */
export function staticClient(root: string, apiOrigin = '', input?: MediaStorageLocation | StaticClientOptions): Router {
  const router = Router();
  const options: StaticClientOptions = input && 'region' in input ? { storage: input } : input ?? {};
  const verified = loadStaticExport(root);
  const mediaOrigin = options.storage ? mediaObjectOrigin(options.storage) : null;
  const policy = (scriptHashes: readonly string[]) => staticClientCsp({ scriptHashes, apiOrigin, mediaOrigin });
  const hashless = policy([]);
  const policies = new Map([...verified.documents].map(([path, document]) => [path, policy(document.metadata.scriptHashes)]));
  const inside = (path: string) => verified.files.has(path.replace(/^\//, ''));
  router.use(clientHeaders());
  router.use((req: Request, res: Response, next: NextFunction) => {
    const query = req.url.slice(req.path.length);
    req.url = exportedPath(req.path, inside) + query;
    const path = req.path.replace(/^\//, '');
    res.setHeader('Content-Security-Policy', policies.get(path) ?? hashless);
    const document = verified.documents.get(path);
    if (!document || !['GET', 'HEAD'].includes(req.method)) return next();
    sendHtml(req, res, { document, apiOrigin, branding: options.publicBranding }).catch(next);
  });
  router.use(express.static(verified.root, { index: false, redirect: false,
    setHeaders: (res, path) => setCacheHeaders(res, path.slice(verified.root.length).replaceAll('\\', '/')),
  }));
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    const document = verified.documents.get('404.html')!;
    res.status(404).setHeader('Content-Security-Policy', policies.get('404.html')!);
    sendHtml(req, res, { document, apiOrigin }).catch(next);
  });
  return router;
}
