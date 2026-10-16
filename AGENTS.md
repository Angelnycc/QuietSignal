# QuietSignal development

Use this existing isolated checkout. Do not create a Git worktree unless the user requests one.

Read README.md and docs/validation.md before making readiness claims. Synthetic demos, native CRE simulation, and deployed confidential execution are separate validation levels. Do not claim TEE security, ZK proofs, ACE policies, or CCIP delivery from local unit tests.

Run `bun test` and `bun run typecheck` for correlation changes. Start `bun run dev` for the loopback synthetic service; then run the README's exact non-broadcast native CRE simulation when authentication is available. Follow the installed Chainlink CRE skill for CRE changes.

The product goal is selective evidence sharing with trusted recipients. Follow docs/evidence-sharing.md: useful indicators can be shared under an explicit access/disclosure policy; full logs, unnecessary identities, credentials, and unrelated activity cannot. Do not put private source data or guessable domain hashes in public outputs. Member evidence delivery is not implemented yet. Do not automate firewall changes, deploy contracts, or broadcast transactions as part of setup. New security guarantees require meaningful adversarial tests and a stated trust boundary.
