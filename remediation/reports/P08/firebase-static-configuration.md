# Reviewable Firebase static configuration — P08.5, 3 October 2026

The [release preparation](../../../infra/firebase/README.md) copies the existing
static export into a new directory and adds only the strict public runtime
envelope. Its generated `firebase.json` serves that JSON through the exact
bootstrap path, sets the selected API origin in CSP, and generates explicit
event/document/navigation-payload rewrites from the export. Unknown routes remain 404. Hashed assets are immutable; documents revalidate; metadata and the service
worker use `no-store`.

The CLI refuses development/local auth, incomplete or secret-shaped metadata,
HTTP/placeholder origins, unsafe filesystem inputs and overlapping/existing
outputs. All validation precedes writes. Original export bytes are preserved;
no credentials, Firebase project/site id or deployment action are introduced.
Preparation regressions now run in CI. ESLint ignores private `.local` artifacts
just as it ignores other generated outputs; product guard scopes are unchanged.

## Verification

- **Nine CLI/configuration regressions** pass on Node **24.19.0**, covering arbitrary
  event slugs, nested routes, both Next payload spellings, unknown routes, metadata
  refusal before writes, symlinks/aliases, output preservation and sanitized errors.
- Workspace types, root lint, architecture (**902 modules / 3,884 dependencies**),
  changed-file formatting and diff checks pass. No application or database schema
  changed; the previously verified product suites were not repeated for this slice.
- [Actual emulator/Chrome evidence](firebase-hosting-evidence-2026-10-03.json)
  uses Firebase CLI **15.32.1** in a temporary Linux Node 24 container, a demo project,
  production-shaped synthetic public metadata and mocked operational APIs.
  All **216 export files** are byte-identical; six document/payload requests match
  their source bytes; CSP, JSON content type, worker/metadata/asset cache rules,
  three unknown-route 404s, hosted sign-in selection and Guide/Safety/Home navigation
  in the same document pass. Installed Chrome **154.0.8037.97** reports no page
  errors or failed navigation payloads. This is not production session evidence.

The first test run exposed a fixture-directory cleanup error; a later refusal
assertion expected the overlap diagnostic after the existing-output diagnostic.
Both were corrected and all nine rerun. Windows emulator checks failed because its
`glob-slash` dependency normalizes request paths to backslashes; Linux was used.
The first Linux attempt used an incorrect absolute public-root overlay, then a
probe requested a nonexistent `register` route. Correcting those verification
inputs exposed a real combined cache-header pattern that missed the API bootstrap
path. Explicit path rules fixed it; the final emulator/browser evidence above
passes against the corrected source. None of the failed probes is passing evidence.

## Remaining gates

The production configuration is reviewable, but its release workflow/identity/site
mapping remains a later protected production step. Do not invent owner identifiers
or deploy early. P12 must remove the third-party refresh-cookie dependency and
prove the resulting production session flow before release. Production routing,
CORS and disabling the API's static shell must be coordinated then. No certificate
renewal cycle is claimed; P08.5 remains in progress. The owner's Chrome amendment
clears the staging iOS criterion only. The 28 October go decision and existing
production pool/live-site boundaries remain unchanged.
