# P15 ASVS 5.0.0 L1/L2 review register

13 October 2026. All 253 individual L1/L2 controls (70 L1, 183 L2) from the pinned official input, SHA256 `33ea20d6fe9ca46b4a6336954f480a1d3ffa57af0fc25ab569e4f5788193bb99`. L3-only controls are excluded. This is an evidence/residual register, **not an ASVS L2 conformance certificate**.

Review used the full baseline ref `d2497b6332bd32758f24fd832a01a4d14524c4f0`, preserved independent authority and privacy/logging/upload review notes, current source inspection and local regression results. `/security-review` is unavailable and was not run. The independent notes predate these repairs; current reconciliation is by the implementing agent and is not a new independent audit. The baseline includes historical findings as well as new remediation. Untracked P15 source is included in the final source inventory.

Evidence names below identify precise source/test seams. Complete local gate and exact pushed-SHA CI are recorded separately in the phase report; a test filename never proves a deployed control. Controls needing real provider/browser/AWS/load/restore behavior remain P16 evidence. ADR choices are facts, not automatic ASVS waivers; residuals require owner review and retain all production, cost, identity and real-data approval gates.

Current reconciliation also covers initial organisation-only administrator login:
session settings resolve the real organisation, global audit records use NULL
event/member IDs, and fresh MFA creates a new SID before the first real event can
be created through the API. Withdrawal of organisation/global standing refuses
sign-in and renewal. All 66 affected identity tests passed locally; real Cognito
and browser evidence remains P16. The final notification diagnostic contains
kind/count and a fixed message, with private title/body/tag sentinel coverage.
Deleted-pool restore also has an explicit separate offline trust-root procedure:
one exact retained active platform administrator may be rebound with owner-reviewed
old/new subject and provider proof. It grants no new role, refuses foreign standing
and a second operator per organisation/new pool, and atomically invalidates all
credentials with attributed digest-only audit. Exact committed replay preserves
fresh sessions. The affected 167-test run passes; real execution remains owner-gated.

## V1 — Encoding and Sanitization

### V1.1.1 — L2

> Verify that input is decoded or unescaped into a canonical form only once, it is only decoded when encoded data in that form is expected, and that this is done before processing the input further, for example it is not performed after input validation or sanitization.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: server/src/platform/http/validate.ts parses body/query/params independently using Zod and stores parsed values; server/src/platform/http/staticClient.ts rewrites export paths. No double-unescape call was found in focused runtime search.
- Remaining verification/residual: Inspect encoded/double-encoded path cases in server/tests/unit/staticClient.test.ts and P16.10; do not infer every decode path from this seam.

### V1.1.2 — L2

> Verify that the application performs output encoding and escaping either as a final step before being used by the interpreter for which it is intended or by the interpreter itself.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: client React JSX renders text; server/src/platform/http/staticBranding.ts escapes HTML characters; server/src/modules/report/application/export/csvCell.ts quotes CSV/formula-leading text.
- Remaining verification/residual: Read staticClient/report/export regression assertions and include hostile labels in P16; each interpreter context must remain separate.

### V1.2.1 — L1

> Verify that output encoding for an HTTP response, HTML document, or XML document is relevant for the context required, such as encoding the relevant characters for HTML elements, HTML attributes, HTML comments, CSS, or HTTP header fields, to avoid changing the message or document structure.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: server/src/platform/http/staticBranding.ts escape function and React rendering provide specific HTML-context evidence; server/src/modules/report/http/exportResponse.ts owns downloads.
- Remaining verification/residual: Candidate server/tests/unit/staticClient.test.ts and report export checks; review all HTML/header contexts before acceptance.

### V1.2.2 — L1

> Verify that when dynamically building URLs, untrusted data is encoded according to its context (e.g., URL encoding or base64url encoding for query or path parameters). Ensure that only safe URL protocols are permitted (e.g., disallow javascript: or data:).

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: client/src/shared/lib/clientConfigValidation.ts and server/src/config/schemas/auth.ts bound production HTTPS canonical origins; hostedSignIn.ts uses redirect:error and a ten-second AbortSignal timeout. config and securityLogOutput unit assertions are local evidence; no provider endpoint was contacted.
- Remaining verification/residual: P16.10 must verify real HTTPS/origin/redirect refusals and provider issuer configuration.

### V1.2.3 — L1

> Verify that output encoding or escaping is used when dynamically building JavaScript content (including JSON), to avoid changing the message or document structure (to avoid JavaScript and JSON injection).

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Express res.json serializes API objects; server/src/platform/http/staticBranding.ts serializes manifest data instead of interpolating executable JavaScript; focused runtime search found no dangerouslySetInnerHTML.
- Remaining verification/residual: Inspect server/tests/unit/staticClient.test.ts and branding tests for escaped markup/JSON sentinel coverage.

### V1.2.4 — L1

> Verify that data selection or database queries (e.g., SQL, HQL, NoSQL, Cypher) use parameterized queries, ORMs, entity frameworks, or are otherwise protected from SQL Injection and other database injection attacks. This is also relevant when writing stored procedures.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: server/src/platform/db/client.ts uses Prisma; currentPermission and scheduler repos use tagged $queryRaw/$executeRaw with parameter interpolation rather than concatenated request SQL.
- Remaining verification/residual: P16.10 injection cases and focused raw-SQL inventory remain necessary; source seam does not prove every raw query.

### V1.2.5 — L1

> Verify that the application protects against OS command injection and that operating system calls use parameterized OS queries or use contextual command line output encoding.

- Applicability: Conditional.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Focused server/src search found no child_process/execFile/spawn runtime seam driven by requests; missionCard/application/renderCards.ts generates PDF using libraries. Docker/operational tools are separate command contexts.
- Remaining verification/residual: Recheck operational script and CI argument construction; runtime absence alone is not proof for all operator tooling.

### V1.2.6 — L2

> Verify that the application protects against LDAP injection vulnerabilities, or that specific security controls to prevent LDAP injection have been implemented.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No LDAP client/queries were found in server/src, client/src or shared runtime; identity uses Cognito HTTP/SDK integration.
- Remaining verification/residual: Re-evaluate if LDAP integration is added; current source inventory supports runtime nonapplicability only.

### V1.2.7 — L2

> Verify that the application is protected against XPath injection attacks by using query parameterization or precompiled queries.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No XPath queries or user-facing XML query language were found in focused runtime inventory; Prisma/JSON are the data paths.
- Remaining verification/residual: Generated XLSX XML is an output artifact, not an XPath input feature.

### V1.2.8 — L2

> Verify that LaTeX processors are configured securely (such as not using the "--shell-escape" flag) and an allowlist of commands is used to prevent LaTeX injection attacks.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No LaTeX processing/upload/rendering feature was found; card documents use PDF rendering and report exports use spreadsheet libraries.
- Remaining verification/residual: Re-evaluate if a TeX document processor is introduced.

### V1.2.9 — L2

> Verify that the application escapes special characters in regular expressions (typically using a backslash) to prevent them from being misinterpreted as metacharacters.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: server/src/platform/http/campusNetwork.ts parses IP/CIDR with fixed regex/BlockList; server/src/platform/http/staticClient.ts and notification contract use fixed regex; focused search found no new RegExp from user text.
- Remaining verification/residual: Inspect full regex-construction inventory before acceptance; fixed patterns alone do not prove ReDoS resistance.

### V1.3.1 — L1

> Verify that all untrusted HTML input from WYSIWYG editors or similar is sanitized using a well-known and secure HTML sanitization library or framework feature.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: Content editors use structured plain text and raster floor plans; focused runtime search found no WYSIWYG HTML input or HTML parser. React treats text as text.
- Remaining verification/residual: Preserve the plain-text contract; if HTML acceptance is added, this control becomes applicable.

### V1.3.2 — L1

> Verify that the application avoids the use of eval() or other dynamic code execution features such as Spring Expression Language (SpEL). Where there is no alternative, any user input being included must be sanitized before being executed.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Focused server/src/client/src search found no eval/new Function runtime execution. Infra Lambda Construct named Function is deployment code, not eval.
- Remaining verification/residual: Review dependencies and scripts separately; verify the generated client artifact through the CSP lane.

### V1.3.3 — L2

> Verify that data being passed to a potentially dangerous context is sanitized beforehand to enforce safety measures, such as only allowing characters which are safe for this context and trimming input which is too long.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: platform/uploads/validatedImage.ts, boundedBytes.ts and s3Image.ts perform bounded pinned-byte still-raster decode and normalization. Media validated receipts and content storage intents freeze derivatives/manifests. imageValidation/s3ImageValidation/media and contentStorage unit tests, securityBoundaryStorage, mediaUploadAdmission/mediaUploadReplay/contentStorageIntent are the relevant assertions. Final sink logging omits arbitrary strings.
- Remaining verification/residual: P16 verify signed origin/size/type, private immutable bytes, event deadlines, resource load and orphan cleanup. Raster normalization is not antivirus.

### V1.3.4 — L2

> Verify that user-supplied Scalable Vector Graphics (SVG) scriptable content is validated or sanitized to contain only tags and attributes (such as draw graphics) that are safe for the application, e.g., do not contain scripts and foreignObject.

- Applicability: Not applicable candidate.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: platform/uploads/validatedImage.ts, boundedBytes.ts and s3Image.ts perform bounded pinned-byte still-raster decode and normalization. Media validated receipts and content storage intents freeze derivatives/manifests. imageValidation/s3ImageValidation/media and contentStorage unit tests, securityBoundaryStorage, mediaUploadAdmission/mediaUploadReplay/contentStorageIntent are the relevant assertions. Final sink logging omits arbitrary strings.
- Remaining verification/residual: P16 verify signed origin/size/type, private immutable bytes, event deadlines, resource load and orphan cleanup. Raster normalization is not antivirus.

### V1.3.5 — L2

> Verify that the application sanitizes or disables user-supplied scriptable or expression template language content, such as Markdown, CSS or XSL stylesheets, BBCode, or similar.

- Applicability: Conditional.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Content contracts represent plain strings/structured objects; no Markdown/BBCode/XSL interpreter was found. Branding CSS values and finite classes are governed by the assigned CSP lane.
- Remaining verification/residual: Inspect branding field allowlists/generated CSS and client content rendering; do not treat CSS contexts as universally nonapplicable.

### V1.3.6 — L2

> Verify that the application protects against Server-side Request Forgery (SSRF) attacks, by validating untrusted data against an allowlist of protocols, domains, paths and ports and sanitizing potentially dangerous characters before using the data to call another service.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: client/src/shared/lib/clientConfigValidation.ts and server/src/config/schemas/auth.ts bound production HTTPS canonical origins; hostedSignIn.ts uses redirect:error and a ten-second AbortSignal timeout. config and securityLogOutput unit assertions are local evidence; no provider endpoint was contacted.
- Remaining verification/residual: P16.10 must verify real HTTPS/origin/redirect refusals and provider issuer configuration.

### V1.3.7 — L2

> Verify that the application protects against template injection attacks by not allowing templates to be built based on untrusted input. Where there is no alternative, any untrusted input being included dynamically during template creation must be sanitized or strictly validated.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: server/src/platform/http/staticBranding.ts inserts escaped data into fixed exported HTML; React components provide fixed templates. No request-selected executable template engine was found.
- Remaining verification/residual: Inspect static branding hostile-text regressions and generated artifacts; do not equate escaping with complete template-engine audit.

### V1.3.8 — L2

> Verify that the application appropriately sanitizes untrusted input before use in Java Naming and Directory Interface (JNDI) queries and that JNDI is configured securely to prevent JNDI injection attacks.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: Node/TypeScript runtime has no Java/JNDI integration in focused source inventory.
- Remaining verification/residual: Re-evaluate if JVM/JNDI services enter the architecture.

### V1.3.9 — L2

> Verify that the application sanitizes content before it is sent to memcache to prevent injection attacks.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No memcache client/protocol is present in focused runtime inventory; caches are local Maps, browser caches and PostgreSQL event-bus coordination.
- Remaining verification/residual: Re-evaluate if memcache is introduced.

### V1.3.10 — L2

> Verify that format strings which might resolve in an unexpected or malicious way when used are sanitized before being processed.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Pino uses structured fields/fixed messages; report CSV escaping treats values as literal data; no runtime user-controlled format-string engine was found.
- Remaining verification/residual: H3 serializer regression remains open; inspect PDF/XLSX rendering inputs before final acceptance.

### V1.3.11 — L2

> Verify that the application sanitizes user input before passing to mail systems to protect against SMTP or IMAP injection.

- Applicability: Conditional.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: CognitoIdentityProvider sends structured SDK parameters to default provider mail; current amended D-08 has no application SMTP/IMAP or baseline SES send flow.
- Remaining verification/residual: Provider validates addresses/templates in P16; inspect invite text/address contracts rather than treating all email controls as absent.

### V1.4.1 — L2

> Verify that the application uses memory-safe string, safer memory copy and pointer arithmetic to detect or prevent stack, buffer, or heap overflows.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Node/TypeScript application code is managed-memory; native Sharp/PDF/image and database dependencies remain in the trusted component set.
- Remaining verification/residual: Dependency audit/SBOM/native codec updates and media adversarial limits still require evidence; language choice alone is not acceptance.

### V1.4.2 — L2

> Verify that sign, range, and input validation techniques are used to prevent integer overflows.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Zod numeric ranges and integer constraints are used in shared contracts; server/src/modules/attendance/domain/attendanceRules.ts bounds failed-attempt windows and server/src/platform/http/campusNetwork.ts bounds CIDR prefixes.
- Remaining verification/residual: P16.10 should include integer boundaries, overflow/non-finite values and arithmetic totals; inspect all numeric contracts.

### V1.4.3 — L2

> Verify that dynamically allocated memory and resources are released, and that references or pointers to freed memory are removed or set to null to prevent dangling pointers and use-after-free vulnerabilities.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: platform/uploads/validatedImage.ts, boundedBytes.ts and s3Image.ts perform bounded pinned-byte still-raster decode and normalization. Media validated receipts and content storage intents freeze derivatives/manifests. imageValidation/s3ImageValidation/media and contentStorage unit tests, securityBoundaryStorage, mediaUploadAdmission/mediaUploadReplay/contentStorageIntent are the relevant assertions. Final sink logging omits arbitrary strings.
- Remaining verification/residual: P16 verify signed origin/size/type, private immutable bytes, event deadlines, resource load and orphan cleanup. Raster normalization is not antivirus.

### V1.5.1 — L1

> Verify that the application configures XML parsers to use a restrictive configuration and that unsafe features such as resolving external entities are disabled to prevent XML eXternal Entity (XXE) attacks.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No accepted untrusted XML parsing API was found in runtime inventory; XLSX is generated rather than uploaded.
- Remaining verification/residual: Re-evaluate for XML/XLSX document import; generated output does not make an XML parser input feature.

### V1.5.2 — L2

> Verify that deserialization of untrusted data enforces safe input handling, such as using an allowlist of object types or restricting client-defined object types, to prevent deserialization attacks. Deserialization mechanisms that are explicitly defined as insecure must not be used with untrusted input.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: express.json and Zod strict schemas parse JSON into expected structures; sessionTokens parses payload only after compact signature verification. No class-instantiating object deserializer was found.
- Remaining verification/residual: Candidate server/tests/integration/security.test.ts unknown-key/malformed JSON assertions; add prototype-key/duplicate-source cases during granular suite.

## V2 — Validation and Business Logic

### V2.1.1 — L1

> Verify that the application's documentation defines input validation rules for how to check the validity of data items against an expected structure. This could be common data formats such as credit card numbers, email addresses, telephone numbers, or it could be an internal data format.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: packages/shared/src/contracts and invariant modules document typed formats/field limits; platform/http/validate.ts describes trusted parsing.
- Remaining verification/residual: P16.10 field-case matrix must cover every route; undocumented exceptions should become explicit requirements.

### V2.1.2 — L2

> Verify that the application's documentation defines how to validate the logical and contextual consistency of combined data items, such as checking that suburb and ZIP code match.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: ADR-001/004/005 document event/member/lifecycle consistency; currentPermission, captureProvenance and module domain rules implement related-state checks.
- Remaining verification/residual: Inspect per-flow contracts/tests rather than accepting the entire business model from ADR presence.

### V2.1.3 — L2

> Verify that expectations for business logic limits and validations are documented, including both per-user and globally across the application.

- Applicability: Applicable.
- Disposition: Source repair recorded; external limits pending.
- Current evidence/review: HTTP tiers use shared UNLOGGED PostgreSQL counters with hashed subjects, transaction-clock windows, bounded cleanup/refund and no memory fallback. Pool-wide invitation allowance and durable STARTED/unknown delivery progress commit before external attempts. quotaCounters/rateLimitSettings/identityQuotaRetention and rosterIdentityBoundary regressions are local evidence. No finite concurrent-device cap is implemented; security-operations-runbook.md states this residual.
- Remaining verification/residual: P16 prove multi-instance refused/accepted limits, direct provider anti-abuse and peak resource behavior.

### V2.2.1 — L1

> Verify that input is validated to enforce business or functional expectations for that input. This should either use positive validation against an allow list of values, patterns, and ranges, or be based on comparing the input to an expected structure and logical limits according to predefined rules. For L1, this can focus on input which is used to make specific business or security decisions. For L2 and up, this should apply to all input.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: platform/http/validate.ts uses safeParse and strict shared schemas; server/tests/integration/security.test.ts checks unknown keys/malformed JSON/body size.
- Remaining verification/residual: P16.10 every-field validation is outstanding; no global completeness claim.

### V2.2.2 — L1

> Verify that the application is designed to enforce input validation at a trusted service layer. While client-side validation improves usability and should be encouraged, it must not be relied upon as a security control.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Validation runs in Express routes; application/domain functions recheck authority and logical state. Client schema validation is usability support.
- Remaining verification/residual: Inspect route inventory and direct use-case seams for omitted validators, including bodyless cookie routes.

### V2.2.3 — L2

> Verify that the application ensures that combinations of related data items are reasonable according to the pre-defined rules.

- Applicability: Applicable.
- Disposition: Source repair recorded; final campaign pending.
- Current evidence/review: currentPermission/captureStation recheck exact actions under Event/Person/member/assignment fences. Roster changes reload targets, enforce People.AssignRole/People.Update and refuse foreign-only adoption; credential invalidation/audit is atomic. Recovery proves provider ownership through durable immutable operation markers. Private-platform isolation and each schema-derived event ID × six roles compare foreign/missing targets. Reporting graphs serialize under Event and recheck current managers/cycles. credentialBoundary, rosterIdentityBoundary, cardAuthorityLocks, cardGroupIsolation, reportingLineBoundary, identityRecovery, isolation and platformIsolation cover these boundaries.
- Remaining verification/residual: Complete local/exact-SHA CI remains required; P16.10 proves deployed granular API cases and P16.3 external failures. No mock proves AWS delivery or commit rollback of an external provider action.

