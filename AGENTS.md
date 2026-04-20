# Repo Agent Notes

## Git and deployment workflow

- Make changes in the repo, then stage the relevant files with `git add`.
- Create a commit with a clear message.
- Push the branch to GitHub instead of deploying an uncommitted working tree directly to any production host.
- Prefer Git-based deploy promotion through the connected AWS Amplify apps where possible, but verify which runtime is actually serving `certscore.ai` and `consentcheck.site` before claiming production is updated.
- Do not run `npx vercel deploy --prod` unless the user explicitly asks for a direct Vercel CLI deploy or the Git-based Amplify path is unavailable.

## Production expectation

- Treat dual AWS Amplify apps as the preferred target web topology:
  1. `certscore.ai`
  2. `consentcheck.site`
- A push to `main` is not enough to claim either host is live; for web changes, confirm the intended Amplify app has completed a healthy build and the public host is serving the expected revision.
- If the active production host is uncertain, call it out before claiming a change is live in production.
- `apps/web` remains the canonical root for both web hosts in Amplify.
- Use `pnpm ops:check:deploy` after deployment-topology changes to catch stale local assumptions and wrong remotes before treating the path as healthy.
- Legacy GCP VM and Vercel files may remain temporarily as rollback tooling, but they are not the preferred steady-state web deployment path.

## Scope note

- These instructions apply to the web app deployment path.
- Worker deployments still use the existing GCP deployment flow and helper scripts unless the user asks to change that setup.

## Finding flow note

- New `WC01` finding surfacing or gating logic should prefer this order:
  1. normalize inputs into a concern
  2. apply concern policy
  3. promote eligible concerns into unified findings
- Avoid adding new raw signal-key or raw policy-row gating paths when the same rule can live in the normalized concern pipeline.
