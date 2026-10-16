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
| Chromium dashboard | All five scenario interactions passed, no page JavaScript errors, and no horizontal overflow at 390px mobile width |
| Native CRE simulation | Attempted; blocked before execution because the cloud CLI has no login/API key |
| Deployed enclave / ZK / ACE / CCIP | Not implemented or validated |

The handler tests use a mock TeeRuntime. They verify the intended data flow, not enclave isolation or DON execution. The build validates WASM compilation, not native CRE simulation. Evidence tests verify explicit consent, eligible-recipient checks, indicator/supplier/version allowlists, coarse windows, threshold-only counts, and withholding of identifying fields. These checks model policy using a trusted synthetic roster; they do not establish real user authentication or source authenticity. Chromium click interactions and mobile layout were checked, and a screenshot was visually inspected.

CRE CLI v1.38.0 was installed after checking the published archive checksum and verifying the binary's GPG signature against the release installer key. The official Javy setup verified its published SHA-256 checksum. The Javy cache required a sandbox-approved write to `/home/agent/.cache/javy`.

The existing sports-settlement-oracle checkout remains unchanged.
