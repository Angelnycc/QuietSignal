# QuietSignal project brief

QuietSignal is an experimental confidential early-warning service for organizations using the same software suppliers. It correlates unusual post-update activity across independent participants while limiting disclosure of their underlying evidence.

The initial rule requires the same supplier, software version, and destination at three enrolled organizations, including two qualifying update → connection → unusual child-process sequences within 30 minutes. A result is an investigation lead, not a malware verdict.

CRE coordinates confidential computation. The prototype uses a Confidential Workflow entry point and synthetic data. Enrollment, source authenticity, private notifications, deployed enclave security, ACE, CCIP, and any DECO/ZK integration are separate future milestones. TEE attestation and ZK proofs must not be described as interchangeable.

Development happens through Codex in the cloud workspace; no local Codex or Claude Code installation is required. The code checkout is `/workspace/quietsignal`. A ChatGPT Project can organize conversations and this brief; it is separate from the filesystem and GitHub repository. Moving a chat does not establish transfer of the attached execution environment.

Read README.md and docs/validation.md for commands, current evidence, and blockers. Keep real logs and credentials out of chats, Git, public summaries, and demo fixtures.
