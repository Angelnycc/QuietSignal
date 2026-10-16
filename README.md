# QuietSignal

Share useful threat evidence with trusted participants while withholding unrelated sensitive information. QuietSignal is an early prototype for correlating suspicious software-supplier activity across organizations. Individually ambiguous events can become a useful investigation lead when independent organizations observe the same supplier, version, destination, and event sequence.

The product goal is selective evidence sharing: recipients should receive enough evidence to investigate a threat without receiving contributors' full logs, employee information, internal network details, or unrelated activity. A synthetic member-brief generator now demonstrates this disclosure policy. Authenticated, encrypted delivery to real participants is still a future step. See [the evidence-sharing policy](docs/evidence-sharing.md).

## Current implementation

- Strictly validated, deterministic correlation rules.
- Three distinct enrolled organizations, including two reporting an update → connection → unusual child-process sequence, within a rolling 30-minute window.
- Duplicate suppression, collector authorization, membership expiry/revocation, source freshness, and bounded alert validity.
- A local synthetic fixture service and interactive demonstration dashboard.
- Policy-approved evidence briefs with a relevant destination, approved software/version, sanitized sequence, coarse search window, threshold corroboration, expiry, and limitations. Contributor consent and eligible-recipient checks are modeled with a trusted mock roster.
- A Chainlink CRE Confidential Workflow entry point that fetches the snapshot inside a TEE handler and releases only a minimal summary through `usingTheDons()`.

**No real organization data, production TEE, ZK proof, ACE integration, CCIP delivery, chain deployment, or firewall enforcement is implemented.** The enrollment roster is a trusted mock authority. The fixture service is not authenticated and must remain loopback-only. The member-demo endpoint uses a fixed fictional recipient, not a logged-in user. The CRE workflow itself still exports only aggregate status; member briefs are generated in the local demo, not delivered through CRE. Synthetic timestamps and event labels do not establish that real incidents occurred.

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

The last command starts a loopback-only dashboard and fixture service on port 8787. The five scenarios demonstrate a corroborated pattern, repeated reports from one member, harmless destination overlap, expired evidence, and revoked membership. Nothing is blocked or broadcast.

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

The local fixture source exposes its synthetic roster and observations to the developer. In a deployed design, full source records and contributor identifiers stay within the authorized processing boundary. An explicit disclosure policy selects useful evidence for trusted recipients; useful indicators are not inherently secret. The CRE workflow returns only mode, policy version, evaluation time, expiry, and a status. It returns no raw domain hash, avoiding publication of a guessable domain commitment. The local `/api/member-demo` route demonstrates the approved brief separately; production member delivery is not implemented.

This is a TEE design, not a claim of zero-knowledge security. Local simulation does not provide enclave confidentiality. Even a deployed TEE cannot establish that an upstream source told the truth. Threshold warnings indicate corroboration, not proof of maliciousness. Public status and timing can still leak aggregate information; production requires an explicit output policy.

## Next milestones

1. Authenticate this execution environment and validate the native CRE simulation.
2. Replace the mock roster with independently managed membership and connect one authenticated evidence source.
3. Connect the tested brief generator to authenticated, encrypted member delivery and prevent membership-probing queries. Move the release decision inside the confidential workflow without exporting plaintext briefs through ordinary DON logs or public reports.
4. Validate deployed confidential execution with beta access and a documented threat model.
5. Add ACE-backed access policies and, where needed, CCIP delivery with version/expiry/replay checks.
6. Investigate a supported DECO integration for a specific source-authenticity statement; do not assume it supplies private correlation or anonymous membership automatically.

## Development guidance

Use the existing isolated checkout; do not create a Git worktree unless explicitly requested. Chainlink's CRE skill is installed locally under `.agents/skills/chainlink-cre-skill` and ignored by Git. To install it on another checkout:

```sh
npx skills add smartcontractkit/chainlink-agent-skills --skill chainlink-cre-skill --agent codex --yes --copy
```

The official confidential TypeScript template was copied after `cre init` failed for missing cloud authentication; all sample workflow logic/configuration was replaced. Sources: [CRE skill](https://github.com/smartcontractkit/chainlink-agent-skills/tree/main/chainlink-cre-skill), [Confidential Workflows](https://docs.chain.link/cre/concepts/confidential-workflows), [access](https://docs.chain.link/cre/account/confidential-workflows-access).
