# Validation evidence

Validated in the Codex cloud workspace on 2026-10-16.

| Check | Outcome |
| --- | --- |
| Bun 1.3.11, frozen lockfile installation | Passed; repeated installation made no changes |
| `bun test` | 45 passed, 0 failed; 111 assertions across correlation, mock-handler, and evidence-disclosure tests |
| `bun run typecheck` | Passed against CRE SDK 1.18.0 |
| `bun run build` | Workflow compiled to WASM using Javy v8.1.0 |
| `bun run demo` | Correlated scenario warns; duplicate, benign, expired, and revoked scenarios do not |
| Synthetic HTTP service | Five member-demo scenarios, approved evidence release, aggregate redaction, and source fixture checked with local requests |
| Security-themed website | Overview, network diagram, how-it-works, dashboard, sharing walkthrough, architecture/status, FAQ, and mobile navigation implemented |
| `bun run build:web` | Self-contained `dist/index.html` generated from the tested model; no external runtime dependencies |
| `bun run check:web` | Five scenarios, approved JSON download, reset, keyboard disclosure tabs, FAQ, anchors, and mobile-menu click/Escape behavior passed; no page errors or external requests |
| Responsive layout | No horizontal overflow at widths 360, 390, 768, 1024, and 1440px; desktop and mobile screenshots inspected |
| Standalone HTML export | Exported document contents passed all five interactions in Chromium with zero network requests and no contributor identifiers. Managed Chromium blocks file-URL navigation, so a literal downloaded-file launch was not verified here. |
| Native CRE simulation | Attempted; blocked before execution because the cloud CLI has no login/API key |
| Deployed enclave / ZK / ACE / CCIP | Not implemented or validated |

The handler tests use a mock TeeRuntime. They verify the intended data flow, not enclave isolation or DON execution. The build validates WASM compilation, not native CRE simulation. Evidence tests verify explicit consent, eligible-recipient checks, indicator/supplier/version allowlists, coarse windows, threshold-only counts, and withholding of identifying fields. These checks model policy using a trusted synthetic roster; they do not establish real user authentication or source authenticity. Chromium click interactions and mobile layout were checked, and a screenshot was visually inspected.

CRE CLI v1.38.0 was installed after checking the published archive checksum and verifying the binary's GPG signature against the release installer key. The official Javy setup verified its published SHA-256 checksum. The Javy cache required a sandbox-approved write to `/home/agent/.cache/javy`.

The existing sports-settlement-oracle checkout remains unchanged.

API-key creation and deployment requests are deferred at the user's direction. They are not required to develop or review this prototype. Headless cloud CLI authentication is a later integration step; local browser-based CRE login supports simulation without requesting deployment access.

The website has not been publicly hosted. GitHub creation/upload remains deferred. The site's status section distinguishes the local prototype from future CRE, source-authenticity, encrypted-delivery, ACE, CCIP, and DECO/ZK integrations.
