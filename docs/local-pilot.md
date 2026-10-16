# Controlled local pilot

QuietSignal now has two browser experiences: the public-facing fictional showcase at `/`, and an authenticated, persistent pilot workspace at `/app`. Both run on the same loopback server. All observations in this version are explicitly synthetic. The showcase never reads pilot records.

## Start and review

From the project directory, with Bun 1.3.11 available:

```sh
bun install --frozen-lockfile
bun run dev
```

On the **machine running that command**, open `http://127.0.0.1:8787/app`. Choose `.quietsignal/operator-access.json` in the login file picker. This application-generated credential is separate from a Chainlink account or API key. The server prints the file's path, never its contents. If the server runs in a cloud workspace, your laptop's localhost and file chooser do not point to the cloud machine. The public GitHub Pages website hosts only the fictional static showcase; this persistent backend is not publicly hosted.

The operator access file grants full pilot administration. Keep it off chat, screenshots, source control, and shared downloads. Private local state has a directory mode of 0700 and key/access files use 0600 on Unix systems. The browser clears the login inputs after use and does not store credentials in localStorage.

1. Sign in, select **Shared suspicious sequence**, and start a controlled run. Three separately keyed test collectors submit signed observations through the same admission endpoint as external test collectors.
2. Open the incident, acknowledge it, and download the approved fictional evidence brief. Each principal has a separate acknowledgement state.
3. In **Sharing policy**, withdraw one test member's evidence-sharing consent. The brief disappears because the remaining consenting contributions do not reach the threshold. Restoring consent makes eligible evidence available again.
4. In **Collectors**, revoke a collector. Its stored evidence no longer contributes. Restoring activation permits eligible stored evidence to contribute again; restoration is not key rotation.
5. Issue a participant access file from a member card. Open it in a separate browser profile to review that member's view, sharing preference, and own audit actions. Participants cannot administer collectors, other members, or release policies.
6. Inspect **Audit trail**. Its local hash chain detects inconsistent edits, but a database owner can rewrite the entire chain. It is not an immutable ledger.

The other controlled scenarios demonstrate repeated reports from one organization, connection-only overlap, stale evidence rejected during admission, and revoked membership. Runs are isolated; a new active run replaces the feed's evaluation scope while earlier records remain stored. The reset checkbox explicitly restores the three seed memberships, sharing consent, and collector activation. It does not reactivate revoked participant access keys or change the disclosure allowlist. No run starts automatically.

## External synthetic collector

This utility permits a separate process to sign a narrowly scoped test observation. It is not a laptop sensor, Wi-Fi monitor, or firewall.

```sh
bun run collector -- generate collector-lab demo-alpha .quietsignal/collector-lab.json
```

Register the printed **public** key under the matching collector and organization in the workspace. The private file remains local and must never be uploaded. Generate refuses to overwrite an existing file. To rotate, register a new collector/key, revoke the old collector, and retire the old private material.

Create a JSON observation file with exactly the documented fields. For a connection observation, use `kind`, `eventId`, `organizationId`, `collectorId`, `supplierId`, `softwareVersion`, `destination`, and `connectionAtMs`. `kind` is `new-destination`; the time is a current Unix millisecond timestamp. A supporting sequence uses `kind: post-update-process-chain` plus `updateAtMs` and `childProcessAtMs`. The sequence must satisfy update ≤ connection ≤ child process, span at most ten minutes, and fall within the thirty-minute evidence window. Use a fresh event ID for each observation. See `correlation/model.ts` for the strict schema; arbitrary log fields are rejected.

Obtain the nonsecret workspace UUID from the authenticated `/api/pilot/session` response and the active run UUID from `/api/pilot/incidents` or the controlled-run response. Substitute those UUIDs below:

```sh
bun run collector -- submit http://127.0.0.1:8787 WORKSPACE_UUID RUN_UUID .quietsignal/collector-lab.json observation.json
```

The utility only sends to a loopback HTTP origin, refuses redirects, and has a ten-second timeout. It signs the exact request body with Ed25519. A registered signature establishes possession of an enrolled collector key, not that an event is true or an organization is independent. The three built-in test keys are intentionally held by this one local operator.

## Local operation and recovery

- Set `QUIETSIGNAL_PORT` to choose another unprivileged loopback port; default 8787. Set `QUIETSIGNAL_STATE_DIR` to an isolated absolute directory to create a separate workspace. Do not run multiple server processes against the same state directory.
- SQLite uses transactions, foreign keys, WAL, synchronous FULL, a five-second busy timeout, and schema version 1. Newer database versions fail closed. The audit chain is checked when opening state.
- Stop the server cleanly with SIGINT/SIGTERM before backing up the entire state directory. Preserve the database together with its matching operator and collector material. Encrypt backups and restrict access; SQLite content itself is not encrypted. Do not copy only a live database file and omit its WAL.
- Restore the matching backup to an isolated directory, start with `QUIETSIGNAL_STATE_DIR`, then check health, sign-in, incidents and audit. Automated tests verify restart preservation; a full operational backup restore drill is still a deployment requirement.
- Missing or mismatched operator/collector files fail startup. There is no silent administrator reset. Do not delete individual access files hoping to recover access; restore matching state instead. Starting a separate empty state directory creates a distinct workspace, not access to the old one.
- Participant access files expire after at most seven days; sessions after at most eight hours. **Revoke access files** invalidates all that member's participant keys and sessions. Membership deactivation invalidates sessions and excludes evidence; membership reactivation can allow an otherwise valid, unrevoked access file to log in again.
- The feed evaluates only the active run, current consent, membership, collector activation, release allowlists, and evidence validity. List, detail, acknowledgement and download routes all recheck disclosure. Previously downloaded evidence cannot be recalled. The UI refreshes the incident feed every fifteen seconds while visible; it does not overwrite unfinished policy forms with background refreshes.
- An empty recipient allowlist suspends all brief delivery, including operator previews. Restoring eligible recipients restores otherwise valid evidence. Supplier display names are labels, not incident identifiers. Independent matching findings expire according to their own evidence.
- JSON admission is limited to 16 KiB, login to 4 KiB, and the outer HTTP server to 32 KiB. A run admits at most 1,000 observations; enrollment is bounded at 100 organizations and 20 collectors per organization. Signatures allow two minutes of clock skew. Nonces persist for five minutes. Process-local one-minute limits include 600 ingestion attempts per address, 120 per collector, eight login attempts per address, and sixty mutations per session.
- Earlier runs and audit records are retained. Automatic retention, total disk quotas, distributed rate limiting, key-management services and production availability controls are not implemented. Use synthetic data and keep this server loopback-only.
- Rejection audit entries are sampled to at most thirty per address per minute, with no audit append for rate-limit errors. Accepted evidence/policy actions remain audited; rejected-request sampling is not a complete incident ledger.

## Checks

```sh
bun test
bun run typecheck
bun run format:check
bun run build
bun run build:web
bun run check:web
bun run check:pilot
```

The browser checks require Python Playwright and Chromium. `check:pilot` creates disposable keys, sessions and a database, exercises actual HTTP/UI flows, removes its private test state, and retains only screenshots under `dist/pilot-checks`. It never reads development operator or collector credentials.

No Chainlink credentials, native CRE simulation, remote delivery, deployment, GitHub publication, or transaction broadcast is needed for these checks.
