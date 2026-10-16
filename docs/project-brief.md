# QuietSignal project brief

QuietSignal helps trusted organizations quietly exchange useful threat evidence without exposing unrelated sensitive information. Its initial focus is unusual post-update activity across organizations using the same software suppliers. Confidential processing supports an explicit evidence-sharing policy; the goal is to give recipients enough information to investigate while withholding full source logs and unnecessary identifying details.

The local demo now generates member briefs with approved destinations, affected software versions, sanitized event sequences, coarse time windows, corroboration, and evidence limitations. Explicit contributor consent and eligible-recipient checks are modeled using a trusted mock roster. The CRE workflow still exports only aggregate status; production identity verification and encrypted remote member delivery remain to be built; local pilot access controls are implemented. See docs/evidence-sharing.md.

The initial rule requires the same supplier, software version, and destination at three enrolled organizations, including two qualifying update → connection → unusual child-process sequences within 30 minutes. A result is an investigation lead, not a malware verdict.

CRE is the intended coordinator for confidential computation. The prototype implements a Confidential Workflow entry point and synthetic data. Independently verified enrollment, proof of source-event truth, private remote notifications, deployed enclave security, ACE, CCIP, and any DECO/ZK integration are separate future milestones. TEE attestation and ZK proofs must not be described as interchangeable.

Development happens through Codex in the cloud workspace; no local Codex or Claude Code installation is required. The code checkout is `/workspace/quietsignal`. A ChatGPT Project can organize conversations and this brief; it is separate from the filesystem and GitHub repository. Moving a chat does not establish transfer of the attached execution environment.

Read README.md and docs/validation.md for commands, current evidence, and blockers. Keep real logs and credentials out of chats, Git, public summaries, and demo fixtures.

The website showcases the project with a dark security theme, a consortium diagram, an interactive five-scenario dashboard, an evidence-sharing walkthrough, and architecture/status information. `bun run build:web` creates a portable static site with no account or API key needed to explore. The synthetic static website is published at https://angelnycc.github.io/QuietSignal/; GitHub reports successful deployment. The persistent backend remains local.

## Implemented local pilot

A security-themed website and authenticated incident workspace now accompany the core. The pilot has signed synthetic collector ingestion, persistent SQLite state, incident acknowledgement/evidence downloads, role-scoped participant access, membership/collector revocation, consent and release controls, and a local hash-linked audit trail. The same ingestion endpoint powers controlled scenarios and an independent collector CLI. Read docs/local-pilot.md and docs/security-model.md for operation and limitations. No remote hosting, real monitoring or deployed confidential guarantees are implied.
