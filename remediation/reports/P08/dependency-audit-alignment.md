# Dependency audit command alignment — 6 October 2026

The category milestone's local `npm run audit:ci` failed because that root
script ran raw `npm audit --audit-level=high`, while the required CI workflow
already ran `node scripts/audit.mjs`. The root script now invokes that same
existing gate. No dependency, override, audit rule or exception was changed.

The raw vulnerability remains: pinned `aws-cdk-lib` 2.271.0 bundles
`brace-expansion` 5.0.9 at
`node_modules/aws-cdk-lib/node_modules/brace-expansion`. The separate root
`brace-expansion` 5.0.12 is already outside the affected range. The installed
package metadata and root lock agree on these versions.

## Upstream verification

The [official AWS CDK release list](https://github.com/aws/aws-cdk/releases)
and npm registry both identify 2.272.0 as the latest published library on this
check. The [registry tarball](https://registry.npmjs.org/aws-cdk-lib/-/aws-cdk-lib-2.272.0.tgz)
was downloaded with `npm pack --ignore-scripts` into the ignored repair
directory. Its bundled `brace-expansion/package.json` still says 5.0.9;
its bundled `minimatch` is 10.2.5 with `brace-expansion: ^5.0.5`. Its published
integrity is
`sha512-XHqU7msDtp03JLoFqtbIuNPDeCebQxOBwRcuL6BpH8B1rV/sMHSdH9EY0ZRn+P004RKHs/+b5DPssN6F966k1A==`.
Upgrading to that release therefore does not remove this finding.

An isolated ignored scratch manifest scoped an override to
`aws-cdk-lib -> brace-expansion 5.0.12`. Running only
`npm install --package-lock-only --ignore-scripts --no-fund --no-audit`
still recorded bundled 5.0.9, and its raw audit reproduced the same failure.
No application dependencies were installed. The
[existing upstream bundle issue](https://github.com/aws/aws-cdk/issues/38496)
also explains why consumer overrides cannot replace this bundled dependency.

The raw report names
[GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7)
and [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p).
These are exactly the three advisories and sole install path already listed
in `scripts/audit-exceptions.json`. The approved exception's **31 October
2026** expiry is unchanged. New paths, other blocking advisories and expiry
continue to fail the existing gate. No fixed upstream bundle is claimed.

## Verification and limits

- The existing required `node scripts/audit.mjs` gate passed before the change.
- After alignment, `npm run audit:ci` passes through the identical gate and
  explicitly reports the existing exception and expiry.
- Raw `npm audit --audit-level=high` still reports one high vulnerability;
  its failure is retained as upstream-blocked dependency evidence.
- Formatting and whitespace checks pass for the changed package/report.
- `infra/cdk/package.json`, `package-lock.json` and the exception remain
  byte-identical; no CDK source, synthesized resources or runtime inputs changed.

Logs and tarball inspection metadata are retained under ignored
`.local/cdk-audit-repair-20261006/`. Full milestone CI remains the root
coordinator's release gate. A future actual fixed AWS bundle must be checked
and validated before claiming the vulnerability repaired.
