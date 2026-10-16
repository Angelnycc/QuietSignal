# Website publication

The user-provided repository is https://github.com/Angelnycc/QuietSignal.git. It is public and Git/API access was verified on 2026-10-16. Publish only to this repository. Do not use or modify sports-settlement-oracle.

The tested source belongs on main. The generated, self-contained dist/index.html belongs on the separate gh-pages branch together with .nojekyll. Only fictional approved outputs are embedded in that website; no raw roster, event records, private access/collector files or backend state should be deployed. The static website contains five interactive scenarios, approved evidence downloads, selective-sharing walkthrough, FAQ and mobile navigation. It does not host the authenticated persistent backend or real monitoring.

For GitHub Pages, the repository owner can select Settings → Pages → Deploy from a branch → gh-pages → / (root) → Save. The expected address is https://angelnycc.github.io/QuietSignal/ after a successful build. Do not describe it as live before Pages activation and successful deployment are verified. If the GitHub integration cannot enable Pages (HTTP 403), prepare and push the branch, then request only that account setting. No CRE API key or personal token is needed in chat.

## Confirmed deployment

GitHub Pages reports status `built` at https://angelnycc.github.io/QuietSignal/. The initial website deployment run 38959195231 and full CI run 38959176127 both completed successfully on 2026-10-16. The public site was built from the gh-pages branch; the main branch holds source and documentation. The exported document passed local browser interactions. A direct HTTP request to the public hostname from this workspace was blocked by the outbound proxy (403), so public-URL browsing from this machine is not independently verified. This proxy response is not a response from the deployed website.
