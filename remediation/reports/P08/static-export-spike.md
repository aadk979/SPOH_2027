# P08.4 step 1 — static-export spike (ADR-008 §2)

**Result: the spike passes.** The client builds with `output: 'export'`, one container can serve
it beside the API, and the `/e/[event]/…` segment works for any event from a single exported
placeholder. The one-service topology stands, and so does the January budget (no second
service, PF-13).

Run on 29 September 2026 against `main` after P07 (`0b1cb38`), Next 16 (Turbopack), in
Chromium. The experiment was not committed; its three pieces are summarised below so P08.4 and
P09.8 can build them properly.

## What was built

1. `next.config.ts` switched to `output: 'export'` behind an env flag, with `headers()` left out
   (static export does not support it; the serving app sets the headers, as P08.5 step 3 says).
2. A route `app/e/[event]/home/page.tsx` with `generateStaticParams() → [{ event: '_' }]` and
   `dynamicParams = false`, rendering a client component.
3. An Express static server over `out/` that
   - maps every `/e/<slug>/…` to `/e/_/…`,
   - serves `<path>.html` for extensionless page requests, and
   - maps the segment payloads client navigation requests to where the export writes them (next
     section).

## Results

| Check                                                             | Result              |
| ----------------------------------------------------------------- | ------------------- |
| All 31 app routes export (30 static, 1 SSG placeholder)           | pass                |
| Direct load of `/e/spoh2027/home` and `/e/<any>/home`             | pass                |
| Client-side navigation `/e/spoh2027/home` → `/e/other-event/home` | pass, same document |
| Client-side navigation from an event page to `/sign-in`           | pass, same document |
| Browser back                                                      | pass                |
| Failed requests, page errors, hydration errors                    | none (with 2 below) |

## What the real implementation must do

1. **Translate segment-payload requests.** Client navigation asks for dot-joined names
   (`/map/__next.map.__PAGE__.txt`, `/e/x/home/__next.e.$d$event.home.__PAGE__.txt`), and the
   export writes nested folders (`map/__next.map/__PAGE__.txt`,
   `e/_/home/__next.e/$d$event/home/__PAGE__.txt`). The server rewrites
   `__next.<a>.<b>.….txt` to `__next.<a>/<b>/….txt`. Without it every client navigation 404s its
   payload and falls back to a full load.
2. **Read the event slug after hydration, from `usePathname()`.** The prerendered HTML carries the
   placeholder `_`. Reading the slug during render causes a hydration mismatch (React #418), and
   reading `window.location` once misses client navigation between events. The helper that works:

   ```ts
   const hydrated = useSyncExternalStore(
     noop,
     () => true,
     () => false,
   );
   const slug = hydrated ? (/^\/e\/([^/]+)/.exec(usePathname())?.[1] ?? null) : null;
   ```

   ADR-008 §2 already says "one helper that parses the pathname, never `useParams()`"; P09.8
   builds it this way.

## Also found

The service worker's asset regex from F03-036 also matched paths inside inline RSC JSON, where
quotes are escaped, so a trailing backslash became part of some URLs (`…/x.js\` → `…/x.js/`).
Install still cached every real asset (the same URLs also appear in `<script>` tags), but the
bogus ones 404ed. Fixed separately by excluding the backslash.
