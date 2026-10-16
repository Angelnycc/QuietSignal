# QuietSignal development

Use this existing isolated checkout. Do not create a Git worktree unless the user requests one.

The user wants local development and review before requesting deployment access. Do not make a CRE API key or deploy approval a prerequisite for prototype work. Native cloud simulation remains deferred until supported authentication is available. Defer GitHub creation and upload until the first version is finished and tested.

Read README.md and docs/validation.md before making readiness claims. Synthetic demos, native CRE simulation, and deployed confidential execution are separate validation levels. Do not claim TEE security, ZK proofs, ACE policies, or CCIP delivery from local unit tests.

Run `bun test` and `bun run typecheck` for correlation changes. Start `bun run dev` for the loopback synthetic service; then run the README's exact non-broadcast native CRE simulation when authentication is available. Follow the installed Chainlink CRE skill for CRE changes.

For website changes, run `bun run build:web` and `bun run check:web` (Python Playwright and Chromium required). The static website is dist/index.html; screenshots are in dist/website-checks. Keep all demo functionality self-contained and clearly fictional. A static build is not a public deployment; do not claim a live preview URL exists. Defer GitHub publishing as instructed.

The product goal is selective evidence sharing with trusted recipients. Follow docs/evidence-sharing.md: useful indicators can be shared under an explicit access/disclosure policy; full logs, unnecessary identities, credentials, and unrelated activity cannot. Do not put private source data or guessable domain hashes in public outputs. A policy-checked synthetic brief generator and authenticated local pilot are implemented. Read docs/local-pilot.md and docs/security-model.md before changing admission, membership, sessions, or disclosure. Production identity, remote encrypted member delivery and confidential execution of pilot records are not implemented. Do not automate firewall changes, deploy contracts, or broadcast transactions as part of setup. New security guarantees require meaningful adversarial tests and a stated trust boundary.

For pilot changes, run `bun test`, `bun run typecheck`, `bun run format:check` and `bun run check:pilot`. Browser checks create disposable state and must never read development operator or collector credentials. Keep `.quietsignal` and all private collector/access files out of Git and source archives. Preserve the loopback-only boundary; do not imply that a cloud-local URL is accessible from the user’s laptop.
