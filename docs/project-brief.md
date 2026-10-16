# QuietSignal project brief

QuietSignal helps organizations investigate suspicious activity involving a shared software supplier without exchanging full logs. It correlates narrowly scoped supplier/version/destination and process-sequence observations, then shares an explicitly approved brief with eligible participants.

The pipeline is: scoped observations → authentication/validation → correlation → consent and disclosure checks → an approved evidence brief. The current rule requires three distinct enrolled organizations and two qualifying update → connection → unusual-process sequences in thirty minutes. A lead supports investigation, not a maliciousness verdict.

One shared policy engine supports three modes:

- The public website at https://angelnycc.github.io/QuietSignal/ demonstrates five fictional scenarios and approved evidence downloads.
- The local pilot implements signed synthetic ingestion, persistent incidents, role-scoped access, acknowledgement, consent/revocation controls and a local hash-linked audit trail.
- The CRE adapter compiles and has mock-handler tests; native execution, confidential processing of pilot records and recipient delivery through CRE remain future integrations.

Useful indicators and context are shared under an explicit policy. Full logs, contributor identities, credentials and unrelated activity are withheld. Registered collector signatures prove key possession rather than event truth, and independently owned organizations are not verified by the test enrollment authority.

Source: https://github.com/Angelnycc/QuietSignal. Start with the README for the demo, docs/architecture.md for implementation, and docs/security-model.md for trust assumptions. The project makes no claim of real monitoring, deployed enclave isolation, ZK proof, ACE/CCIP delivery or production firewall enforcement.
