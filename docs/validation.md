# Validation evidence

Validated in the Codex cloud workspace on 2026-10-16.

| Check | Outcome |
| --- | --- |
| Bun 1.3.11, frozen lockfile installation | Passed; repeated installation made no changes |
| `bun test` | 73 passed, 0 failed; 299 assertions across correlation, mock-handler, evidence-disclosure and pilot tests |
| `bun run typecheck` | Passed for the workflow against CRE SDK 1.18.0 and for the Bun application/scripts |
| `bun run format:check` | Passed for the pilot backend, UI, collector utility and tests |
| `bun run build` | Workflow compiled to WASM using Javy v8.1.0 |
| `bun run demo` | Correlated scenario warns; duplicate, benign, expired, and revoked scenarios do not |
| Synthetic HTTP service | Five member-demo scenarios, approved evidence release, aggregate redaction, and source fixture checked with local requests |
| Security-themed website | Overview, network diagram, how-it-works, dashboard, sharing walkthrough, architecture/status, FAQ, and mobile navigation implemented |
| `bun run build:web` | Self-contained `dist/index.html` generated from the tested model; no external runtime dependencies |
| `bun run check:web` | Five scenarios, approved JSON download, reset, keyboard disclosure tabs, FAQ, anchors, and mobile-menu click/Escape behavior passed; no page errors or external requests |
| Responsive layout | No horizontal overflow at widths 360, 390, 768, 1024, and 1440px; desktop and mobile screenshots inspected |
| Standalone HTML export | Exported document contents passed all five interactions in Chromium with zero network requests and no contributor identifiers. Managed Chromium blocks file-URL navigation, so a literal downloaded-file launch was not verified here. |
| Signed admission | Genuine signatures accepted; altered bytes/wrong keys, cross-workspace/organization claims, stale/future requests, revoked collectors, replay attempts, invalid sequences, oversized/unknown fields, per-collector rate and per-run capacity tested |
| Concurrency/failures | Concurrent runs rejected; collector revocation during streaming body fails closed; audit failure rolls back observation and nonce admission |
| Recipient isolation | Anonymous/foreign-origin/CSRF/role attacks rejected; current consent, recipient/domain allowlists, revocation and expiry rechecked; participant audit excludes other actors and global sequence numbers |
| Persistence | Restart preserves workspace, incident UUIDs, evidence, sessions and nonce state; inconsistent audit edits and unsupported schema versions rejected |
| Separate collector utility | Generated a key in a separate process, registered its public key and submitted signed synthetic evidence over actual HTTP |
| `bun run check:pilot` | Disposable HTTP server: five signed scenarios, acknowledgement/download, consent withdrawal/restoration, collector revocation/restoration, participant access, own audit and logout passed |
| Pilot browser checks | Marketing/workspace CSP exercised without violations; no root horizontal overflow at 360, 390, 768, 1024 and 1440px; desktop/mobile screenshots inspected |
| Running pilot server | Fresh loopback service health, anonymous session and protected-workspace HTML/security headers verified |
| Native CRE simulation | Attempted; blocked before execution because the cloud CLI has no login/API key |
| Deployed enclave / ZK / ACE / CCIP | Not implemented or validated |

The handler tests use a mock TeeRuntime. They verify the intended data flow, not enclave isolation or DON execution. The build validates WASM compilation, not native CRE simulation. Evidence tests verify explicit consent, eligible-recipient checks, indicator/supplier/version allowlists, coarse windows, threshold-only counts, and withholding of identifying fields. The pilot adds real local session/collector cryptography and authorization checks, using synthetic identities under one trusted local operator. It does not establish independently verified organizations, event truth or encrypted remote delivery. The CRE entry point still reads fictional fixture snapshots, separately from the pilot database. See docs/security-model.md.

Pilot browser checks generate disposable keys, sessions and databases and remove private test state afterward; they never read development access files. Screenshots are retained in dist/pilot-checks and dist/website-checks. A localhost address in this cloud workspace is not a public preview for the user's laptop. The local hash-linked audit trail is not an immutable ledger.

CRE CLI v1.38.0 was installed after checking the published archive checksum and verifying the binary's GPG signature against the release installer key. The official Javy setup verified its published SHA-256 checksum. The Javy cache required a sandbox-approved write to `/home/agent/.cache/javy`.

The existing sports-settlement-oracle checkout remains unchanged.

A GitHub Actions workflow is prepared with pinned Bun/Playwright versions, a pinned checkout action, read-only repository permissions, frozen dependency installation, tests/type/format checks, WASM compilation and both browser suites. Its local checks passed; inspect GitHub Actions after publication for remote results. Local runs of its substantive checks are the evidence recorded above.

API-key creation and deployment requests are deferred at the user's direction. They are not required to develop or review this prototype. Headless cloud CLI authentication is a later integration step; local browser-based CRE login supports simulation without requesting deployment access.

The user has now created Angelnycc/QuietSignal and authorized publication there. Check docs/publishing.md for current source/hosting status. The site's status section distinguishes the local prototype from future CRE, source-authenticity, encrypted-delivery, ACE, CCIP, and DECO/ZK integrations.
