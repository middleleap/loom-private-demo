# Private Open Finance planning illustration

This source stays in the private repository and outside the served `dist/` root. It is an authored Meridian Trust PFM/payment-initiation story, not executed evidence. The existing operations queue and recorded repair/check/reuse records are a separate scenario.

Generated using `scripts/customer-demo-illustration.mjs` from ai-dlc commit `314ae8e` (source PR https://github.com/middleleap/ai-dlc/pull/73). Base deployment package: private-demo commit `4bc45935080add5a21ae24a900d676aecbfbbd71`.

Reproduce by extracting that base commit into a fresh directory, then running:

```sh
node /path/to/ai-dlc/scripts/customer-demo-illustration.mjs /path/to/base-package private-source/open-finance-illustration.json /path/to/new-package
```

Copy the generated `dist/` from the new package into the deployment checkout. Retain this private source for future regeneration. Do not layer repeatedly onto an already illustrated package. The gateway, Dockerfile, recorded evidence, domain and transport remain byte-identical to the base package.

## Verification

- Two generator tests pass; marketplace validation passes.
- Live existing root and direct index route redirect anonymous requests to login with no-store/noindex headers.
- Local candidate tested through the unchanged gateway: new HTML/CSS and recorded evidence redirect anonymous requests; authenticated access works; private source URL returns 404.
- 390/1440px browser checks: keyboard disclosure access, blocked-release text, no horizontal overflow, no serious/critical axe violations and no CSP/browser errors. Captures are in `review/`.
- The tests use an ephemeral local fixture password, never the hosted secret. No hosted authenticated test or deployment of this revision has occurred.

Deploy via the existing password gateway only. Merging this deployment PR targets the current Railway main-branch deployment; verify authenticated and anonymous access on both approved hosts after rollout. No changes to secrets, allowed hosts, DNS or the public website are required.
