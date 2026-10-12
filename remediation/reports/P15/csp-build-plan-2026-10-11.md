# P15.3 static-client CSP build plan — 11 October 2026

Status: next-batch planning only. No application changes, builds, tests, database
operations, AWS operations or deployment were performed for this investigation.
The P13 batch remains frozen while its delivery finishes. This report is to remain
untracked and unstaged until the owner of the next batch includes it deliberately.

## Decision and current behavior

Use SHA-256 hashes of each finished static HTML document. ADR-008 §2 explicitly
specifies a hash-based CSP for the static export; P15.3's older “nonces for Next”
wording should be reconciled with that architecture when implementing the step.
A static export has no per-request nonce. Do not advertise or implement a fixed
nonce as a substitute.

The installed package is Next 16.3.8, with React 19.2.8. The authoritative local
package behavior is:

- `node_modules/next/dist/server/app-render/use-flight-response.js` writes the
  inline `self.__next_f` bootstrap and Flight payload scripts. It adds a nonce
  attribute only when the renderer receives a nonce.
- `node_modules/next/dist/export/routes/app-page.js` obtains the final HTML with
  `result.toUnchunkedString()` and writes that finished HTML to the export.
- `node_modules/next/dist/client/app-bootstrap.js` supports Next's script queue.
  No custom inline `next/script` or script element was found in maintained client
  source during this review.
- `client/src/app/e/[event]/layout.tsx` exports the placeholder event `_`. Runtime
  event identity comes from the client pathname helper.

The existing export inspected read-only contained 32 HTML documents, at most two
distinct inline scripts per document, and 32 distinct inline script hashes across
the export. Each document therefore needed about 108 bytes of hash source tokens;
the union needed about 1.7 KiB. These are measurements of the existing artifact,
not a limit or evidence that the future P14/P15 artifact behaves identically.

Both actual production hosting paths currently allow `unsafe-inline` for scripts
and styles:

- `server/src/platform/http/staticClient.ts` serves the export beside the API.
- `infra/firebase/hostingConfig.mjs` prepares the separate production static host.

`client/next.config.ts` omits its headers and rewrites when
`SPOH_STATIC_EXPORT=1`; changing those headers alone does not secure the deployed
static client. Correct its misleading inline-script/style comments and keep
development allowances separate from the policies enforced by the real hosts.

## Artifact generation and validation

Add an explicit static-build artifact generator after Next finishes exporting.
Prefer a proper HTML parser, used during artifact generation, to a general-purpose
regular expression that guesses which script elements are executable. Hash the
browser-normalized text of each inline executable script as UTF-8, preserving
whitespace and Unicode. Do not trim, reformat, or HTML-entity-decode script text;
the parser should handle HTML newline normalization. External scripts do not need
inline hashes. Deduplicate the hashes for each document.

