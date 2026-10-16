# Security policy

QuietSignal 0.1.x is a portfolio/research pilot using synthetic observations. The public website is a fictional static demonstration. The persistent backend is intended for a trusted developer on loopback and is not supported as a production monitoring, firewall or multi-organization security service.

The [security model](docs/security-model.md) records implemented controls and remaining trust assumptions. A signed observation is not proof that an event occurred; a local audit hash chain is not an immutable ledger; a WASM build is not proof of confidential execution.

## Reporting an issue

Use GitHub's private vulnerability reporting when it is available on this repository. If no private reporting option is offered, open a minimal issue asking the maintainer for a private reporting channel without including exploit details or sensitive records. Do not post credentials, private keys, access files, full logs, real organization identifiers or production data.

A useful private report identifies the affected commit, the trust boundary crossed, a reproduction using only synthetic data, expected versus observed behavior, and the likely impact. Reports are reviewed on a best-effort basis; no response-time or production-support commitment is implied.

## Scope

Relevant areas include collector signature/context verification, replay and conflict handling, session/CSRF/role enforcement, revocation races, evidence disclosure, sensitive error/output leakage, and persistence/audit consistency. Documentation errors that overstate a security guarantee are also useful reports.

Test only systems and accounts you own or are authorized to evaluate. The public site does not provide permission to test GitHub infrastructure or any third party.
