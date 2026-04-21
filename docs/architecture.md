# Architecture Notes

## Product

- Product name: `CertScore`
- Product domain: `certscore.ai`

## Core system shape

- Monorepo managed with `pnpm` workspaces and Turbo
- One Next.js web app for marketing, auth, dashboard, reports, and download routes
- One TypeScript worker for queue processing, crawling, auditing, scoring, reporting, PDF generation, and scheduling
- Better Auth for sessions and identity, PostgreSQL for data, and S3-compatible storage for artifacts
- The target web topology is two AWS Amplify Hosting apps that both build from `apps/web`
- If the web SSR workload still requires direct PostgreSQL access, the accepted AWS runtime path is ECS/Fargate in `us-west-1` until that dependency shape changes
- `certscore.ai` and `consentcheck.site` stay separate public hosts with separate env and domain settings even though they share code

## Execution model

- Web app responsibilities:
  - auth and organization bootstrap
  - domain management
  - preview funnel
  - enqueue manual scans
  - render authenticated reports
- Worker responsibilities:
  - claim scan jobs
  - run crawl and page audits
  - persist findings, scores, reports, and regressions
  - generate and upload PDFs
  - enqueue scheduled rescans

## Deployment model

- Web deploys should be promoted through Git-connected Amplify apps rather than ad hoc VM or Vercel pushes
- While direct PostgreSQL access remains part of the critical SSR contract, the practical AWS cutover path in the current account/region is an ECS/Fargate-style runtime rather than Amplify Hosting
- Production verification should check each public host directly and confirm the expected runtime target and git revision before concluding a rollout path is healthy

## Data model highlights

- `organizations` own `domains`
- `domains` optionally belong to `clients`
- `scans` belong to `domains` and `organizations`
- `findings`, `risk_scores`, `reports`, and `scan_regressions` are all keyed to scans
- one canonical `report_payload_json` drives both web and PDF rendering

## Hardening notes

- critical env vars are validated at runtime
- scan execution keeps page-level failures isolated where practical
- PDF and regression failures do not invalidate the rest of the scan result
- forward migrations are used for schema cleanup instead of rewriting history

## Finding lifecycle

- `WS01` owns scanner evidence collection and artifact quality
- `WC01` normalizes scanner-derived inputs into internal concerns before unified finding assembly
- concern policy decides whether a concern is eligible, audit-only, or suppressed before it becomes a unified finding candidate
- canonical taxonomy IDs and unified finding IDs remain stable across that pipeline

See [normalized-concern-pipeline.md](/Users/benmasek/WC01/docs/normalized-concern-pipeline.md).