### V2.3.1 — L1

> Verify that the application will only process business logic flows for the same user in the expected sequential step order and without skipping steps.

- Applicability: Applicable.
- Disposition: Source repair recorded; final campaign pending.
- Current evidence/review: currentPermission/captureStation recheck exact actions under Event/Person/member/assignment fences. Roster changes reload targets, enforce People.AssignRole/People.Update and refuse foreign-only adoption; credential invalidation/audit is atomic. Recovery proves provider ownership through durable immutable operation markers. Private-platform isolation and each schema-derived event ID × six roles compare foreign/missing targets. Reporting graphs serialize under Event and recheck current managers/cycles. credentialBoundary, rosterIdentityBoundary, cardAuthorityLocks, cardGroupIsolation, reportingLineBoundary, identityRecovery, isolation and platformIsolation cover these boundaries.
- Remaining verification/residual: Complete local/exact-SHA CI remains required; P16.10 proves deployed granular API cases and P16.3 external failures. No mock proves AWS delivery or commit rollback of an external provider action.

### V2.3.2 — L2

> Verify that business logic limits are implemented per the application's documentation to avoid business logic flaws being exploited.

- Applicability: Applicable.
- Disposition: Source repair recorded; external limits pending.
- Current evidence/review: HTTP tiers use shared UNLOGGED PostgreSQL counters with hashed subjects, transaction-clock windows, bounded cleanup/refund and no memory fallback. Pool-wide invitation allowance and durable STARTED/unknown delivery progress commit before external attempts. quotaCounters/rateLimitSettings/identityQuotaRetention and rosterIdentityBoundary regressions are local evidence. No finite concurrent-device cap is implemented; security-operations-runbook.md states this residual.
- Remaining verification/residual: P16 prove multi-instance refused/accepted limits, direct provider anti-abuse and peak resource behavior.

### V2.3.3 — L2

> Verify that transactions are being used at the business logic level such that either a business logic operation succeeds in its entirety or it is rolled back to the previous correct state.

- Applicability: Applicable.
- Disposition: Source repair recorded; final campaign pending.
- Current evidence/review: currentPermission/captureStation recheck exact actions under Event/Person/member/assignment fences. Roster changes reload targets, enforce People.AssignRole/People.Update and refuse foreign-only adoption; credential invalidation/audit is atomic. Recovery proves provider ownership through durable immutable operation markers. Private-platform isolation and each schema-derived event ID × six roles compare foreign/missing targets. Reporting graphs serialize under Event and recheck current managers/cycles. credentialBoundary, rosterIdentityBoundary, cardAuthorityLocks, cardGroupIsolation, reportingLineBoundary, identityRecovery, isolation and platformIsolation cover these boundaries.
- Remaining verification/residual: Complete local/exact-SHA CI remains required; P16.10 proves deployed granular API cases and P16.3 external failures. No mock proves AWS delivery or commit rollback of an external provider action.

### V2.3.4 — L2

> Verify that business logic level locking mechanisms are used to ensure that limited quantity resources (such as theater seats or delivery slots) cannot be double-booked by manipulating the application's logic.

- Applicability: Applicable.
- Disposition: Source repair recorded; final campaign pending.
- Current evidence/review: currentPermission/captureStation recheck exact actions under Event/Person/member/assignment fences. Roster changes reload targets, enforce People.AssignRole/People.Update and refuse foreign-only adoption; credential invalidation/audit is atomic. Recovery proves provider ownership through durable immutable operation markers. Private-platform isolation and each schema-derived event ID × six roles compare foreign/missing targets. Reporting graphs serialize under Event and recheck current managers/cycles. credentialBoundary, rosterIdentityBoundary, cardAuthorityLocks, cardGroupIsolation, reportingLineBoundary, identityRecovery, isolation and platformIsolation cover these boundaries.
- Remaining verification/residual: Complete local/exact-SHA CI remains required; P16.10 proves deployed granular API cases and P16.3 external failures. No mock proves AWS delivery or commit rollback of an external provider action.

### V2.4.1 — L2

> Verify that anti-automation controls are in place to protect against excessive calls to application functions that could lead to data exfiltration, garbage-data creation, quota exhaustion, rate-limit breaches, denial-of-service, or overuse of costly resources.

- Applicability: Applicable.
- Disposition: Source repair recorded; external limits pending.
- Current evidence/review: HTTP tiers use shared UNLOGGED PostgreSQL counters with hashed subjects, transaction-clock windows, bounded cleanup/refund and no memory fallback. Pool-wide invitation allowance and durable STARTED/unknown delivery progress commit before external attempts. quotaCounters/rateLimitSettings/identityQuotaRetention and rosterIdentityBoundary regressions are local evidence. No finite concurrent-device cap is implemented; security-operations-runbook.md states this residual.
- Remaining verification/residual: P16 prove multi-instance refused/accepted limits, direct provider anti-abuse and peak resource behavior.

## V3 — Web Frontend Security

### V3.2.1 — L1

> Verify that security controls are in place to prevent browsers from rendering content or functionality in HTTP responses in an incorrect context (e.g., when an API, a user-uploaded file or other resource is requested directly). Possible controls could include: not serving the content unless HTTP request header fields (such as Sec-Fetch-\*) indicate it is the correct context, using the sandbox directive of the Content-Security-Policy header field or using the attachment disposition type in the Content-Disposition header field.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: platform/uploads/validatedImage.ts, boundedBytes.ts and s3Image.ts perform bounded pinned-byte still-raster decode and normalization. Media validated receipts and content storage intents freeze derivatives/manifests. imageValidation/s3ImageValidation/media and contentStorage unit tests, securityBoundaryStorage, mediaUploadAdmission/mediaUploadReplay/contentStorageIntent are the relevant assertions. Final sink logging omits arbitrary strings.
- Remaining verification/residual: P16 verify signed origin/size/type, private immutable bytes, event deadlines, resource load and orphan cleanup. Raster normalization is not antivirus.

### V3.2.2 — L1

> Verify that content intended to be displayed as text, rather than rendered as HTML, is handled using safe rendering functions (such as createTextNode or textContent) to prevent unintended execution of content such as HTML or JavaScript.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: React JSX renders user content as text; focused source search found no dangerouslySetInnerHTML or DOM innerHTML user seam.
- Remaining verification/residual: Candidate content-ui.test.tsx/safety forms; inspect external links and downloaded bytes separately.

### V3.3.1 — L1

> Verify that cookies have the 'Secure' attribute set, and if the '\__Host-' prefix is not used for the cookie name, the '__Secure-' prefix must be used for the cookie name.

- Applicability: Applicable.
- Disposition: Source repair recorded; browser proof pending.
- Current evidence/review: auth/http/cookies.ts uses production __Secure- names, Secure/HttpOnly, host-only scope and explicit legacy-cookie expiry. authHttpSafeguards unit assertions cover production attributes; test-mode legacy names remain intentional.
- Remaining verification/residual: P16 browser verifies upgrade, SameSite and actual cookie delivery with third-party cookies blocked.

### V3.3.2 — L2

> Verify that each cookie's 'SameSite' attribute value is set according to the purpose of the cookie, to limit exposure to user interface redress attacks and browser-based request forgery attacks, commonly known as cross-site request forgery (CSRF).

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Refresh uses SameSite=None only for configured cross-site topology; OAuth cookies use Lax for hosted redirect, all HttpOnly. ADR-006 describes first-party recovery.
- Remaining verification/residual: P16 real Chrome third-party-cookie-blocked journey and exact deployed cookie settings remain required.

### V3.3.3 — L2

> Verify that cookies have the '__Host-' prefix for the cookie name unless they are explicitly designed to be shared with other hosts.

- Applicability: Applicable.
- Disposition: Explicit residual; no conformance claim.
- Current evidence/review: Production cookies are host-only, Secure and __Secure-prefixed but use /api/v1/auth Path, not __Host- with Path=/. Narrow path is intentional credential minimization and is not the ASVS __Host- requirement. Production Domain is excluded.
- Remaining verification/residual: Owner security review must resolve this assurance deviation; do not describe narrow path as an approved shared-domain exception.

### V3.3.4 — L2

> Verify that if the value of a cookie is not meant to be accessible to client-side scripts (such as a session token), the cookie must have the 'HttpOnly' attribute set and the same value (e. g. session token) must only be transferred to the client via the 'Set-Cookie' header field.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: setRefreshCookie uses Set-Cookie HttpOnly; issueSession returns no refresh credential, MFA verification returns no refresh token.
- Remaining verification/residual: server/tests/integration/auth.test.ts asserts no refresh body and HttpOnly; keep temporary provider tokens server-side and test all handoff responses.

### V3.4.1 — L1

> Verify that a Strict-Transport-Security header field is included on all responses to enforce an HTTP Strict Transport Security (HSTS) policy. A maximum age of at least 1 year must be defined, and for L2 and up, the policy must apply to all subdomains as well.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: server/src/app/createApp.ts sets production HSTS maxAge=31536000/includeSubDomains; independent Firebase/DuckDNS/Caddy origins must be inspected after deployment.
- Remaining verification/residual: P16 edge/static/error/redirect response evidence; dev/test HSTS disabled intentionally, not production acceptance.

### V3.4.2 — L1

> Verify that the Cross-Origin Resource Sharing (CORS) Access-Control-Allow-Origin header field is a fixed value by the application, or if the Origin HTTP request header field value is used, it is validated against an allowlist of trusted origins. When 'Access-Control-Allow-Origin: *' needs to be used, verify that the response does not include any sensitive information.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: server/src/app/createApp.ts reflects only env.CORS_ALLOWED_ORIGINS and enables credentials; server/tests/integration/security.test.ts checks exact allowlist/preflight behavior.
- Remaining verification/residual: Production origin syntax/HTTPS validation still incomplete; inspect S3/Firebase CORS and actual P16 responses.

### V3.4.3 — L2

> Verify that HTTP responses include a Content-Security-Policy response header field which defines directives to ensure the browser only loads and executes trusted content or resources, in order to limit execution of malicious JavaScript. As a minimum, a global policy must be used which includes the directives object-src 'none' and base-uri 'none' and defines either an allowlist or uses nonces or hashes. For an L3 application, a per-response policy with nonces or hashes must be defined.

- Applicability: Applicable.
- Disposition: Source repair recorded; hosting proof pending.
- Current evidence/review: Static export byte hashes, exact per-page CSP manifests, shared validation and fail-closed Express/Firebase mappings replace unsafe-inline script/style. Branding CSS is a linked exact hashed artifact; request-time markup preserves the bootstrap manifest. Recovery sends no-referrer/no-store; safe logging excludes redirects/query values. static-csp generator and Firebase contract tests passed locally; final build/host checks remain in the complete gate.
- Remaining verification/residual: P16 actual static/error/redirect/byte responses and browser CSP diagnostics; local artifact checks do not establish deployed A-grade headers.

### V3.4.4 — L2

> Verify that all HTTP responses contain an 'X-Content-Type-Options: nosniff' header field. This instructs browsers not to use content sniffing and MIME type guessing for the given response, and to require the response's Content-Type header field value to match the destination resource. For example, the response to a request for a style is only accepted if the response's Content-Type is 'text/css'. This also enables the use of the Cross-Origin Read Blocking (CORB) functionality by the browser.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: platform/uploads/validatedImage.ts, boundedBytes.ts and s3Image.ts perform bounded pinned-byte still-raster decode and normalization. Media validated receipts and content storage intents freeze derivatives/manifests. imageValidation/s3ImageValidation/media and contentStorage unit tests, securityBoundaryStorage, mediaUploadAdmission/mediaUploadReplay/contentStorageIntent are the relevant assertions. Final sink logging omits arbitrary strings.
- Remaining verification/residual: P16 verify signed origin/size/type, private immutable bytes, event deadlines, resource load and orphan cleanup. Raster normalization is not antivirus.

### V3.4.5 — L2

> Verify that the application sets a referrer policy to prevent leakage of technically sensitive data to third-party services via the 'Referer' HTTP request header field. This can be done using the Referrer-Policy HTTP response header field or via HTML element attributes. Sensitive data could include path and query data in the URL, and for internal non-public applications also the hostname.

- Applicability: Applicable.
- Disposition: Source repair recorded; hosting proof pending.
- Current evidence/review: Static export byte hashes, exact per-page CSP manifests, shared validation and fail-closed Express/Firebase mappings replace unsafe-inline script/style. Branding CSS is a linked exact hashed artifact; request-time markup preserves the bootstrap manifest. Recovery sends no-referrer/no-store; safe logging excludes redirects/query values. static-csp generator and Firebase contract tests passed locally; final build/host checks remain in the complete gate.
- Remaining verification/residual: P16 actual static/error/redirect/byte responses and browser CSP diagnostics; local artifact checks do not establish deployed A-grade headers.

### V3.4.6 — L2

> Verify that the web application uses the frame-ancestors directive of the Content-Security-Policy header field for every HTTP response to ensure that it cannot be embedded by default and that embedding of specific resources is allowed only when necessary. Note that the X-Frame-Options header field, although supported by browsers, is obsolete and may not be relied upon.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Helmet frame-ancestors none on API; staticClient clientHeaders owns static CSP. server/tests/integration/security.test.ts checks policy on health.
- Remaining verification/residual: Assigned CSP final artifact checks and P16 origin coverage required; do not rely solely on obsolete X-Frame-Options.

### V3.5.1 — L1

> Verify that, if the application does not rely on the CORS preflight mechanism to prevent disallowed cross-origin requests to use sensitive functionality, these requests are validated to ensure they originate from the application itself. This may be done by using and validating anti-forgery tokens or requiring extra HTTP header fields that are not CORS-safelisted request-header fields. This is to defend against browser-based request forgery attacks, commonly known as cross-site request forgery (CSRF).

- Applicability: Conditional.
- Disposition: Source repair recorded; browser proof pending.
- Current evidence/review: assertTrustedOrigin accepts only the configured origin; absent Origin requires same-origin Fetch Metadata plus application/json. Evil/null/missing-origin and safelisted forms refuse before credential mutation. Operational bearers are explicit headers. authHttpSafeguards and auth/sessionHandoff tests are local assertions.
- Remaining verification/residual: P16 exercise real credentialed CORS/preflight/cookies and all state-changing auth routes.

### V3.5.2 — L1

> Verify that, if the application relies on the CORS preflight mechanism to prevent disallowed cross-origin use of sensitive functionality, it is not possible to call the functionality with a request which does not trigger a CORS-preflight request. This may require checking the values of the 'Origin' and 'Content-Type' request header fields or using an extra header field that is not a CORS-safelisted header-field.

- Applicability: Applicable.
- Disposition: Source repair recorded; browser proof pending.
- Current evidence/review: assertTrustedOrigin accepts only the configured origin; absent Origin requires same-origin Fetch Metadata plus application/json. Evil/null/missing-origin and safelisted forms refuse before credential mutation. Operational bearers are explicit headers. authHttpSafeguards and auth/sessionHandoff tests are local assertions.
- Remaining verification/residual: P16 exercise real credentialed CORS/preflight/cookies and all state-changing auth routes.

### V3.5.3 — L1

> Verify that HTTP requests to sensitive functionality use appropriate HTTP methods such as POST, PUT, PATCH, or DELETE, and not methods defined by the HTTP specification as "safe" such as HEAD, OPTIONS, or GET. Alternatively, strict validation of the Sec-Fetch-* request header fields can be used to ensure that the request did not originate from an inappropriate cross-origin call, a navigation request, or a resource load (such as an image source) where this is not expected.

- Applicability: Applicable.
- Disposition: Explicit protocol residual; browser evidence pending.
- Current evidence/review: GET /recover still rotates a family and creates a short-lived one-use PKCE-bound handoff to an exact allowed first-party destination. POST/DELETE protect ordinary credential mutations. Source does not enforce a complete Sec-Fetch user-navigation policy on GET recover.
- Remaining verification/residual: P16 must prove initiation/state/verifier binding and assess forced-navigation denial of service. Preserve ADR-006 blocked-cookie recovery; no claim that GET is side-effect free or fully satisfies this control.

### V3.5.4 — L2

> Verify that separate applications are hosted on different hostnames to leverage the restrictions provided by same-origin policy, including how documents or scripts loaded by one origin can interact with resources from another origin and hostname-based restrictions on cookies.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: ADR-006/008 owner amendments separate Firebase client/DuckDNS API and synthetic staging hosts; production will be separately provisioned.
- Remaining verification/residual: P16 verify actual origins, cookie isolation and no co-hosted unrelated application; production remains gated.

### V3.5.5 — L2

> Verify that messages received by the postMessage interface are discarded if the origin of the message is not trusted, or if the syntax of the message is invalid.

- Applicability: Conditional.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: usePushSubscriptionSync listens on navigator.serviceWorker message (not window postMessage) for a fixed type; sw.js sends only push-subscription-changed.
- Remaining verification/residual: Inspect source validation for this same-origin worker seam; no window cross-origin postMessage authentication channel found.

### V3.7.1 — L2

> Verify that the application only uses client-side technologies which are still supported and considered secure. Examples of technologies which do not meet this requirement include NSAPI plugins, Flash, Shockwave, ActiveX, Silverlight, NACL, or client-side Java applets.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Client uses supported browser JavaScript/React/service workers; focused inventory found no Flash/ActiveX/NSAPI/Java applet.
- Remaining verification/residual: Browser-support and dependency/runtime support evidence belongs to P16 and dependency review.

### V3.7.2 — L2

> Verify that the application will only automatically redirect the user to a different hostname or domain (which is not controlled by the application) where the destination appears on an allowlist.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: handoff recoveryTarget validates allowlisted client origin; hosted OAuth target is configured Cognito domain. Client return paths have explicit validation.
- Remaining verification/residual: sessionHandoff tests cover unsafe return targets; configuration must reject unsafe provider/API origins.

## V4 — API and Web Service

### V4.1.1 — L1

> Verify that every HTTP response with a message body contains a Content-Type header field that matches the actual content of the response, including the charset parameter to specify safe character encoding (e.g., UTF-8, ISO-8859-1) according to IANA Media Types, such as "text/", "/+xml" and "/xml".

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Express res.json/res.type and static server emit typed responses; exportResponse and S3 signed reads set dispositions/types.
- Remaining verification/residual: P16.10 inspect each body response/error/download Content-Type; decoder gap means declared raster MIME is not yet byte proof.

### V4.1.2 — L2

> Verify that only user-facing endpoints (intended for manual web-browser access) automatically redirect from HTTP to HTTPS, while other services or endpoints do not implement transparent redirects. This is to avoid a situation where a client is erroneously sending unencrypted HTTP requests, but since the requests are being automatically redirected to HTTPS, the leakage of sensitive data goes undiscovered.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Caddyfile has explicit HTTP port-80 health/404 block but automatic HTTPS behavior and API edge routing have not been exercised.
- Remaining verification/residual: P16 send HTTP API credential-like sentinel without real secrets: API must refuse plaintext rather than silently redirect; browser pages may redirect.

