# Production static client preparation

P08.5/D-08 assigns Firebase Hosting to production only. Staging remains on the
approved Caddy hosts. This directory prepares a release locally; it does not
create a Firebase project, authenticate, deploy or alter a production resource.

The existing environment-independent Next export is copied into a new release
directory. The only environment-specific addition is the strict public metadata
envelope, served as JSON at `/api/v1/client-config` through a local-file rewrite.
Operational API requests still go directly to its exact HTTPS API origin. Firebase
supports static destinations and Google function/container rewrites; this config
needs only static destinations. See [Firebase's configuration reference](https://firebase.google.com/docs/hosting/full-config).

Preparation rejects non-production labels, local auth, non-HTTPS/placeholder
origins, extra keys, incomplete exports, hidden files, symlinks, overlapping paths
and existing outputs. It never deletes an output or modifies the input export.
Supply the API's public `{ "data": ... }` response, never an environment dump,
SSM export or credentials. Metadata is not cached by the service worker; hosting
uses `no-store` for it and the worker, `no-cache` for documents, and immutable
caching for hashed assets. Each document receives only its verified executable script hashes. CSP blocks inline styles and event handlers; linked theme CSS and manifests use the exact API origin, and image/upload access uses the required nullable mediaOrigin from public metadata. Policies have an 8 KiB bound and custom response headers have a 9 KiB bound.

From `C:\Users\aadk9\OneDrive\Desktop\SPOH_2027\V1-main`, with Node 24:

```powershell
npm run build:shared
# Use the static export already built by the release pipeline, or build locally:
$env:SPOH_STATIC_EXPORT='1'
npm run build --workspace client
node infra/firebase/prepareRelease.mjs --export client/out --runtime <public-json-file> --output <new-release-directory>
npm run check:firebase
```

The build wrapper creates `client/out` and its adjacent version 1 `client/out.csp.json` as a pair. Preparation recomputes every HTML byte digest and executable script hash, including 404 and Next navigation documents, before creating outputs. The copied pair is verified again; private `public.csp.json` stays beside `public`, outside the published directory. Keep both artifacts together for rollback.

The generated `firebase.json` uses the `client` deployment target and contains
explicit routing for every exported document and Next navigation payload.
Header rules cover actual requested clean and physical addresses before rewrites. The custom 404 receives its own hashes. Event URLs map to the existing `/e/_/` placeholder without making unknown routes
successful. There is no catch-all API proxy or SPA rewrite.

At the approved production release, CI must prepare the exact export for that
commit, verify fetched metadata against the intended production API, and archive
the export, metadata and hosting configuration together for review and rollback.
The owner supplies the real project/site identifiers and approved CI identity at
that time. Apply the `client` target to the supplied site with an explicit project;
deploy only `hosting:client` from the prepared directory, through the protected
production environment. No active Firebase deployment workflow is added here.

Production remains blocked from release until P12 removes the third-party refresh
cookie dependency and proves sign-in, reload, concurrent refresh and sign-out with
third-party cookies blocked. Same-site staging success does not satisfy this.
Production CORS/callback/logout metadata and disabling the API's static shell
must be coordinated with that release. The 28 October go decision, existing pool
ownership and live Lightsail boundaries still apply.

Local hosting verification uses Firebase CLI **15.32.1**, a demo project and
synthetic metadata/API responses. It is routing/startup evidence, not a production
deployment or session result. Run the hosting emulator on Linux: the Windows
emulator's `glob-slash` dependency normalizes request paths to backslashes,
preventing the same routing/header checks from matching.
