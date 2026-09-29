import { existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';

/**
 * The client as a static export, served beside the API (ADR-008 §2, P08.4).
 *
 * One process and one origin, which is what keeps staging and production to a
 * single Fargate service. What an export needs from its server, found by the
 * P08.4 spike (remediation/reports/P08/static-export-spike.md):
 *  - `/x` is the file `x.html`;
 *  - every `/e/<slug>/…` is the one placeholder segment `/e/_/…`;
 *  - client navigation asks for segment payloads dot-joined
 *    (`/map/__next.map.__PAGE__.txt`) where the export wrote folders
 *    (`/map/__next.map/__PAGE__.txt`).
 */

/** The client's own policy; the API keeps its stricter one. Hashes replace 'unsafe-inline' in P15.3. */
const clientHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: { maxAge: 31_536_000, includeSubDomains: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
});

const HASHED = /^\/_next\/static\//;
const EVENT_SEGMENT = /^\/e\/[^/]+(?=\/|$)/;

/** `/a/__next.a.b.__PAGE__.txt` → `/a/__next.a/b/__PAGE__.txt`; `__next._tree.txt` unchanged. */
export function segmentPayloadPath(path: string): string {
  return path.replace(/\/(__next\.[^/]+)\.txt$/, (_match, name: string) => {
    const [prefix, first, ...rest] = name.split('.');
    return `/${[`${prefix}.${first}`, ...rest].join('/')}.txt`;
  });
}

/** The exported file a request path names, or the path itself if it names a file already. */
export function exportedPath(path: string, fileExists: (relative: string) => boolean): string {
  const mapped = segmentPayloadPath(path.replace(EVENT_SEGMENT, '/e/_')).replace(
    /\/__next\.e\/[^/]+\//,
    '/__next.e/$d$event/',
  );
  if (mapped === '/') return '/index.html';
  if (/\.[a-z0-9]+$/i.test(mapped)) return mapped;
  return fileExists(`${mapped}.html`) ? `${mapped}.html` : mapped;
}

function setCacheHeaders(res: Response, path: string): void {
  res.setHeader(
    'Cache-Control',
    HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
}

export function staticClient(root: string): Router {
  const router = Router();
  const inside = (relative: string): boolean => {
    const full = normalize(join(root, relative));
    return full.startsWith(normalize(root) + sep) && existsSync(full);
  };

  router.use(clientHeaders);
  router.use((req: Request, _res: Response, next: NextFunction) => {
    const query = req.url.slice(req.path.length);
    req.url = exportedPath(req.path, inside) + query;
    next();
  });
  router.use(
    express.static(root, {
      index: false,
      redirect: false,
      setHeaders: (res, path) => setCacheHeaders(res, path.slice(root.length).replaceAll(sep, '/')),
    }),
  );
  // An unknown client route is the export's 404 page, with a 404.
  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.status(404).setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(root, '404.html'), (error) => error && next(error));
  });
  return router;
}