### V4.1.3 — L2

> Verify that any HTTP header field used by the application and set by an intermediary layer, such as a load balancer, a web proxy, or a backend-for-frontend service, cannot be overridden by the end-user. Example headers might include X-Real-IP, X-Forwarded-*, or X-User-ID.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: createApp trusts a configured hop count, not trust-proxy true; campusNetwork/rate limit rely on req.ip. Caddy/API Gateway trust boundaries need deployed spoof tests.
- Remaining verification/residual: Inspect TRUST_PROXY_HOPS per actual path; P16 test forged X-Forwarded-* without treating arbitrary original IP as authenticated identity.

### V4.2.1 — L2

> Verify that all application components (including load balancers, firewalls, and application servers) determine boundaries of incoming HTTP messages using the appropriate mechanism for the HTTP version to prevent HTTP request smuggling. In HTTP/1.x, if a Transfer-Encoding header field is present, the Content-Length header must be ignored per RFC 2616. When using HTTP/2 or HTTP/3, if a Content-Length header field is present, the receiver must ensure that it is consistent with the length of the DATA frames.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Runtime Node/Express behind Caddy/API Gateway parses HTTP; app source cannot establish intermediary boundary agreement.
- Remaining verification/residual: P16 authorized synthetic conflicting Content-Length/Transfer-Encoding and HTTP-version cases plus provider configuration evidence.

### V4.3.1 — L2

> Verify that a query allowlist, depth limiting, amount limiting, or query cost analysis is used to prevent GraphQL or data layer expression Denial of Service (DoS) as a result of expensive, nested queries.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No GraphQL/data-expression endpoint was found; app routes accept fixed REST contracts with paginated lists.
- Remaining verification/residual: Re-evaluate if GraphQL/expression queries are introduced; pagination/resource limits remain applicable elsewhere.

### V4.3.2 — L2

> Verify that GraphQL introspection queries are disabled in the production environment unless the GraphQL API is meant to be used by other parties.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No GraphQL server or introspection endpoint exists in focused route/runtime inventory.
- Remaining verification/residual: Keep route inventory as supporting absence evidence; do not infer REST documentation must be absent.

### V4.4.1 — L1

> Verify that WebSocket over TLS (WSS) is used for all WebSocket connections.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: Dashboard source/comments use polling, not WebSockets; no ws/socket.io runtime seam found.
- Remaining verification/residual: Re-evaluate if WebSocket transport is added.

### V4.4.2 — L2

> Verify that, during the initial HTTP WebSocket handshake, the Origin header field is checked against a list of origins allowed for the application.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No WebSocket handshake exists in current runtime inventory; polling uses existing HTTP CORS/auth.
- Remaining verification/residual: New WebSocket handshake must acquire its own origin allowlist checks.

### V4.4.3 — L2

> Verify that, if the application's standard session management cannot be used, dedicated tokens are being used for this, which comply with the relevant Session Management security requirements.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No dedicated WebSocket session mechanism is implemented; current HTTP sessions are handled by auth/session modules.
- Remaining verification/residual: Re-evaluate on addition of a persistent bidirectional channel.

### V4.4.4 — L2

> Verify that dedicated WebSocket session management tokens are initially obtained or validated through the previously authenticated HTTPS session when transitioning an existing HTTPS session to a WebSocket channel.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No transition from HTTP into WebSocket session tokens exists in the current polling architecture.
- Remaining verification/residual: A future socket token must be bound to verified HTTPS session ownership.

## V5 — File Handling

### V5.1.1 — L2

> Verify that the documentation defines the permitted file types, expected file extensions, and maximum size (including unpacked size) for each upload feature. Additionally, ensure that the documentation specifies how files are made safe for end-users to download and process, such as how the application behaves when a malicious file is detected.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: platform/uploads/validatedImage.ts, boundedBytes.ts and s3Image.ts perform bounded pinned-byte still-raster decode and normalization. Media validated receipts and content storage intents freeze derivatives/manifests. imageValidation/s3ImageValidation/media and contentStorage unit tests, securityBoundaryStorage, mediaUploadAdmission/mediaUploadReplay/contentStorageIntent are the relevant assertions. Final sink logging omits arbitrary strings.
- Remaining verification/residual: P16 verify signed origin/size/type, private immutable bytes, event deadlines, resource load and orphan cleanup. Raster normalization is not antivirus.

### V5.2.1 — L1

> Verify that the application will only accept files of a size which it can process without causing a loss of performance or a denial of service attack.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: platform/uploads/validatedImage.ts, boundedBytes.ts and s3Image.ts perform bounded pinned-byte still-raster decode and normalization. Media validated receipts and content storage intents freeze derivatives/manifests. imageValidation/s3ImageValidation/media and contentStorage unit tests, securityBoundaryStorage, mediaUploadAdmission/mediaUploadReplay/contentStorageIntent are the relevant assertions. Final sink logging omits arbitrary strings.
- Remaining verification/residual: P16 verify signed origin/size/type, private immutable bytes, event deadlines, resource load and orphan cleanup. Raster normalization is not antivirus.

### V5.2.2 — L1

> Verify that when the application accepts a file, either on its own or within an archive such as a zip file, it checks if the file extension matches an expected file extension and validates that the contents correspond to the type represented by the extension. This includes, but is not limited to, checking the initial 'magic bytes', performing image re-writing, and using specialized libraries for file content validation. For L1, this can focus just on files which are used to make specific business or security decisions. For L2 and up, this must apply to all files being accepted.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: platform/uploads/validatedImage.ts, boundedBytes.ts and s3Image.ts perform bounded pinned-byte still-raster decode and normalization. Media validated receipts and content storage intents freeze derivatives/manifests. imageValidation/s3ImageValidation/media and contentStorage unit tests, securityBoundaryStorage, mediaUploadAdmission/mediaUploadReplay/contentStorageIntent are the relevant assertions. Final sink logging omits arbitrary strings.
- Remaining verification/residual: P16 verify signed origin/size/type, private immutable bytes, event deadlines, resource load and orphan cleanup. Raster normalization is not antivirus.

### V5.2.3 — L2

> Verify that the application checks compressed files (e.g., zip, gz, docx, odt) against maximum allowed uncompressed size and against maximum number of files before uncompressing the file.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No accepted ZIP/GZ/DOCX/ODT upload-and-extract input feature was found; roster/fallback imports are bounded text CSV and report/card ZIPs are generated outputs.
- Remaining verification/residual: Re-evaluate if compressed import is added; raster decoded-pixel limits still belong to V5.2.1.

### V5.3.1 — L1

> Verify that files uploaded or generated by untrusted input and stored in a public folder, are not executed as server-side program code when accessed directly with an HTTP request.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Private S3 buckets store files; public direct access is blocked and keys are not served by a code-executing application folder. Docker static client is fixed export output.
- Remaining verification/residual: infra/cdk/test/objectStorage.test.ts is a candidate; P16 direct-public refusal and actual byte-serving checks required.

### V5.3.2 — L1

> Verify that when the application creates file paths for file operations, instead of user-submitted filenames, it uses internally generated or trusted data, or if user-submitted filenames or file metadata must be used, strict validation and sanitization must be applied. This is to protect against path traversal, local or remote file inclusion (LFI, RFI), and server-side request forgery (SSRF) attacks.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Upload keys are server-generated event-scoped identifiers; staticClient inside() uses normalized containment checks. Report/card output keys come from trusted database identity.
- Remaining verification/residual: mediaEventOwnership/staticClient tests are candidates; cover encoded path traversal and foreign-event keys.

### V5.4.1 — L2

> Verify that the application validates or ignores user-submitted filenames, including in a JSON, JSONP, or URL parameter and specifies a filename in the Content-Disposition header field in the response.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Media/content ignore caller filenames and generate keys; report/export response uses server-owned download names.
- Remaining verification/residual: Inspect Content-Disposition in every file response and ensure input filename is neither reflected nor treated as path.

### V5.4.2 — L2

> Verify that file names served (e.g., in HTTP response header fields or email attachments) are encoded or sanitized (e.g., following RFC 6266) to preserve document structure and prevent injection attacks.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Report/card response code owns filenames; CSV cell escaping separately protects spreadsheet content. No user filename is required for photo upload.
- Remaining verification/residual: Inspect non-ASCII/control/header-injection download-label regressions; do not use CSV escaping as header encoding proof.

### V5.4.3 — L2

> Verify that files obtained from untrusted sources are scanned by antivirus scanners to prevent serving of known malicious content.

- Applicability: Applicable.
- Disposition: Explicit residual; owner service decision held.
- Current evidence/review: Still-raster allowlist, byte/pixel/frame/concurrency caps, full decode and metadata-stripping derivative constrain malicious uploads. No antivirus service is implemented or enabled. These mitigations do not satisfy a scanner requirement.
- Remaining verification/residual: Record scanner/provider assurance decision with the owner; no new paid service is authorized.

## V6 — Authentication

### V6.1.1 — L1

> Verify that application documentation defines how controls such as rate limiting, anti-automation, and adaptive response, are used to defend against attacks such as credential stuffing and password brute force. The documentation must make clear how these controls are configured and prevent malicious account lockout.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: ADR-006 identity and ADR-008 edge/cost sections document hosted sign-in, MFA tiers, provider Essentials/Plus and app/edge quotas.
- Remaining verification/residual: P15 quota implementation and final anti-lockout policy/refusal documentation remain required; paid Plus retains owner approval.

### V6.1.2 — L2

> Verify that a list of context-specific words is documented in order to prevent their use in passwords. The list could include permutations of organization names, product names, system identifiers, project codenames, department or role names, and similar.

- Applicability: Applicable.
- Disposition: Provider assurance residual; owner review held.
- Current evidence/review: Cognito Essentials baseline manages passwords; CDK length/composition/temporary lifetime does not prove a common/contextual/breached-password denylist. Plus/adaptive checks are a priced architecture option, not evidence of a configured denylist or permission to enable them now.
- Remaining verification/residual: Obtain primary provider/configuration proof in P16 or record a specific owner-reviewed residual. No password-list conformance is claimed.

### V6.1.3 — L2

> Verify that, if the application includes multiple authentication pathways, these are all documented together with the security controls and authentication strength which must be consistently enforced across them.

- Applicability: Applicable.
- Disposition: Source repair recorded; provider proof pending.
- Current evidence/review: identity.ts explicitly emits empty ExplicitAuthFlows, code-only OAuth, ten-second provider refresh-rotation grace, immutable unreadable/unwritable creation marker and only openid/email/cognito.admin scopes. beginLogin requests the enrollment scope. verify-cognito checks exact flow/rotation/marker/scope definitions. identityHardening and verifyCognito assertions exercise the actual definitions; deployed client is not observed.
- Remaining verification/residual: P16 run configuration verification and synthetic provider replay/enrollment/invite tests; local templates are not provider behavior.

### V6.2.1 — L1

> Verify that user set passwords are at least 8 characters in length although a minimum of 15 characters is strongly recommended.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: infra/cdk/src/identity.ts sets Cognito minimumLength=12; infra/cdk/test/identityHardening.test.ts asserts the source property.
- Remaining verification/residual: P16 observe deployed policy/password acceptance; ASVS recommends 15 but normative L1 minimum is 8.

### V6.2.2 — L1

> Verify that users can change their password.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Passwords are hosted Cognito-managed; the application neither stores passwords nor implements a local deployed change form.
- Remaining verification/residual: P16 demonstrate accessible provider password-change flow; source configuration alone does not prove users can change passwords.

### V6.2.3 — L1

> Verify that password change functionality requires the user's current and new password.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito owns password changes/recovery; no app ChangePassword handler was found.
- Remaining verification/residual: Provider-backed normal change must require current/new password, while forgotten-password flow follows its separate controls; test synthetic accounts in P16.

### V6.2.4 — L1

> Verify that passwords submitted during account registration or password change are checked against an available set of, at least, the top 3000 passwords which match the application's password policy, e.g. minimum length.

- Applicability: Applicable.
- Disposition: Provider assurance residual; owner review held.
- Current evidence/review: Cognito Essentials baseline manages passwords; CDK length/composition/temporary lifetime does not prove a common/contextual/breached-password denylist. Plus/adaptive checks are a priced architecture option, not evidence of a configured denylist or permission to enable them now.
- Remaining verification/residual: Obtain primary provider/configuration proof in P16 or record a specific owner-reviewed residual. No password-list conformance is claimed.

### V6.2.5 — L1

> Verify that passwords of any composition can be used, without rules limiting the type of characters permitted. There must be no requirement for a minimum number of upper or lower case characters, numbers, or special characters.

- Applicability: Applicable.
- Disposition: Explicit architecture residual; owner review pending.
- Current evidence/review: infra/cdk/src/identity.ts enforces lower/upper/digit/symbol composition; ADR-006 target historically specifies lower/digits. This conflicts with no-composition ASVS requirement.
- Remaining verification/residual: Record the accepted ADR deviation accurately and reconcile code-versus-ADR upper/symbol additions; changing identity deployment retains its existing review gate.

### V6.2.6 — L1

> Verify that password input fields use type=password to mask the entry. Applications may allow the user to temporarily view the entire masked password, or the last typed character of the password.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Real password entry is Cognito managed-login, not application React; local development sign-in is roster email only and forbidden in production.
- Remaining verification/residual: P16 inspect hosted password masking/view behavior; mocked app sign-in cannot establish this.

### V6.2.7 — L1

> Verify that "paste" functionality, browser password helpers, and external password managers are permitted.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Hosted Cognito login owns password input and manager integration; no application paste-blocking password handler exists.
- Remaining verification/residual: P16 test paste/autofill/password manager with synthetic credentials, without exposing them in evidence.

### V6.2.8 — L1

> Verify that the application verifies the user's password exactly as received from the user, without any modifications such as truncation or case transformation.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito performs password verification; app receives verified provider tokens and does not trim/transform a deployed password.
- Remaining verification/residual: Provider documentation/actual synthetic acceptance must prove exact verification, including Unicode/whitespace handling.

### V6.2.9 — L2

> Verify that passwords of at least 64 characters are permitted.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito owns password maximum length; CDK config only sets minimum/composition and temporary lifetime.
- Remaining verification/residual: P16/provider proof for acceptance of >=64 characters; absence of an app maximum is not provider evidence.

### V6.2.10 — L2

> Verify that a user's password stays valid until it is discovered to be compromised or the user rotates it. The application must not require periodic credential rotation.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: No periodic user-password rotation is configured in infra/cdk/src/identity.ts; temporary-password validity30 days is an initial invitation control, not ordinary rotation.
- Remaining verification/residual: Confirm provider regular password policy and compromise handling; do not confuse operator DB/session-key rotation with user passwords.

### V6.2.11 — L2

> Verify that the documented list of context specific words is used to prevent easy to guess passwords being created.

- Applicability: Applicable.
- Disposition: Provider assurance residual; owner review held.
- Current evidence/review: Cognito Essentials baseline manages passwords; CDK length/composition/temporary lifetime does not prove a common/contextual/breached-password denylist. Plus/adaptive checks are a priced architecture option, not evidence of a configured denylist or permission to enable them now.
- Remaining verification/residual: Obtain primary provider/configuration proof in P16 or record a specific owner-reviewed residual. No password-list conformance is claimed.

### V6.2.12 — L2

> Verify that passwords submitted during account registration or password changes are checked against a set of breached passwords.

- Applicability: Applicable.
- Disposition: Provider assurance residual; owner review held.
- Current evidence/review: Cognito Essentials baseline manages passwords; CDK length/composition/temporary lifetime does not prove a common/contextual/breached-password denylist. Plus/adaptive checks are a priced architecture option, not evidence of a configured denylist or permission to enable them now.
- Remaining verification/residual: Obtain primary provider/configuration proof in P16 or record a specific owner-reviewed residual. No password-list conformance is claimed.

### V6.3.1 — L1

> Verify that controls to prevent attacks such as credential stuffing and password brute force are implemented according to the application's security documentation.

- Applicability: Applicable.
- Disposition: Source repair recorded; external limits pending.
- Current evidence/review: HTTP tiers use shared UNLOGGED PostgreSQL counters with hashed subjects, transaction-clock windows, bounded cleanup/refund and no memory fallback. Pool-wide invitation allowance and durable STARTED/unknown delivery progress commit before external attempts. quotaCounters/rateLimitSettings/identityQuotaRetention and rosterIdentityBoundary regressions are local evidence. No finite concurrent-device cap is implemented; security-operations-runbook.md states this residual.
- Remaining verification/residual: P16 prove multi-instance refused/accepted limits, direct provider anti-abuse and peak resource behavior.

### V6.3.2 — L1

> Verify that default user accounts (e.g., "root", "admin", or "sa") are not present in the application or are disabled.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: selfSignUpEnabled=false and normal app provisioning require membership; AUTH_PROVIDER=local fails production boot. Test fixture accounts are synthetic.
- Remaining verification/residual: Inspect deployed seed/default accounts in P16; source production guard does not prove account inventory has no active defaults.

### V6.3.3 — L2

> Verify that either a multi-factor authentication mechanism or a combination of single-factor authentication mechanisms, must be used in order to access the application. For L3, one of the factors must be a hardware-based authentication mechanism which provides compromise and impersonation resistance against phishing attacks while verifying the intent to authenticate by requiring a user-initiated action (such as a button press on a FIDO hardware key or a mobile phone). Relaxing any of the considerations in this requirement requires a fully documented rationale and a comprehensive set of mitigating controls.

- Applicability: Applicable.
- Disposition: Explicit architecture residual; owner review pending.
- Current evidence/review: ADR-006 intentionally requires TOTP for admin tiers/platform admins and permits volunteer/IC single factor on shared phones; infra/cdk/src/identity.ts pool MFA OPTIONAL.
- Remaining verification/residual: Record documented relaxation rationale and comprehensive mitigating controls; this is an explicit L2 deviation, not universal MFA conformance.

### V6.3.4 — L2

> Verify that, if the application includes multiple authentication pathways, there are no undocumented pathways and that security controls and authentication strength are enforced consistently.

- Applicability: Applicable.
- Disposition: Source repair recorded; provider proof pending.
- Current evidence/review: identity.ts explicitly emits empty ExplicitAuthFlows, code-only OAuth, ten-second provider refresh-rotation grace, immutable unreadable/unwritable creation marker and only openid/email/cognito.admin scopes. beginLogin requests the enrollment scope. verify-cognito checks exact flow/rotation/marker/scope definitions. identityHardening and verifyCognito assertions exercise the actual definitions; deployed client is not observed.
- Remaining verification/residual: P16 run configuration verification and synthetic provider replay/enrollment/invite tests; local templates are not provider behavior.

### V6.4.1 — L1

