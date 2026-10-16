# Pilot security model

The supported environment is one trusted developer operating synthetic test participants on a loopback-only machine. The application controls access between test browser sessions and checks signed collector submissions. The host, local database owner, seed-key owner and workspace administrator are trusted. A compromised host can access all stored data and local keys.

| Boundary | Implemented control | Limit |
| --- | --- | --- |
| Collector admission | Ed25519 over workspace, method, exact path, collector, timestamp, nonce and SHA-256 of raw JSON bytes | Verifies an enrolled key; does not prove event truth, business identity, or independent ownership |
| Replay and identity conflicts | Persistent unique nonces; fixed event identity per collector; identical-content retries with fresh nonces are idempotent; conflicting payloads rejected | Clock must be sane; local key compromise permits false signed evidence |
| Membership | Operator-issued organizations, expiring access keys, active collector bindings, current membership checks | Not independent company verification, anonymous membership, or Sybil resistance |
| Browser sessions | Random bearer access files; database stores token/session hashes; HttpOnly SameSite=Strict cookies; CSRF plus exact Origin checks; key/session revocation | Local HTTP only; TLS and managed identity are required before remote delivery |
| Disclosure | Recomputed consenting threshold; explicit recipient, supplier, version and domain allowlists; no arbitrary source display strings | Distinctive patterns, small cohorts and output timing can still reveal information indirectly |
| Recipient actions | Authorization on list/detail/acknowledge/download; opaque UUIDs; participant audit scoped to own actions without global sequence numbers | Cannot revoke evidence already saved by a recipient |
| Rendering | Dynamic DOM textContent; external workspace scripts; CSP without unsafe-inline/eval; no external fonts/analytics; framing denied | Does not protect a compromised browser or trusted administrator |
| Persistence | Parameterized SQL, transactions, WAL, foreign keys, schema version checks, restart validation | Local plaintext database; no enclave, encrypted storage, automatic retention, or remote disaster recovery |
| Audit | Local SHA-256 hash chain, startup verification, operator trail, scoped participant trail | Not externally anchored or immutable; database owner can rewrite/truncate the complete chain |
| Resource use | Bounded bodies, per-run evidence limits, roster/collector limits and process-local rate windows | Not a production abuse-control service; total retained history and disk use remain unbounded |

Failed admission records only a generic reason code. Rejection audit writes are capped at thirty per address per minute; rate-limited requests do not append audit entries. This is bounded sampling, not a complete record of every rejected request. Accepted evidence and policy mutations retain transactional audit records. Request bodies, signatures, cookies, access tokens and raw exception messages are not logged. Audit failures return generic errors, including on rejected requests.

Member patches update only the explicitly supplied fields, so a slow partial update cannot undo a concurrent revocation. Controlled scenario revocations invalidate participant sessions just like administrative revocation. Collector identities cannot appear more than once in an enrollment snapshot. An empty recipient allowlist deliberately suspends all delivery. Incident identity uses stable internal findings, never supplier display labels; those identifiers and exact counts remain outside the public brief projection.

The interface does not claim successful sign-out after a failed request, and older session responses cannot reopen the workspace after logout. These behaviors have browser regressions. The outer server disables development error pages and returns generic failures.

The local server has an operator-only controlled simulator and public fictional showcase endpoints. Showcase responses cannot read the persistent pilot database. The signed ingestion route does not accept browser sessions as a substitute for collector keys. Collector validity and request age are checked again after streaming body reads; browser sessions are also rechecked after body reads to close revocation races.

## Chainlink boundary

The separate `correlation/workflow.ts` uses the official CRE Confidential Workflows entry point and typed SDK. Its loopback source is still the fictional fixture snapshot, not the pilot database. It releases only approved aggregate status through `usingTheDons()`. Native CLI execution has not completed because authentication is deferred; compilation and mock-handler tests do not establish DON execution or enclave confidentiality.

The next integration must define an authenticated, authorized evidence source and move the recipient release decision inside the confidential processing boundary. Plaintext briefs must not flow through ordinary DON logs or public reports. Source verification must name the exact statement checked and its trust assumptions. DECO/Town Crier availability must be confirmed for that specific integration; neither automatically establishes that host observations are truthful or private correlation is zero knowledge. ACE and CCIP are separate future integrations, not guarantees supplied by this pilot.

Before remote use: independently managed enrollment, TLS and managed identity, key lifecycle/recovery, retention and encryption, query/inference controls, source connector hardening, actual CRE simulation and confidential-runtime validation, and an external security review are required. This version does not monitor a real device or enforce a firewall.
