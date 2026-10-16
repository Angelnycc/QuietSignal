# Validation evidence

Validated in the Codex cloud workspace on 2026-10-16.

| Check | Outcome |
| --- | --- |
| Bun 1.3.11, frozen lockfile installation | Passed; repeated installation made no changes |
| `bun test` | 32 passed, 0 failed; 67 assertions across correlation and mock-handler tests |
| `bun run typecheck` | Passed against CRE SDK 1.18.0 |
| `bun run build` | Workflow compiled to WASM using Javy v8.1.0 |
| `bun run demo` | Correlated scenario warns; duplicate, benign, expired, and revoked scenarios do not |
| Synthetic HTTP service | Dashboard document, five scenario responses, summary redaction, and fixture source checked with local requests |
| Native CRE simulation | Attempted; blocked before execution because the cloud CLI has no login/API key |
| Deployed enclave / ZK / ACE / CCIP | Not implemented or validated |

The handler tests use a mock TeeRuntime. They verify the intended data flow, not enclave isolation or DON execution. The build validates WASM compilation, not native CRE simulation. Browser appearance and click interactions have not been tested in a browser.

CRE CLI v1.38.0 was installed after checking the published archive checksum and verifying the binary's GPG signature against the release installer key. The official Javy setup verified its published SHA-256 checksum. The Javy cache required a sandbox-approved write to `/home/agent/.cache/javy`.

The existing sports-settlement-oracle checkout remains unchanged.