> Verify that system generated initial passwords or activation codes are securely randomly generated, follow the existing password policy, and expire after a short period of time or after they are initially used. These initial secrets must not be permitted to become the long term password.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito AdminCreateUser generates initial secrets; infra/cdk/src/identity.ts tempPasswordValidity30days and source verification enforce target. Recovery journals may suppress/deliver invitations under owner gates.
- Remaining verification/residual: P16 synthetic invite/change-on-first-use/expiry; ADR-006 accepts30 days for training, which needs explicit interpretation of short-lived requirement.

### V6.4.2 — L1

> Verify that password hints or knowledge-based authentication (so-called "secret questions") are not present.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: No security-question/hint fields or application knowledge-based recovery flow were found; Cognito AccountRecovery EMAIL_ONLY and TOTP configuration.
- Remaining verification/residual: Confirm managed-login provider UI does not enable hints/questions in P16.

### V6.4.3 — L2

> Verify that a secure process for resetting a forgotten password is implemented, that does not bypass any enabled multi-factor authentication mechanisms.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito email-only password recovery owns this flow; app has no forgotten-password bypass implementation. API sessions have independent long lifetimes.
- Remaining verification/residual: Prove reset does not bypass enabled TOTP and document termination of pre-reset API sessions; provider success alone does not invalidate app sessions.

### V6.4.4 — L2

> Verify that if a multi-factor authentication factor is lost, evidence of identity proofing is performed at the same level as during enrollment.

- Applicability: Applicable.
- Disposition: Manual procedure recorded; owner/provider proof pending.
- Current evidence/review: security-operations-runbook.md records independently verified trusted-contact/roster proof, another administrator review, case attribution, suspension/invalidation and fresh enrollment after approved factor reset. Restored-pool rebind is separate and does not prove identity. No automatic factor-reset service is implemented.
- Remaining verification/residual: Owner walkthrough and synthetic provider rehearsal in P16; do not execute real-person recovery from source readiness.

### V6.5.1 — L2

> Verify that lookup secrets, out-of-band authentication requests or codes, and time-based one-time passwords (TOTPs) are only successfully usable once.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito owns TOTP replay prevention; app verifyMfa delegates code to provider. Handoff codes use delete/consume-once transaction, but they are session authorization handoffs rather than TOTP.
- Remaining verification/residual: P16 same-code TOTP replay across app/provider attempts; local provider mocks are not replay evidence.

### V6.5.2 — L2

> Verify that, when being stored in the application's backend, lookup secrets with less than 112 bits of entropy (19 random alphanumeric characters or 34 random digits) are hashed with an approved password storage hashing algorithm that incorporates a 32-bit random salt. A standard hash function can be used if the secret has 112 bits of entropy or more.

- Applicability: Conditional.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Application does not store low-entropy lookup secrets/passwords/TOTP seed at rest; MFA secret is provider-owned and returned to the restricted enrollment screen. Refresh/handoff digests protect high-entropy random tokens.
- Remaining verification/residual: Provider storage/hash proof is delegated; retain temporary provider-envelope protection and client secret lifecycle.

### V6.5.3 — L2

> Verify that lookup secrets, out-of-band authentication code, and time-based one-time password seeds, are generated using a Cryptographically Secure Pseudorandom Number Generator (CSPRNG) to avoid predictable values.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito generates TOTP seed; app randomBytes generates PKCE/state/refresh/handoff nonces. Enrollment seed generation cannot be established from app mock.
- Remaining verification/residual: Provider cryptographic-generation documentation and real synthetic enrollment in P16.

### V6.5.4 — L2

> Verify that lookup secrets and out-of-band authentication codes have a minimum of 20 bits of entropy (typically 4 random alphanumeric characters or 6 random digits is sufficient).

- Applicability: Conditional.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: App does not issue low-entropy out-of-band authentication codes; Cognito owns recovery/initial codes and TOTP is handled separately. Attendance PIN is presence verification, not sign-in authentication.
- Remaining verification/residual: Confirm provider-generated recovery-code entropy; do not classify attendance PIN as an authentication factor without product evidence.

### V6.5.5 — L2

> Verify that out-of-band authentication requests, codes, or tokens, as well as time-based one-time passwords (TOTPs) have a defined lifetime. Out of band requests must have a maximum lifetime of 10 minutes and for TOTP a maximum lifetime of 30 seconds.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Pending provider envelope expires after5minutes in server/src/modules/auth/application/sessionSecurity.ts; Cognito owns TOTP period and password-recovery code lifetime.
- Remaining verification/residual: P16/provider proof for30second TOTP and <=10minute out-of-band requests; invitation temporary-password30days is separately documented.

### V6.6.1 — L2

> Verify that authentication mechanisms using the Public Switched Telephone Network (PSTN) to deliver One-time Passwords (OTPs) via phone or SMS are offered only when the phone number has previously been validated, alternate stronger methods (such as Time based One-time Passwords) are also offered, and the service provides information on their security risks to users. For L3 applications, phone and SMS must not be available as options.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: infra/cdk/src/identity.ts configures TOTP with sms:false; AccountRecovery EMAIL_ONLY. Optional SNS SMS on-call alarms are not authentication OTP.
- Remaining verification/residual: Re-evaluate if phone/SMS sign-in or recovery is enabled; preserve current cost/security decision.

### V6.6.2 — L2

> Verify that out-of-band authentication requests, codes, or tokens are bound to the original authentication request for which they were generated and are not usable for a previous or subsequent one.

- Applicability: Conditional.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito manages email-based password recovery and initial invitations; no app-issued out-of-band authentication request is implemented. PKCE handoff is bound separately to state/verifier.
- Remaining verification/residual: Provider proof that recovery codes bind to correct account/request and cannot be reused across transactions.

### V6.6.3 — L2

> Verify that a code based out-of-band authentication mechanism is protected against brute force attacks by using rate limiting. Consider also using a code with at least 64 bits of entropy.

- Applicability: Conditional.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito owns any email recovery-code brute-force controls; app sign-in rate limits protect API exchanges but cannot prove direct provider endpoint defenses.
- Remaining verification/residual: P16 provider rate-limit documentation/probes and anti-lockout behavior; do not reuse API quota proof as provider proof.

### V6.8.1 — L2

> Verify that, if the application supports multiple identity providers (IdPs), the user's identity cannot be spoofed via another supported identity provider (eg. by using the same user identifier). The standard mitigation would be for the application to register and identify the user using a combination of the IdP ID (serving as a namespace) and the user's ID in the IdP.

- Applicability: Conditional.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: One Cognito pool/client per deployed environment; local provider is forbidden production. Person.cognitoSub mapping is the namespace within that fixed issuer; multiple hosted IdPs not configured.
- Remaining verification/residual: Inspect provider federation settings in P16; if multiple issuers are enabled, persist issuer+subject rather than email-only equivalence.

### V6.8.2 — L2

> Verify that the presence and integrity of digital signatures on authentication assertions (for example on JWTs or SAML assertions) are always validated, rejecting any assertions that are unsigned or have invalid signatures.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: CognitoJwtVerifier pins pool/client/tokenUse access; sessionTokens jose verification pins HS256 keys/issuer/audience. Raw provider bearer is refused by requireAuth.
- Remaining verification/residual: Inspect authorizer/auth tests for unsigned/tampered/wrong pool/client; P16 provider-signature evidence remains necessary.

### V6.8.3 — L2

> Verify that SAML assertions are uniquely processed and used only once within the validity period to prevent replay attacks.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No SAML assertion consumption or SAML federation code was found; current identity path is Cognito OAuth code/PKCE.
- Remaining verification/residual: Re-evaluate if SAML federation is enabled in provider settings; app source absence alone does not prove external pool configuration.

### V6.8.4 — L2

> Verify that, if an application uses a separate Identity Provider (IdP) and expects specific authentication strength, methods, or recentness for specific functions, the application verifies this using the information returned by the IdP. For example, if OIDC is used, this might be achieved by validating ID Token claims such as 'acr', 'amr', and 'auth_time' (if present). If the IdP does not provide this information, the application must have a documented fallback approach that assumes that the minimum strength authentication mechanism was used (for example, single-factor authentication using username and password).

- Applicability: Applicable.
- Disposition: Source repair recorded; assurance residual explicit.
- Current evidence/review: Verified Cognito auth_time becomes RefreshSession.authenticatedAt and survives rotation without iat substitution. Remote-device revoke/recovery reject absent/future/stale provenance under held locks; own-session sign-out remains possible. MFA replaces the restricted SID, clears envelopes/handoffs and rechecks current standing. credentialBoundary and identityRecovery assert these facts. acr/amr are not retained; enrollment checks are not independent per-event factor-strength proof.
- Remaining verification/residual: P16 verify real provider fresh-factor provenance and document minimum assurance fallback. Provider enrollment alone cannot establish strength of every authentication.

## V7 — Session Management

### V7.1.1 — L2

> Verify that the user's session inactivity timeout and absolute maximum session lifetime are documented, are appropriate in combination with other controls, and that the documentation includes justification for any deviations from NIST SP 800-63B re-authentication requirements.

- Applicability: Applicable.
- Disposition: Source repair recorded; policy residual explicit.
- Current evidence/review: Original absolute family deadlines survive every rotation: at most 30 days for ordinary members and stricter configured admin limits. Legacy NULL rows require oldest retained issuance plus session.create audit; missing roots force sign-in. credentialBoundary and identityLifecycle assert cutoff, malformed auth_time and lost-root refusal.
- Remaining verification/residual: P16 confirm provider expiry; owner assurance review of shared-phone/non-admin policy is not replaced by a blanket NIST claim.

### V7.1.2 — L2

> Verify that the documentation defines how many concurrent (parallel) sessions are allowed for one account as well as the intended behaviors and actions to be taken when the maximum number of active sessions is reached.

- Applicability: Applicable.
- Disposition: Documented policy/provider residual; no conformance claim.
- Current evidence/review: security-operations-runbook.md records unlimited parallel device families, ordinary bounded absolute lifetime without a separate idle deadline, stricter admin idle/absolute limits, and independent API/provider lifecycles. MFA promotion uses a new SID and device/administrator invalidation exists. No automatic provider-password-reset/back-channel invalidation or universal logout coordination is implemented.
- Remaining verification/residual: Owner must review these assurance choices and P16 verify actual reset/logout/revoke behavior. API refresh never creates new provider-authentication recency.

### V7.1.3 — L2

> Verify that all systems that create and manage user sessions as part of a federated identity management ecosystem (such as SSO systems) are documented along with controls to coordinate session lifetimes, termination, and any other conditions that require re-authentication.

- Applicability: Applicable.
- Disposition: Documented policy/provider residual; no conformance claim.
- Current evidence/review: security-operations-runbook.md records unlimited parallel device families, ordinary bounded absolute lifetime without a separate idle deadline, stricter admin idle/absolute limits, and independent API/provider lifecycles. MFA promotion uses a new SID and device/administrator invalidation exists. No automatic provider-password-reset/back-channel invalidation or universal logout coordination is implemented.
- Remaining verification/residual: Owner must review these assurance choices and P16 verify actual reset/logout/revoke behavior. API refresh never creates new provider-authentication recency.

### V7.2.1 — L1

> Verify that the application performs all session token verification using a trusted, backend service.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: requireAuth verifies API JWT then database session standing at trusted backend; sessionTokens pins issuer/audience/key/algorithm and raw provider token is exchanged only at sign-in.
- Remaining verification/residual: Candidate auth/security/identityLifecycle tests plus P16 auth missing/expired/refreshed route cases.

### V7.2.2 — L1

> Verify that the application uses either self-contained or reference tokens that are dynamically generated for session management, i.e. not using static API secrets and keys.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: issueAccessToken emits dynamic JWT with sid/sub/iat/exp; refresh tokens are stored only as SHA256 digests and generated per session.
- Remaining verification/residual: Inspect server/tests/integration/auth.test.ts stored-hash/token assertions; signing secret is backend key, not a static browser API token.

### V7.2.3 — L1

> Verify that if reference tokens are used to represent user sessions, they are unique and generated using a cryptographically secure pseudo-random number generator (CSPRNG) and possess at least 128 bits of entropy.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: generateRefreshToken=randomBytes32; refresh successors are HMAC-SHA256 of sessionId under secret key; handoff code randomness is a separate secret seam. Family UUID is an identifier, not the standalone credential.
- Remaining verification/residual: Inspect entropy/source and successor derivation tests; do not claim UUID itself has128bits or flag non-secret IDs as secret tokens.

### V7.2.4 — L1

> Verify that the application generates a new session token on user authentication, including re-authentication, and terminates the current session token.

- Applicability: Applicable.
- Disposition: Source repair recorded; distributed proof pending.
- Current evidence/review: Person-first issuance and authority writers share a consistent fence. MFA creates a fresh full SID and refresh credential, revoking/clearing the restricted one and handoffs atomically. Promotion/erase/recovery clear every provider envelope, preserve prior terminal reason/time and publish invalidation. credentialBoundary/privacyCompletion/identityLifecycle verify rollback and old access/refresh/handoff refusal.
- Remaining verification/residual: P16 distributed revocation timing and provider-backed enrollment remain required.

### V7.3.1 — L2

> Verify that there is an inactivity timeout such that re-authentication is enforced according to risk analysis and documented security decisions.

- Applicability: Applicable.
- Disposition: Documented policy/provider residual; no conformance claim.
- Current evidence/review: security-operations-runbook.md records unlimited parallel device families, ordinary bounded absolute lifetime without a separate idle deadline, stricter admin idle/absolute limits, and independent API/provider lifecycles. MFA promotion uses a new SID and device/administrator invalidation exists. No automatic provider-password-reset/back-channel invalidation or universal logout coordination is implemented.
- Remaining verification/residual: Owner must review these assurance choices and P16 verify actual reset/logout/revoke behavior. API refresh never creates new provider-authentication recency.

### V7.3.2 — L2

> Verify that there is an absolute maximum session lifetime such that re-authentication is enforced according to risk analysis and documented security decisions.

- Applicability: Applicable.
- Disposition: Source repair recorded; policy residual explicit.
- Current evidence/review: Original absolute family deadlines survive every rotation: at most 30 days for ordinary members and stricter configured admin limits. Legacy NULL rows require oldest retained issuance plus session.create audit; missing roots force sign-in. credentialBoundary and identityLifecycle assert cutoff, malformed auth_time and lost-root refusal.
- Remaining verification/residual: P16 confirm provider expiry; owner assurance review of shared-phone/non-admin policy is not replaced by a blanket NIST claim.

### V7.4.1 — L1

> Verify that when session termination is triggered (such as logout or expiration), the application disallows any further use of the session. For reference tokens or stateful sessions, this means invalidating the session data at the application backend. Applications using self-contained tokens will need a solution such as maintaining a list of terminated tokens, disallowing tokens produced before a per-user date and time or rotating a per-user signing key.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Logout revokes database sessions and invalidates session cache; verifyRevocationProof deliberately ignores JWT expiry only to revoke its own family. It does not grant data/refresh access.
- Remaining verification/residual: identityLifecycle tests inspect expired proof/tamper/other owner and old bearer refusal; P16 distributed under-two-second proof remains pending.

### V7.4.2 — L1

> Verify that the application terminates all active sessions when a user account is disabled or deleted (such as an employee leaving the company).

- Applicability: Applicable.
- Disposition: Source repair recorded; distributed proof pending.
- Current evidence/review: Person-first issuance and authority writers share a consistent fence. MFA creates a fresh full SID and refresh credential, revoking/clearing the restricted one and handoffs atomically. Promotion/erase/recovery clear every provider envelope, preserve prior terminal reason/time and publish invalidation. credentialBoundary/privacyCompletion/identityLifecycle verify rollback and old access/refresh/handoff refusal.
- Remaining verification/residual: P16 distributed revocation timing and provider-backed enrollment remain required.

### V7.4.3 — L2

> Verify that the application gives the option to terminate all other active sessions after a successful change or removal of any authentication factor (including password change via reset or recovery and, if present, an MFA settings update).

- Applicability: Applicable.
- Disposition: Documented policy/provider residual; no conformance claim.
- Current evidence/review: security-operations-runbook.md records unlimited parallel device families, ordinary bounded absolute lifetime without a separate idle deadline, stricter admin idle/absolute limits, and independent API/provider lifecycles. MFA promotion uses a new SID and device/administrator invalidation exists. No automatic provider-password-reset/back-channel invalidation or universal logout coordination is implemented.
- Remaining verification/residual: Owner must review these assurance choices and P16 verify actual reset/logout/revoke behavior. API refresh never creates new provider-authentication recency.

### V7.4.4 — L2

> Verify that all pages that require authentication have easy and visible access to logout functionality.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: client shared shell sign-out guard and client/src/shared/lib/session.ts clear local session before awaited server logout, with offline handling; authenticated navigation includes sign-out.
- Remaining verification/residual: Candidate client/tests/screens/sign-out-guard.test.tsx and identity browser journeys; P16 inspect visibility/keyboarding on each authenticated layout.

### V7.4.5 — L2

> Verify that application administrators are able to terminate active sessions for an individual user or for all users.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: People lifecycle signOutPersonHandler and revokeAllForVolunteer allow authorized admins to end a target person sessions; permissions/out-ranking constrain the action.
- Remaining verification/residual: Inspect global all-user emergency termination/runbook coverage; do not claim that a per-person function proves a global bulk operation.

### V7.5.1 — L2

> Verify that the application requires full re-authentication before allowing modifications to sensitive account attributes which may affect authentication such as email address, phone number, MFA configuration, or other information used in account recovery.

- Applicability: Conditional.
- Disposition: Source repair recorded; assurance residual explicit.
- Current evidence/review: Verified Cognito auth_time becomes RefreshSession.authenticatedAt and survives rotation without iat substitution. Remote-device revoke/recovery reject absent/future/stale provenance under held locks; own-session sign-out remains possible. MFA replaces the restricted SID, clears envelopes/handoffs and rechecks current standing. credentialBoundary and identityRecovery assert these facts. acr/amr are not retained; enrollment checks are not independent per-event factor-strength proof.
- Remaining verification/residual: P16 verify real provider fresh-factor provenance and document minimum assurance fallback. Provider enrollment alone cannot establish strength of every authentication.

### V7.5.2 — L2

> Verify that users are able to view and (having authenticated again with at least one factor) terminate any or all currently active sessions.

- Applicability: Applicable.
- Disposition: Source repair recorded; assurance residual explicit.
- Current evidence/review: Verified Cognito auth_time becomes RefreshSession.authenticatedAt and survives rotation without iat substitution. Remote-device revoke/recovery reject absent/future/stale provenance under held locks; own-session sign-out remains possible. MFA replaces the restricted SID, clears envelopes/handoffs and rechecks current standing. credentialBoundary and identityRecovery assert these facts. acr/amr are not retained; enrollment checks are not independent per-event factor-strength proof.
- Remaining verification/residual: P16 verify real provider fresh-factor provenance and document minimum assurance fallback. Provider enrollment alone cannot establish strength of every authentication.

