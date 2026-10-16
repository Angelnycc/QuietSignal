# Interactive website preview

The user explicitly requested a browser-accessible public website on 2026-10-16. The existing GitHub connection can write the connected repository but cannot create a new repository or enable GitHub Pages: those operations returned HTTP 403, `Resource not accessible by integration`.

The tested, self-contained `dist/index.html` has been uploaded to the isolated `quietsignal-preview` branch of `Angelnycc/sports-settlement-oracle`, commit `0f4c1a79ec7560d488223fa103b0d9a779b0406a`. This orphan branch contains exactly `index.html` and `.nojekyll`. Its HTML was downloaded through the GitHub API and verified byte-for-byte against the tested build. No application source, private local state, collector/access files, or backend was uploaded; the original project's main branch was not modified.

## Activation requiring the repository owner

Open `https://github.com/Angelnycc/sports-settlement-oracle/settings/pages`. Choose **Deploy from a branch**, select **quietsignal-preview** and **/ (root)**, then **Save**. This is a GitHub permission boundary, not a CRE authentication requirement. The user has been asked to enable this setting.

The expected address after a successful Pages build is `https://angelnycc.github.io/sports-settlement-oracle/`. Do not describe that address as live until Pages is enabled and the build succeeds. Read `/repos/Angelnycc/sports-settlement-oracle/pages` and `/pages/builds/latest` through the supported GitHub API connection, inspect the build state, and verify an external HTTP/browser request if available. This environment's outbound policy currently blocks unrelated preview providers; it may also block the public Pages hostname, which is distinct from a site failure.

This static preview provides the project website, five interactive fictional scenarios, evidence download, policy walkthrough, mobile navigation and FAQ. It requires no login or installation. It does not host the authenticated persistent backend or monitor real devices. The offline export replaces the local workspace link with a status anchor. The full QuietSignal source repository remains local pending its separate publication; this deployment branch is only a website preview.

Future website updates should build and check the static artifact, then update only the preview branch. Keep private/runtime files out of the deployment. Preserve the original repository's main branch and avoid changes to existing Pages configuration if another owner subsequently uses it.
