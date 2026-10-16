# Development guide

Use the existing checkout and Bun 1.3.11. No Chainlink account credentials are needed for the local pilot, tests, static site or WASM compilation.

```sh
bun install --frozen-lockfile
bun test
bun run typecheck
bun run format:check
bun run build:web
```

For a workflow WASM build, run `bunx --no-install cre-setup` and `bun run build`. This prepares SDK tools; it does not authenticate or deploy the workflow.

The browser checks require Python Playwright 1.62.0 and Chromium. An isolated setup is:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install playwright==1.62.0
python -m playwright install chromium
bun run check:web
bun run check:pilot
```

On Linux, browser system dependencies may require `python -m playwright install --with-deps chromium`. If a system Chromium is installed, the checks use it; `CHROMIUM_EXECUTABLE` selects an explicit path. Pilot browser tests use temporary credentials and databases, never development access files.

Changes to authentication, admission, membership, timing or disclosure should include meaningful adversarial tests. Preserve reauthorization on incident list/detail/acknowledgement/download, strict schemas and the distinction between key possession and truthful telemetry. Do not weaken checks, include raw error details, or copy real logs into fixtures to make a test pass.

For website changes, run both `bun run build:web` and `bun run check:web`. Keep the standalone export self-contained and the fictional-data notice visible. Refresh curated screenshots only from synthetic test runs. Changes to the local workspace also require `bun run check:pilot`.

Keep `.quietsignal`, `.venv`, `.env` files, private keys, access files, SQLite data, dependency directories and generated build output out of source control. Never include credentials or real organization records in issues or pull requests. See [the security policy](SECURITY.md), [security model](docs/security-model.md) and [local pilot guide](docs/local-pilot.md).

Describe a proposed change's concrete behavior, validation and relevant limitations. Claims about source authenticity, real-world detection, enclave isolation, ZK, ACE or CCIP require evidence beyond local tests.
