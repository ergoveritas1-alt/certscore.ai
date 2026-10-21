# CertScore.ai report and local capture release

## Scope

Release the reviewed report Share-menu cleanup, authenticated custom-header PDF
links, GPC details placement and duration wording, and the locally gated capture
diagnostics. Local adaptive captures and expanded request retention remain
development-only; this release does not enable those policies in production.
Existing production scores, disclosure policy, observation budgets and capacity
are unchanged.

The canonical marketing sample now points to a fresh production scan of
`https://ergoveritas.com/test1.html`:

- Scan: `bfbe7f5b-d46f-438e-a898-411e44d2571b`.
- Created: `2026-10-21T03:05:19.783Z`.
- Completed: `2026-10-21T03:05:30.007Z`.
- Public report: `https://certscore.ai/scan/bfbe7f5b-d46f-438e-a898-411e44d2571b`.
- Canonical JSON export verified completed, with the exact requested target and
  GDPR/ePrivacy score 28 before selecting it as the sample.

The owner explicitly authorized a fresh production sample as part of deployment.
It was submitted once through the normal `/api/full-scan` endpoint, with fresh
reuse disabled and an idempotent request ID. No production database credentials,
test authentication sessions, synthetic findings or local evidence were copied
into production. The development sample override remains restricted to
`development` and `http://localhost:3000`.

## Preservation and release gates

Main is the only active branch/worktree at release preparation. Earlier managed
worktrees have recoverable archived snapshots. The reviewed contact-ledger commit
is preserved. Local scan JSON, PDF, workpapers and verification receipts remain
at their original ignored local paths and are not release inputs. No unreachable
Git objects are pruned.

Use the existing AWS deploy-all consumer-before-producer path. Verify the exact
committed source with the deploy-all and full readiness gates, retaining clean
checkout build output outside the active development server. Required CI gates,
exact-image migrations, runtime-base reuse, regional digest parity and health
checks remain enabled. Store operational receipts under the ignored
`artifacts/release-2026-10-20/` directory.

## Cost and outstanding limits

Expected recurring capture infrastructure increase: **$0/month**. Automatic
workspace-header PDF exports are estimated to add **$0.81/month at 100,000
previously unbranded exports**, including bounded logo reads and transfer; see
`2026-10-20-report-share-branding.md`. This below-$1 estimate was disclosed
before deployment. Local-only capture switches are not enabled in production.
The single fresh owned-canary production
scan is estimated below **$1 one-off**, disclosed before submission; this is an
estimate, not measured billing. Existing deployment compute and cache retention
policies are unchanged.

The local diagnostic PDF remains 24 pages; the earlier 15–18-page target is not
resolved by this release. Authenticated production PDF verification still
requires a normal signed-in workspace session; public checks must not bypass
that access control.