### V7.6.1 — L2

> Verify that session lifetime and termination between Relying Parties (RPs) and Identity Providers (IdPs) behave as documented, requiring re-authentication as necessary such as when the maximum time between IdP authentication events is reached.

- Applicability: Applicable.
- Disposition: Documented policy/provider residual; no conformance claim.
- Current evidence/review: security-operations-runbook.md records unlimited parallel device families, ordinary bounded absolute lifetime without a separate idle deadline, stricter admin idle/absolute limits, and independent API/provider lifecycles. MFA promotion uses a new SID and device/administrator invalidation exists. No automatic provider-password-reset/back-channel invalidation or universal logout coordination is implemented.
- Remaining verification/residual: Owner must review these assurance choices and P16 verify actual reset/logout/revoke behavior. API refresh never creates new provider-authentication recency.

### V7.6.2 — L2

> Verify that creation of a session requires either the user's consent or an explicit action, preventing the creation of new application sessions without user interaction.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Login UI and explicit session renewal initiate normal flows; GET recover can mint/rotate through navigation and original state/verifier bindings. Cookie-blocked flow is deliberate ADR design.
- Remaining verification/residual: P16 demonstrate consent/user interaction, reload behavior and no malicious cross-origin forced session creation; source tests do not prove browser context.

## V8 — Authorization

### V8.1.1 — L1

> Verify that authorization documentation defines rules for restricting function-level and data-specific access based on consumer permissions and resource attributes.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: ADR-005 defines role grants/resource guardrails; packages/access-policies policies/schema and currentPermission encode function/resource checks.
- Remaining verification/residual: Reconcile documented rules with full server/tests/integration/route-role-matrix.json and P16.10; existing ADR alone is not final evidence.

### V8.1.2 — L2

> Verify that authorization documentation defines rules for field-level access restrictions (both read and write) based on consumer permissions and resource attributes. Note that these rules might depend on other attribute values of the relevant data object, such as state or status.

- Applicability: Applicable.
- Disposition: Source repair recorded; final campaign pending.
- Current evidence/review: currentPermission/captureStation recheck exact actions under Event/Person/member/assignment fences. Roster changes reload targets, enforce People.AssignRole/People.Update and refuse foreign-only adoption; credential invalidation/audit is atomic. Recovery proves provider ownership through durable immutable operation markers. Private-platform isolation and each schema-derived event ID × six roles compare foreign/missing targets. Reporting graphs serialize under Event and recheck current managers/cycles. credentialBoundary, rosterIdentityBoundary, cardAuthorityLocks, cardGroupIsolation, reportingLineBoundary, identityRecovery, isolation and platformIsolation cover these boundaries.
- Remaining verification/residual: Complete local/exact-SHA CI remains required; P16.10 proves deployed granular API cases and P16.3 external failures. No mock proves AWS delivery or commit rollback of an external provider action.

### V8.2.1 — L1

> Verify that the application ensures that function-level access is restricted to consumers with explicit permissions.

- Applicability: Applicable.
- Disposition: Source repair recorded; final campaign pending.
- Current evidence/review: currentPermission/captureStation recheck exact actions under Event/Person/member/assignment fences. Roster changes reload targets, enforce People.AssignRole/People.Update and refuse foreign-only adoption; credential invalidation/audit is atomic. Recovery proves provider ownership through durable immutable operation markers. Private-platform isolation and each schema-derived event ID × six roles compare foreign/missing targets. Reporting graphs serialize under Event and recheck current managers/cycles. credentialBoundary, rosterIdentityBoundary, cardAuthorityLocks, cardGroupIsolation, reportingLineBoundary, identityRecovery, isolation and platformIsolation cover these boundaries.
- Remaining verification/residual: Complete local/exact-SHA CI remains required; P16.10 proves deployed granular API cases and P16.3 external failures. No mock proves AWS delivery or commit rollback of an external provider action.

### V8.2.2 — L1

> Verify that the application ensures that data-specific access is restricted to consumers with explicit permissions to specific data items to mitigate insecure direct object reference (IDOR) and broken object level authorization (BOLA).

- Applicability: Applicable.
- Disposition: Source repair recorded; final campaign pending.
- Current evidence/review: currentPermission/captureStation recheck exact actions under Event/Person/member/assignment fences. Roster changes reload targets, enforce People.AssignRole/People.Update and refuse foreign-only adoption; credential invalidation/audit is atomic. Recovery proves provider ownership through durable immutable operation markers. Private-platform isolation and each schema-derived event ID × six roles compare foreign/missing targets. Reporting graphs serialize under Event and recheck current managers/cycles. credentialBoundary, rosterIdentityBoundary, cardAuthorityLocks, cardGroupIsolation, reportingLineBoundary, identityRecovery, isolation and platformIsolation cover these boundaries.
- Remaining verification/residual: Complete local/exact-SHA CI remains required; P16.10 proves deployed granular API cases and P16.3 external failures. No mock proves AWS delivery or commit rollback of an external provider action.

### V8.2.3 — L2

> Verify that the application ensures that field-level access is restricted to consumers with explicit permissions to specific fields to mitigate broken object property level authorization (BOPLA).

- Applicability: Applicable.
- Disposition: Source repair recorded; final campaign pending.
- Current evidence/review: currentPermission/captureStation recheck exact actions under Event/Person/member/assignment fences. Roster changes reload targets, enforce People.AssignRole/People.Update and refuse foreign-only adoption; credential invalidation/audit is atomic. Recovery proves provider ownership through durable immutable operation markers. Private-platform isolation and each schema-derived event ID × six roles compare foreign/missing targets. Reporting graphs serialize under Event and recheck current managers/cycles. credentialBoundary, rosterIdentityBoundary, cardAuthorityLocks, cardGroupIsolation, reportingLineBoundary, identityRecovery, isolation and platformIsolation cover these boundaries.
- Remaining verification/residual: Complete local/exact-SHA CI remains required; P16.10 proves deployed granular API cases and P16.3 external failures. No mock proves AWS delivery or commit rollback of an external provider action.

### V8.3.1 — L1

> Verify that the application enforces authorization rules at a trusted service layer and doesn't rely on controls that an untrusted consumer could manipulate, such as client-side JavaScript.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Server authorizer/currentPermission evaluates current database-derived permissions; client affordances consume /me/permissions but do not constitute authority.
- Remaining verification/residual: Candidate authorizationEnforcement/currentPermission tests; direct service invocation and execution-time scheduled checks remain important.

### V8.4.1 — L2

> Verify that multi-tenant applications use cross-tenant controls to ensure consumer operations will never affect tenants with which they do not have permissions to interact.

- Applicability: Applicable.
- Disposition: Source repair recorded; final campaign pending.
- Current evidence/review: currentPermission/captureStation recheck exact actions under Event/Person/member/assignment fences. Roster changes reload targets, enforce People.AssignRole/People.Update and refuse foreign-only adoption; credential invalidation/audit is atomic. Recovery proves provider ownership through durable immutable operation markers. Private-platform isolation and each schema-derived event ID × six roles compare foreign/missing targets. Reporting graphs serialize under Event and recheck current managers/cycles. credentialBoundary, rosterIdentityBoundary, cardAuthorityLocks, cardGroupIsolation, reportingLineBoundary, identityRecovery, isolation and platformIsolation cover these boundaries.
- Remaining verification/residual: Complete local/exact-SHA CI remains required; P16.10 proves deployed granular API cases and P16.3 external failures. No mock proves AWS delivery or commit rollback of an external provider action.

## V9 — Self-contained Tokens

### V9.1.1 — L1

> Verify that self-contained tokens are validated using their digital signature or MAC to protect against tampering before accepting the token's contents.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: jose jwtVerify/compactVerify and CognitoJwtVerifier validate signatures before payload acceptance; revocation proof verification is restricted to logout capability.
- Remaining verification/residual: Auth/security tests should inspect tampered/unsigned/malformed inputs and expired-proof-only revocation.

### V9.1.2 — L1

> Verify that only algorithms on an allowlist can be used to create and verify self-contained tokens, for a given context. The allowlist must include the permitted algorithms, ideally only either symmetric or asymmetric algorithms, and must not include the 'None' algorithm. If both symmetric and asymmetric must be supported, additional controls will be needed to prevent key confusion.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: sessionTokens restricts HS256; verificationKeys rejects other alg/unknown kid and selects explicit ring. Cognito verifier pins its supported signed provider scheme.
- Remaining verification/residual: Inspect algorithm-none/key-confusion regressions before final acceptance; do not trust user-provided algorithm/source.

### V9.1.3 — L1

> Verify that key material that is used to validate self-contained tokens is from trusted pre-configured sources for the token issuer, preventing attackers from specifying untrusted sources and keys. For JWTs and other JWS structures, headers such as 'jku', 'x5u', and 'jwk' must be validated against an allowlist of trusted sources.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: API keys come only from sessionSigningKeys; provider verifier is configured by pool/client, with no client jku/jwk/x5u key loading.
- Remaining verification/residual: Inspect malformed/malicious header tests and deployed key injection; source configuration is not key rotation proof.

### V9.2.1 — L1

> Verify that, if a validity time span is present in the token data, the token and its content are accepted only if the verification time is within this validity time span. For example, for JWTs, the claims 'nbf' and 'exp' must be verified.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: jwtVerify checks signed validity; liveSession additionally checks database expiry/revocation/absolute expiry. compactVerify ignores expiry only in explicit revocation-only proof.
- Remaining verification/residual: identityLifecycle expired-proof tests distinguish no data/renewal access; add nbf boundary if not already covered.

### V9.2.2 — L2

> Verify that the service receiving a token validates the token to be the correct type and is meant for the intended purpose before accepting the token's contents. For example, only access tokens can be accepted for authorization decisions and only ID Tokens can be used for proving user authentication.

- Applicability: Applicable.
- Disposition: Explicit architecture residual / conditional nonapplicability.
- Current evidence/review: This first-party app exchanges a verified fixed-pool/client Cognito access token for its own identity/SID bearer. It does not consume ID Tokens. API token purpose/issuer/audience and current DB standing are enforced, but using access tokens as authentication assertions is a strict ASVS architecture deviation. No ID-token nonce validation is claimed.
- Remaining verification/residual: Owner security review must record this deviation separately; if ID Tokens are introduced, require signature/audience/nonce/lifetime/replay validation.

### V9.2.3 — L2

> Verify that the service only accepts tokens which are intended for use with that service (audience). For JWTs, this can be achieved by validating the 'aud' claim against an allowlist defined in the service.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: API jwtVerify pins audience=spoh2027-api; Cognito verifier pins clientId/tokenUse access in its fixed pool.
- Remaining verification/residual: Inspect wrong-audience/client/pool regressions and distinguish client_id in Cognito access token from ID-token aud.

### V9.2.4 — L2

> Verify that, if a token issuer uses the same private key for issuing tokens to different audiences, the issued tokens contain an audience restriction that uniquely identifies the intended audiences. This will prevent a token from being reused with an unintended audience. If the audience identifier is dynamically provisioned, the token issuer must validate these audiences in order to make sure that they do not result in audience impersonation.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: API emits fixed audience for its own sole service; tokens contain no arbitrary client-specified audience. Provider client has fixed callbacks.
- Remaining verification/residual: If keys are reused for additional audiences, add explicit unique restrictions and key-usage inventory; no such additional service found.

## V10 — OAuth and OIDC

### V10.1.1 — L2

> Verify that tokens are only sent to components that strictly need them. For example, when using a backend-for-frontend pattern for browser-based JavaScript applications, access and refresh tokens shall only be accessible for the backend.

- Applicability: Applicable.
- Disposition: Source repair recorded; operating proof pending.
- Current evidence/review: safeHttpSerializers, Pino completion hooks, hostedSignIn and Prisma diagnostic handlers omit raw URLs/query/private path IDs/headers/Location/provider error strings/SQL. securityLogOutput asserts final real JSON sink sentinels and safe categories. Protocol OAuth/handoff query credentials are bounded one-use/no-store/no-referrer exceptions; API bearer remains browser-memory only.
- Remaining verification/residual: P16 inspect actual transports/referrers/provider diagnostics and external failures; safe sink evidence is not an assertion of a pure BFF architecture.

### V10.1.2 — L2

> Verify that the client only accepts values from the authorization server (such as the authorization code or ID Token) if these values result from an authorization flow that was initiated by the same user agent session and transaction. This requires that client-generated secrets, such as the proof key for code exchange (PKCE) 'code_verifier', 'state' or OIDC 'nonce', are not guessable, are specific to the transaction, and are securely bound to both the client and the user agent session in which the transaction was started.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: beginLogin creates randomBytes32 state/verifier; callback checks state cookie and redeems code with S256 verifier; handoff binds code to challenge and single use.
- Remaining verification/residual: hostedSignIn/sessionHandoff tests are candidates; P16 actual provider/user-agent binding and blocked-cookie behavior pending.

### V10.2.1 — L2

> Verify that, if the code flow is used, the OAuth client has protection against browser-based request forgery attacks, commonly known as cross-site request forgery (CSRF), which trigger token requests, either by using proof key for code exchange (PKCE) functionality or checking the 'state' parameter that was sent in the authorization request.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: completeCallback requires matching expected state and verifier; beginLogin sends PKCE S256. Missing/wrong state routes to controlled sign-in error.
- Remaining verification/residual: Inspect hostedSignIn callback tamper/replay assertions; H3 query redaction is separate from CSRF correctness.

### V10.2.2 — L2

> Verify that, if the OAuth client can interact with more than one authorization server, it has a defense against mix-up attacks. For example, it could require that the authorization server return the 'iss' parameter value and validate it in the authorization response and the token response.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: One configured Cognito authorization server per deployed environment; no client-selected multiple-AS/OAuth discovery flow found.
- Remaining verification/residual: Re-evaluate if multiple AS/federated clients are supported; pool federation configuration still needs P16 inventory.

### V10.3.1 — L2

> Verify that the resource server only accepts access tokens that are intended for use with that service (audience). The audience may be included in a structured access token (such as the 'aud' claim in JWT), or it can be checked using the token introspection endpoint.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Operational resource server accepts API audience only and refuses raw provider bearers; Cognito access tokens are accepted only for configured session exchange.
- Remaining verification/residual: Candidate verify-cognito live probe and auth/security tests; provider app-client proof remains P16.

### V10.3.2 — L2

> Verify that the resource server enforces authorization decisions based on claims from the access token that define delegated authorization. If claims such as 'sub', 'scope', and 'authorization_details' are present, they must be part of the decision.

- Applicability: Conditional.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: API tokens intentionally carry identity/session only; delegated scopes are replaced by current membership/Cedar permissions, and Cognito groups are ignored by ADR-005/006.
- Remaining verification/residual: Record this first-party authorization architecture; if external OAuth delegated resources appear, enforce scope/authorization_details rather than reusing this exception.

### V10.3.3 — L2

> Verify that if an access control decision requires identifying a unique user from an access token (JWT or related token introspection response), the resource server identifies the user from claims that cannot be reassigned to other users. Typically, it means using a combination of 'iss' and 'sub' claims.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Cognito verifier pins issuer via pool, uses immutable sub and configured client; API sub resolves Person.cognitoSub. H7/recovery require proven provider subject ownership.
- Remaining verification/residual: Assigned H7 provider metadata/provenance tests; email alone must not establish equivalent issuer identity.

### V10.3.4 — L2

> Verify that, if the resource server requires specific authentication strength, methods, or recentness, it verifies that the presented access token satisfies these constraints. For example, if present, using the OIDC 'acr', 'amr' and 'auth_time' claims respectively.

- Applicability: Applicable.
- Disposition: Source repair recorded; assurance residual explicit.
- Current evidence/review: Verified Cognito auth_time becomes RefreshSession.authenticatedAt and survives rotation without iat substitution. Remote-device revoke/recovery reject absent/future/stale provenance under held locks; own-session sign-out remains possible. MFA replaces the restricted SID, clears envelopes/handoffs and rechecks current standing. credentialBoundary and identityRecovery assert these facts. acr/amr are not retained; enrollment checks are not independent per-event factor-strength proof.
- Remaining verification/residual: P16 verify real provider fresh-factor provenance and document minimum assurance fallback. Provider enrollment alone cannot establish strength of every authentication.

### V10.4.1 — L1

> Verify that the authorization server validates redirect URIs based on a client-specific allowlist of pre-registered URIs using exact string comparison.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: infra/cdk/src/identity.ts assigns exact per-stage callback/logout URLs; provider owns redirect validation. recoveryTarget independently allowlists its return origin.
- Remaining verification/residual: P16 provider refuses near-match/wildcard/foreign callback; source properties cannot prove provider exact-match behavior.

### V10.4.2 — L1

> Verify that, if the authorization server returns the authorization code in the authorization response, it can be used only once for a token request. For the second valid request with an authorization code that has already been used to issue an access token, the authorization server must reject a token request and revoke any issued tokens related to the authorization code.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito authorization server owns authorization-code single use/replay revocation; application exchanges code once and validates state/PKCE.
- Remaining verification/residual: P16 synthetic code replay and provider documentation evidence; local fetch mocks are not AS replay proof.

### V10.4.3 — L1

> Verify that the authorization code is short-lived. The maximum lifetime can be up to 10 minutes for L1 and L2 applications and up to 1 minute for L3 applications.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito owns authorization-code lifetime; app OAuth state/verifier cookies expire5minutes, which does not establish provider code expiry.
- Remaining verification/residual: Record actual provider maximum <=10minutes and test expired synthetic code in P16.

### V10.4.4 — L1

> Verify that for a given client, the authorization server only allows the usage of grants that this client needs to use. Note that the grants 'token' (Implicit flow) and 'password' (Resource Owner Password Credentials flow) must no longer be used.

- Applicability: Applicable.
- Disposition: Source repair recorded; provider proof pending.
- Current evidence/review: identity.ts explicitly emits empty ExplicitAuthFlows, code-only OAuth, ten-second provider refresh-rotation grace, immutable unreadable/unwritable creation marker and only openid/email/cognito.admin scopes. beginLogin requests the enrollment scope. verify-cognito checks exact flow/rotation/marker/scope definitions. identityHardening and verifyCognito assertions exercise the actual definitions; deployed client is not observed.
- Remaining verification/residual: P16 run configuration verification and synthetic provider replay/enrollment/invite tests; local templates are not provider behavior.

### V10.4.5 — L1

> Verify that the authorization server mitigates refresh token replay attacks for public clients, preferably using sender-constrained refresh tokens, i.e., Demonstrating Proof of Possession (DPoP) or Certificate-Bound Access Tokens using mutual TLS (mTLS). For L1 and L2 applications, refresh token rotation may be used. If refresh token rotation is used, the authorization server must invalidate the refresh token after usage, and revoke all refresh tokens for that authorization if an already used and invalidated refresh token is provided.

