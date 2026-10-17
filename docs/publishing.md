# Website publication

The user-provided repository is https://github.com/Angelnycc/QuietSignal.git. It is public and Git/API access was verified on 2026-10-16. Publish only to this repository. Do not use or modify sports-settlement-oracle.

The tested source belongs on main. The generated, self-contained dist/index.html belongs on the separate gh-pages branch together with .nojekyll. Only fictional approved outputs are embedded in that website; no raw roster, event records, private access/collector files or backend state should be deployed. The static website contains five interactive scenarios, approved evidence downloads, selective-sharing walkthrough, FAQ and mobile navigation. It does not host the authenticated persistent backend or real monitoring.

For GitHub Pages, the repository owner can select Settings → Pages → Deploy from a branch → gh-pages → / (root) → Save. The expected address is https://angelnycc.github.io/QuietSignal/ after a successful build. Do not describe it as live before Pages activation and successful deployment are verified. If the GitHub integration cannot enable Pages (HTTP 403), prepare and push the branch, then request only that account setting. No CRE API key or personal token is needed in chat.

## Confirmed deployment

GitHub Pages reports status `built` at https://angelnycc.github.io/QuietSignal/. The initial website deployment run 38959195231 and full CI run 38959176127 both completed successfully on 2026-10-16. The public site was built from the gh-pages branch; the main branch holds source and documentation. The exported document passed local browser interactions. A direct HTTP request to the public hostname from this workspace was blocked by the outbound proxy (403), so public-URL browsing from this machine is not independently verified. This proxy response is not a response from the deployed website.

## Refreshed portfolio website (2026-10-17)

The primary portfolio URL is https://quietsignal.netlify.app/. GitHub Pages at
https://angelnycc.github.io/QuietSignal/ is a mirror. Both hosts build the same
`web/index.html` template from `main` using `bun run build:web`. The exporter embeds
five approved fictional scenarios and a hash-based script policy in a single HTML
file, so no API or external script is required. Fixture dates reflect build-time
samples, not current incident validity. Browser consent/recipient switches are
illustrative disclosure controls, not authentication.

GitHub Actions publishes Pages only after the main-branch validation job passes.
Pages must use **GitHub Actions** as its build source. The historical `gh-pages`
branch is retained for earlier exports; it is no longer the source of new Pages
deployments. Use the generated `dist` output for standalone downloads.

To keep the existing Netlify project synchronized, link **that existing project**
to `Angelnycc/QuietSignal`, select `main`, and use the committed `netlify.toml`:

- Build command: `bun install --frozen-lockfile && bun run build:web`
- Publish directory: `dist`
- Base directory: repository root (empty)

Do not create another Netlify project or upload unrelated source folders. An old
manual-drop deployment does not establish Git integration. Once linked, pushes to
`main` trigger both hosts. Verify Netlify's deployed commit and the Pages workflow
before claiming that a particular revision is live. Generated fixture timestamps
can differ between hosts even when they use the same source commit.
