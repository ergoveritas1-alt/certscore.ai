# Repo Agent Notes

## Git and deployment workflow

- Make changes in the repo, then stage the relevant files with `git add`.
- Create a commit with a clear message.
- Push the branch to GitHub instead of deploying the current working tree directly to Vercel.
- Prefer Git-based production deploys through the connected GitHub repository.
- Do not run `npx vercel deploy --prod` unless the user explicitly asks for a direct Vercel CLI deploy or the Git-based deploy path is unavailable.

## Production expectation

- Treat a push to `main` as the preferred way to promote web changes, but do not assume that alone makes `consentcheck.site` live because the current hardened production host terminates on the fixed-egress VM.
- If that Git-to-Vercel linkage is uncertain, call it out before claiming a change is live in production.
- The canonical Vercel web project is `consentcheck-site`, and its root directory must stay `apps/web`.
- Do not link repo root or the removed `apps/validation-web` path to the production Vercel project.
- If the local Vercel link needs to be repaired, relink with `npx vercel link --yes --scope ergoveritas1-5549s-projects --project consentcheck-site --cwd apps/web`.
- Use `pnpm ops:check:deploy` after deployment-topology changes to catch stale local links and wrong remotes before treating the path as healthy.
- The current hardened production path for `consentcheck.site` and `www.consentcheck.site` is the `certscore-web-prod` VM at `34.69.91.225`, fronted by `/etc/caddy/Caddyfile`, because the production database only allows fixed egress.

## Scope note

- These instructions apply to the web app deployment path.
- Worker deployments still use the existing GCP deployment flow and helper scripts unless the user asks to change that setup.

## Finding flow note

- New `WC01` finding surfacing or gating logic should prefer this order:
  1. normalize inputs into a concern
  2. apply concern policy
  3. promote eligible concerns into unified findings
- Avoid adding new raw signal-key or raw policy-row gating paths when the same rule can live in the normalized concern pipeline.