- Applicability: Applicable.
- Disposition: Source repair recorded; provider proof pending.
- Current evidence/review: identity.ts explicitly emits empty ExplicitAuthFlows, code-only OAuth, ten-second provider refresh-rotation grace, immutable unreadable/unwritable creation marker and only openid/email/cognito.admin scopes. beginLogin requests the enrollment scope. verify-cognito checks exact flow/rotation/marker/scope definitions. identityHardening and verifyCognito assertions exercise the actual definitions; deployed client is not observed.
- Remaining verification/residual: P16 run configuration verification and synthetic provider replay/enrollment/invite tests; local templates are not provider behavior.

### V10.4.6 — L2

> Verify that, if the code grant is used, the authorization server mitigates authorization code interception attacks by requiring proof key for code exchange (PKCE). For authorization requests, the authorization server must require a valid 'code_challenge' value and must not accept a 'code_challenge_method' value of 'plain'. For a token request, it must require validation of the 'code_verifier' parameter.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: App always sends S256 code_challenge/verifier; Cognito authorization server owns rejection of absent/plain/invalid PKCE.
- Remaining verification/residual: P16 confirm provider requires S256 for this client and refuses omitted challenge/incorrect verifier; client use alone does not prove AS enforcement.

### V10.4.7 — L2

> Verify that if the authorization server supports unauthenticated dynamic client registration, it mitigates the risk of malicious client applications. It must validate client metadata such as any registered URIs, ensure the user's consent, and warn the user before processing an authorization request with an untrusted client application.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No dynamic client registration endpoint or permission is implemented; infra/cdk/src/identity.ts creates one registered public client per environment.
- Remaining verification/residual: P16 confirm provider client inventory; revisit if unauthenticated dynamic registration is enabled.

### V10.4.8 — L2

> Verify that refresh tokens have an absolute expiration, including if sliding refresh token expiration is applied.

- Applicability: Applicable.
- Disposition: Source repair recorded; policy residual explicit.
- Current evidence/review: Original absolute family deadlines survive every rotation: at most 30 days for ordinary members and stricter configured admin limits. Legacy NULL rows require oldest retained issuance plus session.create audit; missing roots force sign-in. credentialBoundary and identityLifecycle assert cutoff, malformed auth_time and lost-root refusal.
- Remaining verification/residual: P16 confirm provider expiry; owner assurance review of shared-phone/non-admin policy is not replaced by a blanket NIST claim.

### V10.4.9 — L2

> Verify that refresh tokens and reference access tokens can be revoked by an authorized user using the authorization server user interface, to mitigate the risk of malicious clients or stolen tokens.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: API device revocation exists; Cognito owns any authorization-server revocation UI and grant lifecycle. No proof of a user-facing provider token-revoke interface.
- Remaining verification/residual: Document app versus provider revoke guarantees; P16 synthetic device/provider-session termination evidence.

### V10.4.10 — L2

> Verify that confidential client is authenticated for client-to-authorized server backchannel requests such as token requests, pushed authorization requests (PAR), and token revocation requests.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: infra/cdk/src/identity.ts generateSecret=false defines a public app client using PKCE; no confidential OAuth client/PAR flow is implemented.
- Remaining verification/residual: Do not require a secret for the public client; re-evaluate when a confidential client is added.

### V10.4.11 — L2

> Verify that the authorization server configuration only assigns the required scopes to the OAuth client.

- Applicability: Applicable.
- Disposition: Source repair recorded; provider proof pending.
- Current evidence/review: identity.ts explicitly emits empty ExplicitAuthFlows, code-only OAuth, ten-second provider refresh-rotation grace, immutable unreadable/unwritable creation marker and only openid/email/cognito.admin scopes. beginLogin requests the enrollment scope. verify-cognito checks exact flow/rotation/marker/scope definitions. identityHardening and verifyCognito assertions exercise the actual definitions; deployed client is not observed.
- Remaining verification/residual: P16 run configuration verification and synthetic provider replay/enrollment/invite tests; local templates are not provider behavior.

### V10.5.1 — L2

> Verify that the client (as the relying party) mitigates ID Token replay attacks. For example, by ensuring that the 'nonce' claim in the ID Token matches the 'nonce' value sent in the authentication request to the OpenID Provider (in OAuth2 refereed to as the authorization request sent to the authorization server).

- Applicability: Not applicable candidate.
- Disposition: Explicit architecture residual / conditional nonapplicability.
- Current evidence/review: This first-party app exchanges a verified fixed-pool/client Cognito access token for its own identity/SID bearer. It does not consume ID Tokens. API token purpose/issuer/audience and current DB standing are enforced, but using access tokens as authentication assertions is a strict ASVS architecture deviation. No ID-token nonce validation is claimed.
- Remaining verification/residual: Owner security review must record this deviation separately; if ID Tokens are introduced, require signature/audience/nonce/lifetime/replay validation.

### V10.5.2 — L2

> Verify that the client uniquely identifies the user from ID Token claims, usually the 'sub' claim, which cannot be reassigned to other users (for the scope of an identity provider).

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No ID Token claim consumption is implemented; user identity currently derives from fixed-pool verified access-token sub.
- Remaining verification/residual: Provider sub uniqueness and recovery rebinding need separate H7 evidence; revisit on ID Token consumption.

### V10.5.3 — L2

> Verify that the client rejects attempts by a malicious authorization server to impersonate another authorization server through authorization server metadata. The client must reject authorization server metadata if the issuer URL in the authorization server metadata does not exactly match the pre-configured issuer URL expected by the client.

- Applicability: Conditional.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: client/src/shared/lib/clientConfigValidation.ts and server/src/config/schemas/auth.ts bound production HTTPS canonical origins; hostedSignIn.ts uses redirect:error and a ten-second AbortSignal timeout. config and securityLogOutput unit assertions are local evidence; no provider endpoint was contacted.
- Remaining verification/residual: P16.10 must verify real HTTPS/origin/redirect refusals and provider issuer configuration.

### V10.5.4 — L2

> Verify that the client validates that the ID Token is intended to be used for that client (audience) by checking that the 'aud' claim from the token is equal to the 'client_id' value for the client.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: Current code discards provider id_token and does not use ID Token for authentication; Cognito access-token clientId validation is separate.
- Remaining verification/residual: If ID Tokens are accepted, explicitly validate aud=client_id and nonce/signature/lifetime.

### V10.5.5 — L2

> Verify that, when using OIDC back-channel logout, the relying party mitigates denial of service through forced logout and cross-JWT confusion in the logout flow. The client must verify that the logout token is correctly typed with a value of 'logout+jwt', contains the 'event' claim with the correct member name, and does not contain a 'nonce' claim. Note that it is also recommended to have a short expiration (e.g., 2 minutes).

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No OIDC back-channel logout endpoint/token parsing exists; API logout uses signed API-session revocation proof and DB standing.
- Remaining verification/residual: Do not treat expiry-ignored own-session logout proof as OIDC logout+jwt; re-evaluate if back-channel logout is added.

### V10.6.1 — L2

> Verify that the OpenID Provider only allows values 'code', 'ciba', 'id_token', or 'id_token code' for response mode. Note that 'code' is preferred over 'id_token code' (the OIDC Hybrid flow), and 'token' (any Implicit flow) must not be used.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: CDK AllowedOAuthFlows code only and beginLogin response_type code; provider response modes remain delegated configuration.
- Remaining verification/residual: P16 confirm implicit/hybrid token responses are unavailable; exact client configuration proof required.

### V10.6.2 — L2

> Verify that the OpenID Provider mitigates denial of service through forced logout. By obtaining explicit confirmation from the end-user or, if present, validating parameters in the logout request (initiated by the relying party), such as the 'id_token_hint'.

- Applicability: Conditional.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: App primarily terminates API sessions; provider managed-login logout confirmation semantics are not established in current source or mocks.
- Remaining verification/residual: P16 inspect provider logout request/confirmation and prevent forced logout; document whether provider logout is invoked by app.

### V10.7.1 — L2

> Verify that the authorization server ensures that the user consents to each authorization request. If the identity of the client cannot be assured, the authorization server must always explicitly prompt the user for consent.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: First-party Cognito client is fixed by CDK; hosted managed-login owns authorization consent and app login UI represents user intent. No consent evidence recorded.
- Remaining verification/residual: Provider documentation and P16 actual flow must establish required consent, including if untrusted clients could be registered.

### V10.7.2 — L2

> Verify that when the authorization server prompts for user consent, it presents sufficient and clear information about what is being consented to. When applicable, this should include the nature of the requested authorizations (typically based on scope, resource server, Rich Authorization Requests (RAR) authorization details), the identity of the authorized application, and the lifetime of these authorizations.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Managed-login rendering/branding is provider-owned; app does not implement its own authorization-consent screen.
- Remaining verification/residual: P16 inspect client identity/scopes/lifetime disclosure; do not count branding or login alone as full consent information.

### V10.7.3 — L2

> Verify that the user can review, modify, and revoke consents which the user has granted through the authorization server.

- Applicability: Conditional.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: No external third-party OAuth grants are offered by the app; provider controls any consent/grant management for the registered first-party client.
- Remaining verification/residual: Document applicable grant-review/revoke capability or precise first-party limitation; API device revoke is not automatically provider consent revoke.

## V11 — Cryptography

### V11.1.1 — L2

> Verify that there is a documented policy for management of cryptographic keys and a cryptographic key lifecycle that follows a key management standard such as NIST SP 800-57. This should include ensuring that keys are not overshared (for example, with more than two entities for shared secrets and more than one entity for private keys).

- Applicability: Applicable.
- Disposition: Policy/source inventory recorded; rehearsal pending.
- Current evidence/review: security-operations-runbook.md inventories algorithms/purposes/owners/key locations, explicit two-version lifecycle, compromise invalidation, pending-envelope retirement and separate attendance/VAPID handling. CDK README and release validator define preload/flip/retire and operator DB rotation/rollback. No automated DB rotation or bulk envelope re-encryption service is asserted.
- Remaining verification/residual: P16 rehearses actual key/DB connection rollover, rollback and denied task rights. Preserve lean topology and existing owner production/cost gates.

### V11.1.2 — L2

> Verify that a cryptographic inventory is performed, maintained, regularly updated, and includes all cryptographic keys, algorithms, and certificates used by the application. It must also document where keys can and cannot be used in the system, and the types of data that can and cannot be protected using the keys.

- Applicability: Applicable.
- Disposition: Policy/source inventory recorded; rehearsal pending.
- Current evidence/review: security-operations-runbook.md inventories algorithms/purposes/owners/key locations, explicit two-version lifecycle, compromise invalidation, pending-envelope retirement and separate attendance/VAPID handling. CDK README and release validator define preload/flip/retire and operator DB rotation/rollback. No automated DB rotation or bulk envelope re-encryption service is asserted.
- Remaining verification/residual: P16 rehearses actual key/DB connection rollover, rollback and denied task rights. Preserve lean topology and existing owner production/cost gates.

### V11.2.1 — L2

> Verify that industry-validated implementations (including libraries and hardware-accelerated implementations) are used for cryptographic operations.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Node crypto/OpenSSL, jose and aws-jwt-verify perform application crypto; Sharp/image code does not implement custom cryptographic primitives.
- Remaining verification/residual: Dependency/SBOM review and actual provider implementation evidence remain needed; source library names are not certification claims.

### V11.2.2 — L2

> Verify that the application is designed with crypto agility such that random number, authenticated encryption, MAC, or hashing algorithms, key lengths, rounds, ciphers and modes can be reconfigured, upgraded, or swapped at any time, to protect against cryptographic breaks. Similarly, it must also be possible to replace keys and passwords and re-encrypt data. This will allow for seamless upgrades to post-quantum cryptography (PQC), once high-assurance implementations of approved PQC schemes or standards are widely available.

- Applicability: Applicable.
- Disposition: Policy/source inventory recorded; rehearsal pending.
- Current evidence/review: security-operations-runbook.md inventories algorithms/purposes/owners/key locations, explicit two-version lifecycle, compromise invalidation, pending-envelope retirement and separate attendance/VAPID handling. CDK README and release validator define preload/flip/retire and operator DB rotation/rollback. No automated DB rotation or bulk envelope re-encryption service is asserted.
- Remaining verification/residual: P16 rehearses actual key/DB connection rollover, rollback and denied task rights. Preserve lean topology and existing owner production/cost gates.

### V11.2.3 — L2

> Verify that all cryptographic primitives utilize a minimum of 128-bits of security based on the algorithm, key size, and configuration. For example, a 256-bit ECC key provides roughly 128 bits of security where RSA requires a 3072-bit key to achieve 128 bits of security.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: API uses HS256/AES256GCM/SHA256 with SecretsManager-generated64character keys; provider RS signing and TLS key/cipher security require actual provider/certificate inventory.
- Remaining verification/residual: Do not assume every RSA/certificate key meets128bit security; collect configured size/algorithm and strength evidence in P16.

### V11.3.1 — L1

