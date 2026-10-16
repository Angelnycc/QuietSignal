# QuietSignal

Share useful threat evidence with trusted participants while withholding unrelated sensitive information. QuietSignal is an early prototype for correlating suspicious software-supplier activity across organizations. Individually ambiguous events can become a useful investigation lead when independent organizations observe the same supplier, version, destination, and event sequence.

The product goal is selective evidence sharing: recipients should receive enough evidence to investigate a threat without receiving contributors' full logs, employee information, internal network details, or unrelated activity. A synthetic member-brief generator and an authenticated local pilot now demonstrate this disclosure policy. Remote encrypted delivery and real-source integration remain future steps. See [the evidence-sharing policy](docs/evidence-sharing.md).

## Current implementation

- Strictly validated, deterministic correlation rules.
- Three distinct enrolled organizations, including two reporting an update → connection → unusual child-process sequence, within a rolling 30-minute window.
- Duplicate suppression, collector authorization, membership expiry/revocation, source freshness, and bounded alert validity.
- A security-themed project website and a separate authenticated incident workspace.
- Persistent SQLite runs/incidents, per-principal acknowledgement, approved evidence downloads, enrollment/collector controls, participant access files and a scoped audit trail.
- Ed25519 signed synthetic collector admission, persistent nonce replay checks, strict event scope, bounded requests and controlled simulations that exercise the same ingestion endpoint.
- Policy-approved evidence briefs with a relevant destination, approved software/version, sanitized sequence, coarse search window, threshold corroboration, expiry, and limitations. Contributor consent and eligible-recipient checks are modeled with a trusted mock roster.
- A Chainlink CRE Confidential Workflow entry point that fetches the snapshot inside a TEE handler and releases only a minimal summary through `usingTheDons()`.

**This is a controlled local pilot using synthetic observations.** The local operator controls test enrollment and built-in collector keys. Registered-key signatures establish key possession, not event truth or independent organizations. The authenticated pilot is separate from the unauthenticated fictional showcase endpoints, and the server remains loopback-only. The CRE workflow still reads the fictional fixture snapshot and exports only aggregate status; it does not process the pilot database or deliver member briefs through CRE. No real monitoring, production TEE, ZK proof, ACE, CCIP, chain deployment, or firewall enforcement is implemented. Read the [security model](docs/security-model.md) for exact boundaries.

## Local development

