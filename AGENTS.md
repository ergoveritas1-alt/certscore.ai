# Repo Agent Notes

## Git and deployment workflow

- Make changes in the repo, then stage the relevant files with `git add`.
- Create a commit with a clear message.
- Push the branch to GitHub instead of deploying an uncommitted working tree directly to any production host.
- Prefer Git-based deploy promotion through the connected AWS ECS deployment workflows, but verify which runtime is actually serving `certscore.ai` before claiming production is updated.

## Production expectation

- Treat the AWS ECS/Fargate service for `certscore.ai` as the preferred target web topology.
- `consentcheck.site` is not a WC01 web host and WC01 must not claim or deploy it.
- A push to `main` is not enough to claim either host is live; for web changes, confirm the intended ECS deployment has completed successfully and the public host is serving the expected revision.
- If the active production host is uncertain, call it out before claiming a change is live in production.
- `apps/web` remains the canonical root for the CertScore public web host.
- Use `pnpm ops:check:deploy` after deployment-topology changes to catch stale local assumptions and wrong remotes before treating the path as healthy.

## Scope note

- These instructions apply to the web app deployment path.
- Worker deployments in `WC01` should follow the AWS validation deployment path and helper scripts.

## Finding flow note

- New `WC01` finding surfacing or gating logic should prefer this order:
  1. normalize inputs into a concern
  2. apply concern policy
  3. promote eligible concerns into unified findings
- Avoid adding new raw signal-key or raw policy-row gating paths when the same rule can live in the normalized concern pipeline.