> Verify that insecure block modes (e.g., ECB) and weak padding schemes (e.g., PKCS#1 v1.5) are not used.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: server/src/platform/identity/protectedTokens.ts uses aes-256-gcm with random12byte IV/auth tag; no ECB or PKCS#1v1.5 encryption was found in app crypto source.
- Remaining verification/residual: Inspect crypto inventory/dependencies/provider modes; test tampered/short envelopes and no plaintext fallback.

### V11.3.2 — L1

> Verify that only approved ciphers and modes such as AES with GCM are used.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Application provider-token encryption uses AES256GCM through Node crypto; bucket/database at-rest encryption is managed by AWS configuration.
- Remaining verification/residual: Inspect generated storage settings/provider encryption; code does not prove every external cipher.

### V11.3.3 — L2

> Verify that encrypted data is protected against unauthorized modification preferably by using an approved authenticated encryption method or by combining an approved encryption method with an approved MAC algorithm.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Provider envelope stores IV+GCM tag+ciphertext; decrypt final checks tag before yielding text. Crypto signatures/MAC protect own JWT/refresh successors.
- Remaining verification/residual: Candidate session/identity tests must cover tag/data corruption and unknown key; add explicit envelope tests if absent.

### V11.4.1 — L1

> Verify that only approved hash functions are used for general cryptographic use cases, including digital signatures, HMAC, KDF, and random bit generation. Disallowed hash functions, such as MD5, must not be used for any cryptographic purpose.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Reviewed crypto source uses SHA256/HMAC-SHA256; focused crypto search found no MD5/SHA1 for application cryptographic purpose. ETag is copy identity, not a collision-resistant application signature.
- Remaining verification/residual: Keep MD5-like storage ETag semantics separate; inspect third-party/provider cryptographic inventory.

### V11.4.2 — L2

> Verify that passwords are stored using an approved, computationally intensive, key derivation function (also known as a "password hashing function"), with parameter settings configured based on current guidance. The settings should balance security and performance to make brute-force attacks sufficiently challenging for the required level of security.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Cognito owns password storage; API stores SHA256 digests of256bit random refresh/handoff secrets, which are not user passwords.
- Remaining verification/residual: Obtain provider password-KDF policy/assurance evidence; do not demand password hashing for sufficiently high-entropy reference tokens.

### V11.4.3 — L2

> Verify that hash functions used in digital signatures, as part of data authentication or data integrity are collision resistant and have appropriate bit-lengths. If collision resistance is required, the output length must be at least 256 bits. If only resistance to second pre-image attacks is required, the output length must be at least 128 bits.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Refresh and branding integrity use SHA256; API/attendance/successor MACs use SHA256; HMAC output is256bits. Truncated key ID identifies a key and does not authenticate data.
- Remaining verification/residual: Review each integrity claim and key use; versioned conditional S3 copy ETag is not equivalent to a cryptographic content hash.

### V11.4.4 — L2

> Verify that the application uses approved key derivation functions with key stretching parameters when deriving secret keys from passwords. The parameters in use must balance security and performance to prevent brute-force attacks from compromising the resulting cryptographic key.

- Applicability: Conditional.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Application derives envelope key with SHA256 from high-entropy generated signing secret, not from a human password; no password-to-app-key KDF feature exists. Cognito password hashing is delegated.
- Remaining verification/residual: Document entropy/derivation and distinct key purposes; if human-entered encryption passwords are introduced, apply approved stretched KDF.

### V11.5.1 — L2

> Verify that all random numbers and strings which are intended to be non-guessable must be generated using a cryptographically secure pseudo-random number generator (CSPRNG) and have at least 128 bits of entropy. Note that UUIDs do not respect this condition.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: randomBytes32 creates refresh, OAuth state/verifier and handoff IDs; random12byte IV serves GCM. UUID family/record/claim IDs are non-secret identity, not standalone authentication credentials.
- Remaining verification/residual: Inspect all secret-bearing random generation, including provider/VAPID generation; do not claim UUID alone has128bits.

### V11.6.1 — L2

> Verify that only approved cryptographic algorithms and modes of operation are used for key generation and seeding, and digital signature generation and verification. Key generation algorithms must not generate insecure keys vulnerable to known attacks, for example, RSA keys which are vulnerable to Fermat factorization.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Node crypto generates randomness/MAC keys; Secrets Manager generates64character app secrets; provider generates JWT signing and TLS certificate keys.
- Remaining verification/residual: Collect provider algorithm/key-generation evidence and inventory; no unsupported approval/certification claim from dependency use.

## V12 — Secure Communication

### V12.1.1 — L1

> Verify that only the latest recommended versions of the TLS protocol are enabled, such as TLS 1.2 and TLS 1.3. The latest version of the TLS protocol must be the preferred option.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: External ingress uses Caddy HTTPS/API Gateway/Firebase/provider endpoints; application has no complete TLS-version enforcement/probe record.
- Remaining verification/residual: P16 authorized handshake evidence must reject obsolete TLS and prefer current supported protocols for every external endpoint.

### V12.1.2 — L2

> Verify that only recommended cipher suites are enabled, with the strongest cipher suites set as preferred. L3 applications must only support cipher suites which provide forward secrecy.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Caddy/provider services own external TLS cipher negotiation; source does not record actual configured cipher suites.
- Remaining verification/residual: P16 cipher/key-exchange inventory and recommendations evidence; do not infer cipher strength from HTTPS URL alone.

### V12.1.3 — L2

> Verify that the application validates that mTLS client certificates are trusted before using the certificate identity for authentication or authorization.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No mTLS client-certificate authentication feature was found; application uses sessions/Cognito/IAM roles, not untrusted TLS certificate identity.
- Remaining verification/residual: Re-evaluate if client certificates become auth/authorization input.

### V12.2.1 — L1

> Verify that TLS is used for all connectivity between a client and external facing, HTTP-based services, and does not fall back to insecure or unencrypted communications.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: client/src/shared/lib/clientConfigValidation.ts and server/src/config/schemas/auth.ts bound production HTTPS canonical origins; hostedSignIn.ts uses redirect:error and a ten-second AbortSignal timeout. config and securityLogOutput unit assertions are local evidence; no provider endpoint was contacted.
- Remaining verification/residual: P16.10 must verify real HTTPS/origin/redirect refusals and provider issuer configuration.

### V12.2.2 — L1

> Verify that external facing services use publicly trusted TLS certificates.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Caddyfile requests Let’s Encrypt certificates; AWS/Firebase/Cognito endpoints are provider-managed. No current deployed certificate chain was read.
- Remaining verification/residual: P16 public trust/expiry/hostname checks on every deployed origin; certificate generation intent is not deployment proof.

### V12.3.1 — L2

> Verify that an encrypted protocol such as TLS is used for all inbound and outbound connections to and from the application, including monitoring systems, management tools, remote access and SSH, middleware, databases, mainframes, partner systems, or external APIs. The server must not fall back to insecure or unencrypted protocols.

- Applicability: Applicable.
- Disposition: Explicit architecture residual; owner review pending.
- Current evidence/review: RDS force_ssl=1 and DATABASE_URL sslmode=require exist; AWS SDK/Caddy upstream use TLS. API Gateway VPCLink to Express on4000 remains HTTP.
- Remaining verification/residual: Record internal plaintext residual/decision with compensating SG restrictions; approved ADR topology is not automatic full transport conformance.

### V12.3.2 — L2

> Verify that TLS clients validate certificates received before communicating with a TLS server.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Node fetch/AWS SDK validate TLS by default; Docker vendors RDS CA bundle and NODE_EXTRA_CA_CERTS. No rejectUnauthorized:false was found in reviewed DB/config sources.
- Remaining verification/residual: P16 invalid/untrusted certificate refusal and actual pg connection verification; no downgrade on certificate failure.

### V12.3.3 — L2

> Verify that TLS or another appropriate transport encryption mechanism used for all connectivity between internal, HTTP-based services within the application, and does not fall back to insecure or unencrypted communications.

- Applicability: Applicable.
- Disposition: Explicit architecture residual; owner review pending.
- Current evidence/review: infra/cdk/src/appService.ts HttpServiceDiscoveryIntegration has no TLS config; Express listens HTTP on4000; link/app SG permit only exact4000 path. ADR-008 approves topology without explicit TLS-exception rationale.
- Remaining verification/residual: Record source deviation and compensating network controls, or design transport encryption behind existing cost gate; do not mark isolated HTTP as encrypted.

### V12.3.4 — L2

> Verify that TLS connections between internal services use trusted certificates. Where internally generated or self-signed certificates are used, the consuming service must be configured to only trust specific internal CAs and specific self-signed certificates.

- Applicability: Conditional.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Internal DB TLS trusts published RDS CA via container bundle; no self-signed internal HTTP TLS service is configured because VPCLink HTTP is plaintext.
- Remaining verification/residual: P16 verify actual RDS trust, expiry/bundle update and no arbitrary self-signed trust; internal HTTP absence of TLS is a separate gap.

## V13 — Configuration

### V13.1.1 — L2

> Verify that all communication needs for the application are documented. This must include external services which the application relies upon and cases where an end user might be able to provide an external location to which the application will then connect.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: ADR-008 topology and ADR-006 identity identify RDS, AVP, Cognito, S3, CloudWatch, frontend/API edges; Web Push known-host contract is a user-submitted external location.
- Remaining verification/residual: Finalize communication/egress inventory, including monitoring and operational tooling; preserve provider HTTPS-only configuration.

### V13.2.1 — L2

> Verify that communications between backend application components that don't support the application's standard user session mechanism, including APIs, middleware, and data layers, are authenticated. Authentication must use individual service accounts, short-term tokens, or certificate-based authentication and not unchanging credentials such as passwords, API keys, or shared accounts with privileged access.

- Applicability: Applicable.
- Disposition: Policy/source inventory recorded; rehearsal pending.
- Current evidence/review: security-operations-runbook.md inventories algorithms/purposes/owners/key locations, explicit two-version lifecycle, compromise invalidation, pending-envelope retirement and separate attendance/VAPID handling. CDK README and release validator define preload/flip/retire and operator DB rotation/rollback. No automated DB rotation or bulk envelope re-encryption service is asserted.
- Remaining verification/residual: P16 rehearses actual key/DB connection rollover, rollback and denied task rights. Preserve lean topology and existing owner production/cost gates.

### V13.2.2 — L2

> Verify that communications between backend application components, including local or operating system services, APIs, middleware, and data layers, are performed with accounts assigned the least necessary privileges.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: appSecrets separates DB roles; migrations run separate task; scoped task permissions for AVP/storage/audit/identity exist; app audit shipping IAM grants append only.
- Remaining verification/residual: Inspect complete IAM/SQL role inventory and P16 denied privileged operations; migration permissions are intentionally broader than runtime.

### V13.2.3 — L2

> Verify that if a credential has to be used for service authentication, the credential being used by the consumer is not a default credential (e.g., root/root or admin/admin).

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: appSecrets generates distinct40character app/migrator DB passwords; RDS admin generated secret is injected only to migration context. No deployed root/root or admin/admin source credential is configured.
- Remaining verification/residual: P16 inspect credential provisioning metadata without disclosing values; test local fixtures are not production credential proof.

### V13.2.4 — L2

> Verify that an allowlist is used to define the external resources or systems with which the application is permitted to communicate (e.g., for outbound requests, data loads, or file access). This allowlist can be implemented at the application layer, web server, firewall, or a combination of different layers.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: PushSubscriptionRequest restricts user-supplied HTTPS hosts; SDK uses configured AWS resources; SG egress allows443 plus scopedRDS5432. Hosted URL config weakly validates trusted env.
- Remaining verification/residual: Reconcile every outbound destination with inventory and add provider URL guards; broad443 SG is not a per-host allowlist by itself.

### V13.2.5 — L2

> Verify that the web or application server is configured with an allowlist of resources or systems to which the server can send requests or load data or files from.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Known Web Push host/subdomain allowlist and server-owned S3/resource IDs restrict dynamic destination inputs; no arbitrary fetch URL endpoint was found.
- Remaining verification/residual: Inspect configured Cognito domain and all operational external loaders; source inventory must stay synchronized with permitted systems.

### V13.3.1 — L2

> Verify that a secrets management solution, such as a key vault, is used to securely create, store, control access to, and destroy backend secrets. These could include passwords, key material, integrations with databases and third-party systems, keys and seeds for time-based tokens, other internal secrets, and API keys. Secrets must not be included in application source code or included in build artifacts. For an L3 application, this must involve a hardware-backed solution such as an HSM.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Secrets Manager generates backend DB/signing keys; ECS injects values at runtime; Docker/.dockerignore excludes .env/.local/.git and runtime copies built artifacts. VAPID secret is privately supplied.
- Remaining verification/residual: Verify secret injection/rotation/deletion and image scan in P16; source absence does not prove previously leaked static credentials were revoked.

### V13.3.2 — L2

> Verify that access to secret assets adheres to the principle of least privilege.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Task runtime/migration secret injections are separate; storage and audit policies scope named resources. appSecrets roles distinguish regular DB and schema owner.
- Remaining verification/residual: Complete IAM/access review and P16 denied read/list/export checks for unrelated secrets; do not infer every role is least privileged.

### V13.4.1 — L1

> Verify that the application is deployed either without any source control metadata, including the .git or .svn folders, or in a way that these folders are inaccessible both externally and to the application itself.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Docker runtime uses selective COPY and .dockerignore excludes .git/.local/docs/tests/env; staticClient serves only configured export root with containment checks.
- Remaining verification/residual: Inspect built runtime/image/static artifact and public .git/.env probes in P16.

### V13.4.2 — L2

> Verify that debug modes are disabled for all components in production environments to prevent exposure of debugging features and information leakage.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: NODE_ENV production runtime disables local auth bypass and pino-pretty; exported client is static. LOG_LEVEL can still be configured debug/trace, so log content controls remain H3.
- Remaining verification/residual: Inspect production debug/dev routes and generated source maps; do not equate production env flag with all provider/component debug modes.

### V13.4.3 — L2

> Verify that web servers do not expose directory listings to clients unless explicitly intended.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: staticClient uses express.static without directory-listing middleware, index:false, redirect:false and controlled404 export; S3 buckets private.
- Remaining verification/residual: P16 directory/key-prefix enumeration and static routing probes; absence of directory listing middleware is source evidence only.

### V13.4.4 — L2

> Verify that using the HTTP TRACE method is not supported in production environments, to avoid potential information leakage.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: No TRACE route is registered in app routes; unknown methods reach auth/404 without request echo. Caddy/API Gateway routes permit ANY at transport level.
- Remaining verification/residual: P16 verify deployed TRACE refusal/no echo across frontend/API origins; source route absence does not prove intermediary behavior.

### V13.4.5 — L2

> Verify that documentation (such as for internal APIs) and monitoring endpoints are not exposed unless explicitly intended.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: health/routes.ts exposes intentional healthz, restricts readyz to loopback; Caddyfile hides readyz. No swagger/openapi/metrics public endpoint was found in focused inventory.
- Remaining verification/residual: P16 external probe must prove readiness/internal diagnostics unavailable; health responses must remain minimal.

## V14 — Data Protection

### V14.1.1 — L2

> Verify that all sensitive data created and processed by the application has been identified and classified into protection levels. This includes data that is only encoded and therefore easily decoded, such as Base64 strings or the plaintext payload inside a JWT. Protection levels need to take into account any data protection and privacy regulations and standards which the application is required to comply with.

- Applicability: Applicable.
- Disposition: Source/data map recorded; immutable residual explicit.
- Current evidence/review: data-map.md names PostgreSQL/provider/S3/cache/export/backup classes and deadlines. Personal export is curated/no-store; erasure includes unbound planned-subject journals and every terminal credential envelope/handoff. Archived mutable descriptions/lastSeen expire at each event deadline without changing counts or another current event profile. Frozen ReportSnapshot JSON has no DB purge deadline; immutable audit/publication/schedule/provider/backup copies are not claimed erased.
- Remaining verification/residual: privacyCompletion/personDataRetention/identityQuotaRetention and media/content cleanup tests are local assertions. Owner policy and P16 deployed expiry/privilege/restore proof remain required; indefinite immutable retention is not approved by this document.

### V14.1.2 — L2

> Verify that all sensitive data protection levels have a documented set of protection requirements. This must include (but not be limited to) requirements related to general encryption, integrity verification, retention, how the data is to be logged, access controls around sensitive data in logs, database-level encryption, privacy and privacy-enhancing technologies to be used, and other confidentiality requirements.

- Applicability: Applicable.
- Disposition: Source/data map recorded; immutable residual explicit.
- Current evidence/review: data-map.md names PostgreSQL/provider/S3/cache/export/backup classes and deadlines. Personal export is curated/no-store; erasure includes unbound planned-subject journals and every terminal credential envelope/handoff. Archived mutable descriptions/lastSeen expire at each event deadline without changing counts or another current event profile. Frozen ReportSnapshot JSON has no DB purge deadline; immutable audit/publication/schedule/provider/backup copies are not claimed erased.
- Remaining verification/residual: privacyCompletion/personDataRetention/identityQuotaRetention and media/content cleanup tests are local assertions. Owner policy and P16 deployed expiry/privilege/restore proof remain required; indefinite immutable retention is not approved by this document.

### V14.2.1 — L1

> Verify that sensitive data is only sent to the server in the HTTP message body or header fields, and that the URL and query string do not contain sensitive information, such as an API key or session token.

- Applicability: Applicable.
- Disposition: Source repair recorded; operating proof pending.
- Current evidence/review: safeHttpSerializers, Pino completion hooks, hostedSignIn and Prisma diagnostic handlers omit raw URLs/query/private path IDs/headers/Location/provider error strings/SQL. securityLogOutput asserts final real JSON sink sentinels and safe categories. Protocol OAuth/handoff query credentials are bounded one-use/no-store/no-referrer exceptions; API bearer remains browser-memory only.
- Remaining verification/residual: P16 inspect actual transports/referrers/provider diagnostics and external failures; safe sink evidence is not an assertion of a pure BFF architecture.

### V14.2.2 — L2

> Verify that the application prevents sensitive data from being cached in server components, such as load balancers and application caches, or ensures that the data is securely purged after use.

- Applicability: Applicable.
- Disposition: Source/data map recorded; immutable residual explicit.
- Current evidence/review: data-map.md names PostgreSQL/provider/S3/cache/export/backup classes and deadlines. Personal export is curated/no-store; erasure includes unbound planned-subject journals and every terminal credential envelope/handoff. Archived mutable descriptions/lastSeen expire at each event deadline without changing counts or another current event profile. Frozen ReportSnapshot JSON has no DB purge deadline; immutable audit/publication/schedule/provider/backup copies are not claimed erased.
- Remaining verification/residual: privacyCompletion/personDataRetention/identityQuotaRetention and media/content cleanup tests are local assertions. Owner policy and P16 deployed expiry/privilege/restore proof remain required; indefinite immutable retention is not approved by this document.

### V14.2.3 — L2

> Verify that defined sensitive data is not sent to untrusted parties (e.g., user trackers) to prevent unwanted collection of data outside of the application's control.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Web Push payload design excludes lost-person description/incident text; source has no third-party tracker integration. Cognito/AWS/Firebase are documented processors.
- Remaining verification/residual: Inspect actual notification payloads/configured external scripts and P16 OS-history behavior; processor contracts are separate owner evidence.

### V14.2.4 — L2

> Verify that controls around sensitive data related to encryption, integrity verification, retention, how the data is to be logged, access controls around sensitive data in logs, privacy and privacy-enhancing technologies, are implemented as defined in the documentation for the specific data's protection level.

- Applicability: Applicable.
- Disposition: Source/data map recorded; immutable residual explicit.
- Current evidence/review: data-map.md names PostgreSQL/provider/S3/cache/export/backup classes and deadlines. Personal export is curated/no-store; erasure includes unbound planned-subject journals and every terminal credential envelope/handoff. Archived mutable descriptions/lastSeen expire at each event deadline without changing counts or another current event profile. Frozen ReportSnapshot JSON has no DB purge deadline; immutable audit/publication/schedule/provider/backup copies are not claimed erased.
- Remaining verification/residual: privacyCompletion/personDataRetention/identityQuotaRetention and media/content cleanup tests are local assertions. Owner policy and P16 deployed expiry/privilege/restore proof remain required; indefinite immutable retention is not approved by this document.

### V14.3.1 — L1

> Verify that authenticated data is cleared from client storage, such as the browser DOM, after the client or session is terminated. The 'Clear-Site-Data' HTTP response header field may be able to help with this but the client-side should also be able to clear up if the server connection is not available when the session is terminated.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: client/src/shared/lib/session.ts clears local credential synchronously before logout; shared shell guards and current-device revoke clear views/query state; photo/lost-person queries actively remove private data on lost standing.
- Remaining verification/residual: Inspect all query/cache/DOM cleanup on logout/terminal session/offline shared-phone handover; expired thin token is not automatically terminal refresh session.

### V14.3.2 — L2

> Verify that the application sets sufficient anti-caching HTTP response header fields (i.e., Cache-Control: no-store) so that sensitive data is not cached in browsers.

- Applicability: Applicable.
- Disposition: Source/data map recorded; immutable residual explicit.
- Current evidence/review: data-map.md names PostgreSQL/provider/S3/cache/export/backup classes and deadlines. Personal export is curated/no-store; erasure includes unbound planned-subject journals and every terminal credential envelope/handoff. Archived mutable descriptions/lastSeen expire at each event deadline without changing counts or another current event profile. Frozen ReportSnapshot JSON has no DB purge deadline; immutable audit/publication/schedule/provider/backup copies are not claimed erased.
- Remaining verification/residual: privacyCompletion/personDataRetention/identityQuotaRetention and media/content cleanup tests are local assertions. Owner policy and P16 deployed expiry/privilege/restore proof remain required; indefinite immutable retention is not approved by this document.

### V14.3.3 — L2

> Verify that data stored in browser storage (such as localStorage, sessionStorage, IndexedDB, or cookies) does not contain sensitive data, with the exception of session tokens.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: API access token is memory-only; outboxStore persists owned count intents and visitor/lost-person/photo APIs send sensitive data directly. SessionStorage holds short-lived PKCE pending state; published guides are deliberately cached.
- Remaining verification/residual: Inspect every storage/cache payload, legacy ownerless rows and published-content PII restrictions; preserve approved count outbox without declaring all browser storage empty.

## V15 — Secure Coding and Architecture

### V15.1.1 — L1

> Verify that application documentation defines risk based remediation time frames for 3rd party component versions with vulnerabilities and for updating libraries in general, to minimize the risk from these components.

- Applicability: Applicable.
- Disposition: Dependency policy/inventory recorded; release audit pending.
- Current evidence/review: security-operations-runbook.md records reachable Critical/High triage and release blocking with narrow dated exceptions. package-lock.json pins npm/native dependencies; CI audits and immutable image delivery are defined. A local npm SBOM hash and exact full-gate dependency audit must be recorded; the existing CDK exception through 31 October remains visible.
- Remaining verification/residual: Attach exact release audit/SBOM/image provenance after actual checks. No zero-advisory or deployed container inventory claim before evidence.

### V15.1.2 — L2

> Verify that an inventory catalog, such as software bill of materials (SBOM), is maintained of all third-party libraries in use, including verifying that components come from pre-defined, trusted, and continually maintained repositories.

- Applicability: Applicable.
- Disposition: Dependency policy/inventory recorded; release audit pending.
- Current evidence/review: security-operations-runbook.md records reachable Critical/High triage and release blocking with narrow dated exceptions. package-lock.json pins npm/native dependencies; CI audits and immutable image delivery are defined. A local npm SBOM hash and exact full-gate dependency audit must be recorded; the existing CDK exception through 31 October remains visible.
- Remaining verification/residual: Attach exact release audit/SBOM/image provenance after actual checks. No zero-advisory or deployed container inventory claim before evidence.

### V15.1.3 — L2

> Verify that the application documentation identifies functionality which is time-consuming or resource-demanding. This must include how to prevent a loss of availability due to overusing this functionality and how to avoid a situation where building a response takes longer than the consumer's timeout. Potential defenses may include asynchronous processing, using queues, and limiting parallel processes per user and per application.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: ADR-004 scheduled jobs, ADR-008 quotas/pool/timeouts and media/report designs identify selected expensive work. OAuth fetch lacks timeout and decode limits are assigned.
- Remaining verification/residual: Complete resource-demand inventory, queue/concurrency/time budget and response-vs-consumer timeout policy; P16 load proof.

### V15.2.1 — L1

> Verify that the application only contains components which have not breached the documented update and remediation time frames.

- Applicability: Applicable.
- Disposition: Dependency policy/inventory recorded; release audit pending.
- Current evidence/review: security-operations-runbook.md records reachable Critical/High triage and release blocking with narrow dated exceptions. package-lock.json pins npm/native dependencies; CI audits and immutable image delivery are defined. A local npm SBOM hash and exact full-gate dependency audit must be recorded; the existing CDK exception through 31 October remains visible.
- Remaining verification/residual: Attach exact release audit/SBOM/image provenance after actual checks. No zero-advisory or deployed container inventory claim before evidence.

### V15.2.2 — L2

> Verify that the application has implemented defenses against loss of availability due to functionality which is time-consuming or resource-demanding, based on the documented security decisions and strategies for this.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: platform/uploads/validatedImage.ts, boundedBytes.ts and s3Image.ts perform bounded pinned-byte still-raster decode and normalization. Media validated receipts and content storage intents freeze derivatives/manifests. imageValidation/s3ImageValidation/media and contentStorage unit tests, securityBoundaryStorage, mediaUploadAdmission/mediaUploadReplay/contentStorageIntent are the relevant assertions. Final sink logging omits arbitrary strings.
- Remaining verification/residual: P16 verify signed origin/size/type, private immutable bytes, event deadlines, resource load and orphan cleanup. Raster normalization is not antivirus.

### V15.2.3 — L2

> Verify that the production environment only includes functionality that is required for the application to function, and does not expose extraneous functionality such as test code, sample snippets, and development functionality.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Docker runtime omits client/server tests, dev dependencies and raw source; production local auth fails boot. Runtime includes operator scripts/seed build artifacts whose reachability must be inventoried.
- Remaining verification/residual: Inspect final image/entrypoint and production seed/dev-route exposure; selective COPY is evidence, not complete runtime inventory.

### V15.3.1 — L1

> Verify that the application only returns the required subset of fields from a data object. For example, it should not return an entire data object, as some individual fields should not be accessible to users.

- Applicability: Applicable.
- Disposition: Source/data map recorded; immutable residual explicit.
- Current evidence/review: data-map.md names PostgreSQL/provider/S3/cache/export/backup classes and deadlines. Personal export is curated/no-store; erasure includes unbound planned-subject journals and every terminal credential envelope/handoff. Archived mutable descriptions/lastSeen expire at each event deadline without changing counts or another current event profile. Frozen ReportSnapshot JSON has no DB purge deadline; immutable audit/publication/schedule/provider/backup copies are not claimed erased.
- Remaining verification/residual: privacyCompletion/personDataRetention/identityQuotaRetention and media/content cleanup tests are local assertions. Owner policy and P16 deployed expiry/privilege/restore proof remain required; indefinite immutable retention is not approved by this document.

### V15.3.2 — L2

> Verify that where the application backend makes calls to external URLs, it is configured to not follow redirects unless it is intended functionality.

- Applicability: Applicable.
- Disposition: Source repair recorded; deployed proof pending.
- Current evidence/review: client/src/shared/lib/clientConfigValidation.ts and server/src/config/schemas/auth.ts bound production HTTPS canonical origins; hostedSignIn.ts uses redirect:error and a ten-second AbortSignal timeout. config and securityLogOutput unit assertions are local evidence; no provider endpoint was contacted.
- Remaining verification/residual: P16.10 must verify real HTTPS/origin/redirect refusals and provider issuer configuration.

### V15.3.3 — L2

> Verify that the application has countermeasures to protect against mass assignment attacks by limiting allowed fields per controller and action, e.g., it is not possible to insert or update a field value when it was not intended to be part of that action.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Zod .strict schemas reject extra keys; updateVolunteer toChange explicitly selects person/membership fields; server/tests/integration/security.test.ts checks injected role field on capture.
- Remaining verification/residual: P16 every mutation unknown/prototype/privileged-field cases; H5 field-specific authorization is distinct from allowlisting accepted fields.

### V15.3.4 — L2

> Verify that all proxying and middleware components transfer the user's original IP address correctly using trusted data fields that cannot be manipulated by the end user, and the application and web server use this correct value for logging and security decisions such as rate limiting, taking into account that even the original IP address may not be reliable due to dynamic IPs, VPNs, or corporate firewalls.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: trust-proxy uses configured hop count; campusNetwork and rateLimit use req.ip. Real Caddy/API Gateway original-IP transfer remains unverified and changes path by topology.
- Remaining verification/residual: P16 forged forwarded-header/multiple-path proof and fixed trust boundary; do not treat public IP as unique trustworthy person identity.

### V15.3.5 — L2

> Verify that the application explicitly ensures that variables are of the correct type and performs strict equality and comparator operations. This is to avoid type juggling or type confusion vulnerabilities caused by the application code making an assumption about a variable type.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: TypeScript plus Zod safeParse enforces scalar types; auth state/callback and token claims check typeof; strict comparators are used in reviewed security seams.
- Remaining verification/residual: Inspect coercion exceptions/numeric/string booleans and P16.10 wrong-type cases; TypeScript types do not validate untrusted runtime values.

### V15.3.6 — L2

> Verify that JavaScript code is written in a way that prevents prototype pollution, for example, by using Set() or Map() instead of object literals.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Decision/rate caches use Map/Set; incoming objects go through strict Zod and explicit field projections rather than arbitrary object assignment. Focused search found Object.assign on a fixed handler metadata object, not user input.
- Remaining verification/residual: Add/inspect __proto__/constructor/prototype payload tests and dictionary-key sinks; no whole-application proof from one Map.

### V15.3.7 — L2

> Verify that the application has defenses against HTTP parameter pollution attacks, particularly if the application framework makes no distinction about the source of request parameters (query string, body parameters, cookies, or header fields).

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: validate separates body/query/params into typed values; callback grantOf rejects non-string code/state/verifier; Express repeated query values can become arrays.
- Remaining verification/residual: P16.10 duplicate query/header/cookie and conflicting-source cases; bodyless cookie Origin gate is separate V3.5.2 gap.

## V16 — Security Logging and Error Handling

### V16.1.1 — L2

> Verify that an inventory exists documenting the logging performed at each layer of the application's technology stack, what events are being logged, log formats, where that logging is stored, how it is used, how access to it is controlled, and for how long logs are kept.

- Applicability: Applicable.
- Disposition: Log/event inventory recorded; external completeness pending.
- Current evidence/review: security-operations-runbook.md lists Pino/app, Prisma-safe categories, attributed DB/post-commit CloudWatch audit, edge access, rejected flows and observer/task failure sinks with retention/access purposes. Denial/quota/validation/business/control-failure paths retain stable metadata without credentials. Provider failed-factor events and comprehensive external ingestion remain explicitly unproven.
- Remaining verification/residual: P16 proves actual event receipt/correlation, UTC clocks, denied log administration and human alarm delivery; a retained group is not shipping evidence.

### V16.2.1 — L2

> Verify that each log entry includes necessary metadata (such as when, where, who, what) that would allow for a detailed investigation of the timeline when an event happens.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: requestId middleware/pino children attach correlation; AuditLog captures actor/source/entity/action/outcome/createdAt/requestId in mutation transaction.
- Remaining verification/residual: Inspect all auth/refusal/system/operator events for required metadata without PII; failed provider factors are not yet proven in inventory.

### V16.2.2 — L2

> Verify that time sources for all logging components are synchronized, and that timestamps in security event metadata use UTC or include an explicit time zone offset. UTC is recommended to ensure consistency across distributed systems and to prevent confusion during daylight saving time transitions.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Application/DB timestamps use instants; PrismaPg forces TimeZone=UTC and ISODateTime contracts preserve timezone. Managed host clock synchronization has no local proof.
- Remaining verification/residual: P16 verify AWS/edge clocks and UTC log correlation; UTC formatting alone does not prove synchronized time sources.

### V16.2.3 — L2

> Verify that the application only stores or broadcasts logs to the files and services that are documented in the log inventory.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Pino logs stdout through ECS awsLogs; audit shipping targets fixed /spoh/stage/audit; provider/flow/observer groups named by infra.
- Remaining verification/residual: Reconcile every emitted log transport with final inventory; no ad hoc secret/local output or undocumented downstream sink.

### V16.2.4 — L2

> Verify that logs can be read and correlated by the log processor that is in use, preferably by using a common logging format.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Production pino emits newline JSON; API access log format includes fixed request/integration fields; auditLogBatches serialize controlled events for CloudWatch.
- Remaining verification/residual: P16 ingest/correlate sample synthetic events across layers and confirm parser compatibility.

### V16.2.5 — L2

> Verify that when logging sensitive data, the application enforces logging based on the data's protection level. For example, it may not be allowed to log certain data, such as credentials or payment details. Other data, such as session tokens, may only be logged by being hashed or masked, either in full or partially.

- Applicability: Applicable.
- Disposition: Source repair recorded; operating proof pending.
- Current evidence/review: safeHttpSerializers, Pino completion hooks, hostedSignIn and Prisma diagnostic handlers omit raw URLs/query/private path IDs/headers/Location/provider error strings/SQL. securityLogOutput asserts final real JSON sink sentinels and safe categories. Protocol OAuth/handoff query credentials are bounded one-use/no-store/no-referrer exceptions; API bearer remains browser-memory only.
- Remaining verification/residual: P16 inspect actual transports/referrers/provider diagnostics and external failures; safe sink evidence is not an assertion of a pure BFF architecture.

### V16.3.1 — L2

> Verify that all authentication operations are logged, including successful and unsuccessful attempts. Additional metadata, such as the type of authentication or factors used, should also be collected.

- Applicability: Applicable.
- Disposition: Log/event inventory recorded; external completeness pending.
- Current evidence/review: security-operations-runbook.md lists Pino/app, Prisma-safe categories, attributed DB/post-commit CloudWatch audit, edge access, rejected flows and observer/task failure sinks with retention/access purposes. Denial/quota/validation/business/control-failure paths retain stable metadata without credentials. Provider failed-factor events and comprehensive external ingestion remain explicitly unproven.
- Remaining verification/residual: P16 proves actual event receipt/correlation, UTC clocks, denied log administration and human alarm delivery; a retained group is not shipping evidence.

### V16.3.2 — L2

> Verify that failed authorization attempts are logged. For L3, this must include logging all authorization decisions, including logging when sensitive data is accessed (without logging the sensitive data itself).

- Applicability: Applicable.
- Disposition: Log/event inventory recorded; external completeness pending.
- Current evidence/review: security-operations-runbook.md lists Pino/app, Prisma-safe categories, attributed DB/post-commit CloudWatch audit, edge access, rejected flows and observer/task failure sinks with retention/access purposes. Denial/quota/validation/business/control-failure paths retain stable metadata without credentials. Provider failed-factor events and comprehensive external ingestion remain explicitly unproven.
- Remaining verification/residual: P16 proves actual event receipt/correlation, UTC clocks, denied log administration and human alarm delivery; a retained group is not shipping evidence.

### V16.3.3 — L2

> Verify that the application logs the security events that are defined in the documentation and also logs attempts to bypass the security controls, such as input validation, business logic, and anti-automation.

- Applicability: Applicable.
- Disposition: Log/event inventory recorded; external completeness pending.
- Current evidence/review: security-operations-runbook.md lists Pino/app, Prisma-safe categories, attributed DB/post-commit CloudWatch audit, edge access, rejected flows and observer/task failure sinks with retention/access purposes. Denial/quota/validation/business/control-failure paths retain stable metadata without credentials. Provider failed-factor events and comprehensive external ingestion remain explicitly unproven.
- Remaining verification/residual: P16 proves actual event receipt/correlation, UTC clocks, denied log administration and human alarm delivery; a retained group is not shipping evidence.

### V16.3.4 — L2

> Verify that the application logs unexpected errors and security control failures such as backend TLS failures.

- Applicability: Applicable.
- Disposition: Source repair recorded; operating proof pending.
- Current evidence/review: safeHttpSerializers, Pino completion hooks, hostedSignIn and Prisma diagnostic handlers omit raw URLs/query/private path IDs/headers/Location/provider error strings/SQL. securityLogOutput asserts final real JSON sink sentinels and safe categories. Protocol OAuth/handoff query credentials are bounded one-use/no-store/no-referrer exceptions; API bearer remains browser-memory only.
- Remaining verification/residual: P16 inspect actual transports/referrers/provider diagnostics and external failures; safe sink evidence is not an assertion of a pure BFF architecture.

### V16.4.1 — L2

> Verify that all logging components appropriately encode data to prevent log injection.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: Pino JSON encoding and server/src/platform/http/requestId.ts safe allowlist constrain log injection; server/tests/integration/security.test.ts rejects request IDs with spaces/punctuation/traversal/oversize.
- Remaining verification/residual: Extend actual serialized control-character/provider/error/query sentinel cases; escaping does not substitute for avoiding sensitive content.

### V16.4.2 — L2

> Verify that logs are protected from unauthorized access and cannot be modified.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: App SQL audit role insert/select restrictions and immutable/owner retention function limit mutation; infra/cdk/src/auditAccess.ts permits CloudWatch append only, no read/delete/retention change.
- Remaining verification/residual: P16 denied SQL/log-admin operations and backup/owner-access policy proof; app logs and provider logs need separate IAM inventory.

### V16.4.3 — L2

> Verify that logs are securely transmitted to a logically separate system for analysis, detection, alerting, and escalation. The aim is to ensure that if the application is breached, the logs are not compromised.

- Applicability: Applicable.
- Disposition: Provider / P16 evidence pending.
- Current evidence/review: Audit shipping writes to logically separate retained CloudWatch group with append-only task rights; shipment cursor/batches handle partial rejection.
- Remaining verification/residual: P16 actual rows arriving within10minutes, cursor progression and denied task read/delete; retained group alone is not shipping evidence.

### V16.5.1 — L2

> Verify that a generic message is returned to the consumer when an unexpected or security-sensitive error occurs, ensuring no exposure of sensitive internal system data such as stack traces, queries, secret keys, and tokens.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: errorHandler normalizes unknown/database failures to generic exposed-safe envelope; server/tests/integration/security.test.ts asserts no Prisma/SQL/token/stack leak in responses.
- Remaining verification/residual: Inspect every provider/operator/public error response; H3 server logs are a separate exposure boundary.

### V16.5.2 — L2

> Verify that the application continues to operate securely when external resource access fails, for example, by using patterns such as circuit breakers or graceful degradation.

- Applicability: Applicable.
- Disposition: Source review recorded; final evidence pending.
- Current evidence/review: resilientAuthorizer uses circuit breaker/local policy only for approved groups and fail-closed manage/config/platform; DB/push/audit have bounded failure handling.
- Remaining verification/residual: authorizer tests and P16 AVP/RDS/provider/storage drills must prove actual behavior under outage; no live drill performed.

### V16.5.3 — L2

> Verify that the application fails gracefully and securely, including when an exception occurs, preventing fail-open conditions such as processing a transaction despite errors resulting from validation logic.

- Applicability: Applicable.
- Disposition: Source repair recorded; final campaign pending.
- Current evidence/review: currentPermission/captureStation recheck exact actions under Event/Person/member/assignment fences. Roster changes reload targets, enforce People.AssignRole/People.Update and refuse foreign-only adoption; credential invalidation/audit is atomic. Recovery proves provider ownership through durable immutable operation markers. Private-platform isolation and each schema-derived event ID × six roles compare foreign/missing targets. Reporting graphs serialize under Event and recheck current managers/cycles. credentialBoundary, rosterIdentityBoundary, cardAuthorityLocks, cardGroupIsolation, reportingLineBoundary, identityRecovery, isolation and platformIsolation cover these boundaries.
- Remaining verification/residual: Complete local/exact-SHA CI remains required; P16.10 proves deployed granular API cases and P16.3 external failures. No mock proves AWS delivery or commit rollback of an external provider action.

## V17 — WebRTC

### V17.1.1 — L2

> Verify that the Traversal Using Relays around NAT (TURN) service only allows access to IP addresses that are not reserved for special purposes (e.g., internal networks, broadcast, loopback). Note that this applies to both IPv4 and IPv6 addresses.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No TURN/STUN relay service, ICE configuration or WebRTC feature was found in server/client/infra runtime inventory.
- Remaining verification/residual: Re-evaluate reserved-address filtering if real-time relay is introduced.

### V17.2.1 — L2

> Verify that the key for the Datagram Transport Layer Security (DTLS) certificate is managed and protected based on the documented policy for management of cryptographic keys.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No DTLS certificate/key consumer or WebRTC media server is implemented; S3 raster photos are file storage, not streaming media.
- Remaining verification/residual: Re-evaluate key policy when DTLS media transport is added.

### V17.2.2 — L2

> Verify that the media server is configured to use and support approved Datagram Transport Layer Security (DTLS) cipher suites and a secure protection profile for the DTLS Extension for establishing keys for the Secure Real-time Transport Protocol (DTLS-SRTP).

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No DTLS-SRTP media server/configuration is present; current dashboard polls HTTP and images use private file reads.
- Remaining verification/residual: Do not apply streaming cipher configuration to stored JPEG/PNG/WebP files; revisit on streaming transport.

### V17.2.3 — L2

> Verify that Secure Real-time Transport Protocol (SRTP) authentication is checked at the media server to prevent Real-time Transport Protocol (RTP) injection attacks from leading to either a Denial of Service condition or audio or video media insertion into media streams.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No RTP/SRTP packet ingestion/authentication exists in application source or infra.
- Remaining verification/residual: Re-evaluate media authentication/injection controls if RTP endpoints are added.

### V17.2.4 — L2

> Verify that the media server is able to continue processing incoming media traffic when encountering malformed Secure Real-time Transport Protocol (SRTP) packets.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No SRTP media packet parser exists; current image decoder safety is a separate V5 upload boundary.
- Remaining verification/residual: Keep image malformed-file tests applicable under V5 without inventing an SRTP service.

### V17.3.1 — L2

> Verify that the signaling server is able to continue processing legitimate incoming signaling messages during a flood attack. This should be achieved by implementing rate limiting at the signaling level.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No WebRTC signaling server is present; normal REST/polling quotas are handled separately.
- Remaining verification/residual: Re-evaluate signaling flood limits if signaling endpoints are introduced.

### V17.3.2 — L2

> Verify that the signaling server is able to continue processing legitimate signaling messages when encountering malformed signaling message that could cause a denial of service condition. This could include implementing input validation, safely handling integer overflows, preventing buffer overflows, and employing other robust error-handling techniques.

- Applicability: Not applicable candidate.
- Disposition: Source nonapplicability recorded; configuration review required.
- Current evidence/review: No signaling message protocol/handler exists; REST JSON parsing uses strict schemas and body limits.
- Remaining verification/residual: Re-evaluate malformed signaling resilience on introduction of real-time communications.

## Register integrity

All 253 unique requirement IDs and levels match the pinned input; no row is labelled compliant. Source repair, nonapplicability, provider proof and residual acceptance are distinct dispositions. This register records unresolved assurance evidence honestly and does not convert operational High findings or owner-held decisions into closed production acceptance.