Requires Bun 1.3.11+ (the lockfile was generated with 1.3.11).

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run build
bun run demo
bun run dev
```

The last command starts the website, authenticated pilot and fictional fixture service on loopback port 8787. The website is `/`; the pilot workspace is `/app`. On the server machine, choose `.quietsignal/operator-access.json` in the login file picker; it is a generated application credential, not a Chainlink API key. Keep it private and out of chat/Git. Cloud localhost is not your laptop’s localhost, and public website activation is tracked in [the publishing guide](docs/publishing.md).

Start a controlled run, review/acknowledge a brief, issue a participant access file, and test how consent and collector revocation change delivery. See the [pilot guide](docs/local-pilot.md), [API contract](docs/api.md), and [security model](docs/security-model.md). Nothing is blocked or broadcast.

```sh
bun run format:check
bun run check:pilot
```

The pilot browser check uses an isolated temporary database and generated test credentials, never your development access files. It checks real HTTP flows, all five scenarios, downloads, consent, revocation, participant permissions, audit and mobile layout.

## Website

The security-themed website combines the project overview, an animated consortium diagram, a three-step product walkthrough, the scenario dashboard, a selective-disclosure walkthrough, architecture/status information, and an FAQ. The dashboard supports scenario reset and download of the approved fictional evidence brief as JSON. Disclosure tabs and the mobile navigation support keyboard interaction.

```sh
bun run build:web
```

This generates a self-contained static website at `dist/index.html`. It uses no external fonts, analytics, images, or runtime network calls. Its five fictional scenario outputs are generated from the same tested correlation and disclosure functions. The static build is prepared for GitHub Pages in the dedicated [Angelnycc/QuietSignal](https://github.com/Angelnycc/QuietSignal) repository. See [publication status](docs/publishing.md) for hosting activation and verification.

For repeatable browser verification, with Python Playwright and Chromium installed:

```sh
bun run check:web
```

The check exercises all scenarios, the evidence JSON download, disclosure tabs, FAQ, internal links, mobile navigation, and five screen widths. Screenshots are written to `dist/website-checks`. The cloud browser blocks file URLs, so the check loads the exported document's exact contents without altering browser policy. It verifies that no external network request occurs.

For a standalone review demo, run `bun run export:demo` and open `dist/quietsignal-demo.html` in a browser. All five scenarios work offline with fixed fictional outputs produced by the same correlation and disclosure functions. No credentials, installation on the reviewer's computer, or deployment is needed. The demo contains no raw roster or event records.

CRE authentication and deployment access are not prerequisites for this local prototype. CRE runtime authentication and confidential deployment remain deferred; publishing the synthetic website is a separate operation.

## Native CRE simulation

Requires the CRE CLI (prepared cloud version: v1.38.0), a Chainlink account authenticated in the execution environment, and the SDK WASM tools:

```sh
cd correlation
bunx cre-setup
cd ..
```

Keep `bun run dev` running in another terminal, then from the project root:

```sh
cre workflow simulate correlation --target local-simulation --non-interactive --trigger-index 0
```

Do not add `--broadcast`. The local handler has no report, receiver, EVM client, or transaction path. Local simulation does not require Confidential Workflows private-beta enrollment, but deployed confidential execution does. Authentication is not inherited from a login on a different computer. Use browser-completed `cre login` on a suitable machine, or securely supply an approved `CRE_API_KEY` through environment settings. Never commit credentials or paste them in chat.

**Validation status:** see `docs/validation.md`. Unit tests or the Bun demo are not substitutes for native CRE simulation.

## Privacy boundary

The local fixture source exposes its synthetic roster and observations to the developer. In a deployed design, full source records and contributor identifiers stay within the authorized processing boundary. An explicit disclosure policy selects useful evidence for trusted recipients; useful indicators are not inherently secret. The CRE workflow returns only mode, policy version, evaluation time, expiry, and a status. It returns no raw domain hash, avoiding publication of a guessable domain commitment. The local `/api/member-demo` route remains a fixed-recipient fictional showcase. The `/api/pilot` routes authenticate participants and recheck current release permission for every list/detail/review/download request. The local database and host are trusted; remote encrypted delivery and confidential processing of pilot records remain unimplemented.

This is a TEE design, not a claim of zero-knowledge security. Local simulation does not provide enclave confidentiality. Even a deployed TEE cannot establish that an upstream source told the truth. Threshold warnings indicate corroboration, not proof of maliciousness. Public status and timing can still leak aggregate information; production requires an explicit output policy.

## Next milestones

1. Review the tested local pilot and its selective evidence release behavior.
2. Add independently managed membership and one narrowly scoped authenticated source connector. Test the source-authenticity statement explicitly; collector signatures alone do not prove events occurred.
3. Connect authorized pilot snapshots and recipient release decisions to confidential CRE execution. Keep member briefs out of ordinary DON logs and public reports.
4. When ready, validate native CRE simulation using supported authentication, then separately validate deployed confidential execution with a documented threat model.
5. Prepare remote TLS, identity/key management, retention/encryption, inference controls and an independent review before external use. Add ACE access policy and CCIP delivery only where their guarantees are needed.
6. Confirm a supported DECO integration for a specific source-verification requirement; do not assume it supplies private correlation or anonymous membership automatically.

A GitHub Actions workflow is prepared to run the locked install, tests, type/format checks, workflow build and browser suites without account credentials; remote execution is unverified. The user has now authorized publication of the tested pilot and website to Angelnycc/QuietSignal. Source publication, static hosting and confidential CRE deployment are separate milestones; see [publication status](docs/publishing.md).

## Development guidance

Use the existing isolated checkout; do not create a Git worktree unless explicitly requested. Chainlink's CRE skill is installed locally under `.agents/skills/chainlink-cre-skill` and ignored by Git. To install it on another checkout:

```sh
npx skills add smartcontractkit/chainlink-agent-skills --skill chainlink-cre-skill --agent codex --yes --copy
```

The official confidential TypeScript template was copied after `cre init` failed for missing cloud authentication; all sample workflow logic/configuration was replaced. Sources: [CRE skill](https://github.com/smartcontractkit/chainlink-agent-skills/tree/main/chainlink-cre-skill), [Confidential Workflows](https://docs.chain.link/cre/concepts/confidential-workflows), [access](https://docs.chain.link/cre/account/confidential-workflows-access).