The CSP algorithm hashes UTF-8 element contents, which can differ from hashing
the bytes of an external resource. See the
[CSP Level 3 matching algorithm](https://w3c.github.io/webappsec-csp/#match-element-to-source-list)
and the [HTML parsing standard](https://html.spec.whatwg.org/multipage/parsing.html#preprocessing-the-input-stream).

Generate an ignored sidecar beside `client/out`, for example
`client/out.csp.json`. Include a schema version, normalized relative HTML paths,
whole-document SHA-256 digests, and deduplicated script hash sources. Generate
metadata for every HTML document, including `404.html` and `_not-found.html`.
Do not alter the exported HTML. Do not put this generated artifact in git.

Concrete integration points:

- A generator under `client/tools/`, called by an explicit static-build command.
- A pure shared policy builder and manifest schema in `packages/shared/src/`, with
  no Node imports in the client-consumed package. Node file reading and hashing
  remain in artifact/server code.
- `Dockerfile`: build the manifest and copy the sidecar into the runtime image
  beside the exact export from that build.
- `server/src/platform/http/`: load and validate the manifest once at startup,
  including every HTML document's whole-file digest and complete HTML coverage.
- `infra/firebase/prepareRelease.mjs`: validate the same sidecar against the
  export bytes before copying files or writing hosting configuration.
- Static-export consumers in the local CI script, browser workflow and release
  preparation should use the same artifact-producing command. The quality build
  currently does not select static export and must not be treated as proof of
  the runtime manifest.

Missing, malformed, incomplete or stale metadata must fail preparation/startup.
Validate manifest paths against traversal and duplicates; reject unexpected file
types and malformed hash tokens. Do not fall back to `unsafe-inline`. The runtime
image and prepared release must be immutable artifact pairs.

## Policy and header budget

The production policy should include:

- `script-src 'self'` plus the current document's hash sources;
- `script-src-attr 'none'`, with no `unsafe-inline`, `unsafe-eval` or fixed nonce;
- strict linked styles, and `style-src-attr 'none'` after the changes below;
- exact approved API/media origins in only the directives that need them;
- explicit worker and manifest sources, and the existing frame/object restrictions.

Per-document policies keep headers bounded as more routes appear. Do not use a
growing union of every page's hashes unless it is a separately reviewed exception.
Do not emit an additional restrictive base CSP as a second effective policy:
multiple enforced policies intersect and can block the very scripts authorized
by the document-specific policy.

Enforce a project maximum of **8 KiB for the serialized CSP**, checked during
generation, server startup and Firebase preparation. Check the total response
headers as well. Eight KiB is our conservative budget, **not a Firebase vendor
quota**. AWS documents hard ALB limits of 16 KiB for one header and 32 KiB for the
entire response header block; leave room for other headers and edge additions.
See [AWS ALB HTTP header limits](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-limits.html#http-header-limits).

## Express and Firebase path matching

Express must choose hashes for the actual HTML file after resolving the existing
`exportedPath` mapping:

- `/` selects `index.html`.
- `/sign-in` and direct `.html` requests select the same document metadata.
- `/e/<slug>/...` selects the corresponding `/e/_/...` exported HTML.
- Dot-joined Next RSC payload requests keep their existing folder mapping, including
  `__next.e/$d$event/`; they must not acquire a global inline-script allowance.
- Unknown GET/HEAD routes select `404.html` hashes and retain HTTP 404.

Keep the existing hashed-asset and document/worker cache behavior, and keep API
JSON headers independent from the client's policy. Avoid traversal changes or
turning unknown paths into successful SPA responses.

Firebase must generate CSP header rules for the **requested** clean URLs and
event aliases as well as the rewrite destinations. Its header matching happens
before rewrites and matching rules are applied in configured order. Keep
`cleanUrls`, direct `.html` redirect behavior and event aliases consistent with
the existing export rules. Include Firebase's special `404.html` source/regex
header rule for its custom 404 response. Verify the final response has one
effective CSP rather than assuming overlapping rules merge safely.

These behaviors are documented in the
[Firebase Hosting configuration reference](https://firebase.google.com/docs/hosting/full-config#headers),
including its custom-404 header rule and `.html` redirects. Firebase also overrides
HSTS on its default `*.web.app` hosts; custom-domain acceptance must inspect the
real approved domain rather than infer it from a local configuration file.

## The three current inline-style props

All three need removal before enforcing strict style attributes:

1. `client/src/shared/ui/Field.tsx`, `Select`: a constant `style` object sets the
   chevron's `backgroundImage`, `backgroundRepeat`, `backgroundPosition` and
   `backgroundSize`. Move the encoded constant SVG and the other declarations
   into a normal stylesheet class. Preserve the existing `img-src data:` allowance.
2. `client/src/shared/ui/Feedback.tsx`, `Skeleton`: `style={{ height }}` accepts
   arbitrary CSS lengths. The current callers use the default `1.25em`, plus
   `2em`, `48px` and `56px`. Map these to explicit size/classes and update the
   loading cards and sign-in skeleton callers without changing their geometry.
3. `client/src/features/dashboard/components/StatTile.tsx`, `BarRow`:
   `style={{ width: ... }}` sets an integer percentage. Use finite classes for
   clamped integer widths 0–100, with static CSS rules or a verified Tailwind
   source list. Cover zero, negative, over-maximum and non-finite values.

Correct the comments in these components and `client/src/styles/globals.css` that
currently describe inline style as required. Do not introduce `unsafe-hashes` to
retain arbitrary style attributes.

## Public branding linked CSS, CORS and CORP

P14 branding should arrive as a linked public stylesheet from the approved API
origin, not an injected style element, a `style` prop, an inline JSON script, or
`document.documentElement.style`. The stylesheet should emit fixed custom-property
names such as the existing `--color-primary` family and validated color values
only. Never concatenate unrestricted CSS, selectors, URLs or event names into it.
Keep MIME `text/css`, `nosniff`, a version/ETag and deliberate caching.

Allow the exact API origin in `style-src`; set the stylesheet link's
`crossOrigin="anonymous"`. `createApp.ts` globally emits
`Cross-Origin-Resource-Policy: same-site`, so a no-CORS stylesheet can be blocked
when loaded by the separate Firebase production site. Anonymous CORS mode plus
the existing exact allowed client origin avoids that conflict without cookies or
an unrestricted CORS policy. Verify this with two different browser origins.

Switch/remove the previous event's stylesheet on event changes so the old accent
does not survive a switch or an error. Link the dynamic public event manifest with
the approved API origin permitted by `manifest-src`, and verify its cross-origin
loading behavior too. Keep unpublished/private operational data out of these public
branding resources.

Firebase currently lacks the exact regional S3 media origin that Express derives
through `mediaObjectOrigin`. Choose API-served public logo URLs or add one validated
derived media origin to the strict public client-configuration contract and release
preparer. Do not accept arbitrary user-supplied origins or widen `script-src` to the
API/media host. Cognito's hosted sign-in remains a separate origin/page.

## Tests to write in the P15 batch

- Artifact extraction: executable inline scripts, external scripts, Unicode,
  preserved whitespace, CRLF normalization, duplicate scripts, absent scripts,
  malformed input, stale digests, missing HTML coverage and the 8 KiB budget.
- Express unit tests: two documents with different hashes; root/clean/direct HTML;
  two event aliases selecting the placeholder hashes; RSC navigation mapping;
  GET/HEAD; 404 fallback; traversal; exact origins; unchanged cache behavior; no
  permissive script/style keywords; metadata failure at startup.
- Firebase preparation/configuration tests: unchanged exported bytes; matching
  request paths before rewrites; clean URLs; event aliases; special custom 404
  policy; strict public metadata; sidecar failures; aggregate header budgets.
- Existing `client/tests/static/csp-validation.test.mjs`: replace its current
  expectation of `unsafe-inline` with hashes. Test real-export hydration, reload,
  navigation through RSC, 404, blocked injected scripts and styles, both viewports,
  and anonymous cross-origin branding CSS/manifest loading. Retain invalid-runtime
  startup refusal and page-error/CSP-event checks.
- CSS/component tests: chevron and skeleton geometry, bar-width edge values, and
  no inline style/script regression in maintained client source.

Follow ADR-011's batch process. Run staging/domain header checks, real Firebase
hosting behavior, cookie/CORS acceptance and the security-header grade in P16.8
after the approved infrastructure recreation. No production creation or live-site
rebuild is authorized by this planning document.
