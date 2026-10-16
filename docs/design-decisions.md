# Design decisions and tradeoffs

## Why this problem

An unexpected connection after a supplier update can be ambiguous at one organization. Matching supplier, version, destination and process sequence across organizations can create an earlier investigation lead. Raw log sharing would disclose unrelated employee, infrastructure and business information. QuietSignal therefore focuses on the narrower problem of making a lead useful while releasing only explicitly permitted evidence.

The prototype demonstrates the mechanism; it does not establish a measured detection benefit in real incidents. Threat-intelligence exchange and privacy-preserving analytics already exist. This project's contribution is the implemented combination of sequence-aware correlation, consent-conditioned threshold recomputation, narrowly scoped evidence briefs and a proposed confidential-workflow release boundary, rather than a claim to invent threat sharing.

## Deterministic rules before AI classification

The current rule is small enough to inspect and test: a matching supplier/version/destination at three enrolled organizations, with two supporting sequences inside a rolling thirty-minute window. Fifty reports by one enrolled organization still count once. Destination overlap without the sequence does not warn.

This improves reproducibility and makes failures explainable. It can miss other attacks, and correlated activity can still be benign. The output is an investigation lead, not a maliciousness verdict. No automated blocking follows from it.

## Recompute after consent and disclosure filtering

Filtering identities from a completed result is insufficient. A nonconsenting organization's report must not silently support the claim that three permitted contributors corroborated the shared brief. The implementation validates the full snapshot, selects permitted evidence and recomputes the threshold. Withdrawal can therefore remove an existing brief from subsequent requests.

This costs additional evaluation work per request, which is acceptable for the bounded local pilot. A production cache would need explicit policy-version, revocation, source-freshness and expiry invalidation rules.

## Authenticate keys without claiming event truth

Ed25519 identifies a registered collector key, binds its request context and detects byte tampering. Persistent nonces reject replay; conflicting payloads under the same collector/event identity fail closed. Freshly signed identical retries are idempotent.

An enrolled collector can still lie, and an administrator can enroll multiple test organizations they control. Independent enrollment and authenticated telemetry provenance are distinct requirements. DECO or another source-verification mechanism must be evaluated against a specific source and statement; it is not an automatic proof that arbitrary endpoint events occurred.

## Allowlist fields rather than sanitize arbitrary logs

The input schema is narrowly scoped, and release constructs a new brief from approved display names, versions, indicators and a fixed sequence vocabulary. It does not forward command lines or attempt to remove every possible secret from arbitrary log text. Coarse search windows and threshold-only counts reduce unnecessary detail while retaining investigative utility.

This limits extensibility: new evidence types require schema, policy, display and adversarial-test changes. Small cohorts and distinctive patterns can still permit inference; the current controls do not guarantee anonymity.

## Separate the static demo from the local pilot

Public GitHub Pages hosts only fictional approved outputs. The persistent operator/participant workflow stays local. Visitors can explore the core behavior without receiving administrative access or needing a Chainlink account. The tradeoff is that the public site does not demonstrate production multi-tenant delivery or execute the backend.

## Use a local audit chain with explicit limits

A hash-linked audit record detects inconsistent local changes and is verified at startup. Transactions couple important state changes and audit appends; failure tests verify rollback of admitted observations and nonces. A database owner can still rewrite or truncate a complete chain. External anchoring or independent audit custody would add a different trust boundary and is not implemented.

## Keep confidential execution and ZK separate

The CRE entry point expresses the intended confidential processing boundary and compiles to WASM. A TEE design still trusts hardware/runtime assumptions and its input sources. A zero-knowledge proof establishes a specified computation or statement under different assumptions. Neither is a synonym for the other.

The project deliberately avoids adding ACE, CCIP, ZK claims or on-chain outputs just to expand the technology list. Each future integration needs a concrete purpose, a documented statement/guarantee and meaningful failure tests.

## Evaluation scenarios

| Scenario | Expected result | Failure guarded against |
| --- | --- | --- |
| Matching supplier/version/domain and supporting sequence at three enrolled organizations | Approved fictional brief, if current release rules permit | Missing the supported demonstration case |
| Fifty reports from one organization | No brief | Counting report volume as distinct corroboration |
| Shared destination without supporting sequences | No brief | Treating ordinary destination overlap as sufficient evidence |
| Expired source evidence | No brief; pilot admission rejects stale timestamps | Reusing stale observations |
| Revoked member or collector | Exclude contributions; threshold may no longer hold | Delivering evidence using revoked authority |
| Consent withdrawal or recipient/domain policy change | Recompute/deny subsequent release | Stale authorization or suppressed contributors supporting a claim |

These scenarios and the adversarial tests are evidence about the implementation, not real-world precision/recall, operational anonymity or deployed confidential guarantees.
