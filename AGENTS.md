# CertScore Agent Notes

> **Project:** CertScore (`certscore.ai`) — a production-minded MVP for scanning public websites for accessibility, privacy, cookie, policy, and disclosure risk signals.
> **Repo codename:** `WC01`
> **Package manager:** pnpm 10.6.3 (workspace monorepo with Turbo)
> **Node engines:** `>=20.0.0 <25.0.0` (Node 25 is unsupported and can fail DNS resolution on localhost)

---

## Project overview

This is a **pnpm workspace monorepo** managed with **Turbo**. It contains the product-facing web application, a background validation worker, shared libraries, and operational tooling.

CertScore is a risk-signal and monitoring product, not a legal certification platform. The repo boundary is intentionally split:

- **`WC01` (this repo)** — product web flows, scan creation, reporting, validation, and control-plane workflows.
- **`WS01` (external repo)** — standalone scanner runtime, crawler identity, scheduled scans, heartbeat behavior, and scanner deploy flow. Do not add scanner runtime logic here.

### Canonical scan-to-report flow

All new scan-to-report logic must preserve the canonical CertScore pipeline:

```text
WS01 observed evidence
→ WC01 normalized concern
→ WC01 concern policy
→ WC01 unified finding / checklist projection
→ executive/regulatory display
```

WC01 must consume scanner evidence through normalized concern construction, concern policy, and unified finding/checklist projection. Do not add synthetic evidence, display-layer promotion, repair-based findings, raw signal shortcuts, or one-off surfacing paths.

Agents have access to both WS01 and WC01. Keep their responsibilities separate:

- WS01 is responsible for observed runtime signal identification, evidence capture, and logging.
- WC01 must consume that evidence only through normalized concern -> concern policy -> unified finding/checklist projection -> executive/regulatory display.

Executive-summary and top-finding selection may rank, allowlist, suppress, or group already-projected findings, but must not create, upgrade, or infer findings from raw signals or display-only context.

If a valid signal is missing, add or fix the upstream WS01 observed evidence and the WC01 concern/policy mapping. Do not patch around missing evidence in display code. If a deviation from this flow seems necessary, stop and call it out before implementing.

### CertScore v2 internal diagnostic architecture

CertScore v2 exists in this repo as a clean scanner/review architecture and internal diagnostic pipeline. Its current operating principle is:

```text
scan-core observes
Nano assists
review-engine interprets
report-adapter projects internal artifacts
web app presents only after separate approval
```

The v2 packages and artifacts are not production report integration by default. V2 shadow, allowlist dry-run, concern-input dry-run, policy simulation, normalized-concern candidate, comparison, reviewer-packet, and evidence-preview outputs must remain artifact-only, internal-only, and non-persistent unless the user explicitly approves a separate production integration proposal.

Do not wire v2 outputs into production report cards, checklist builders, executive summaries, top findings, scoring, regulatory lenses, persisted normalized concerns, unified findings, or customer-facing copy without explicit approval. Do not map v2 dry-run rows directly to `gap_observed`.

Sensitive-context labels in v2 are review routing metadata only. They must not create stronger findings, customer-facing language, legal conclusions, or production eligibility.

Post-consent consent-flow runtime is intentionally disabled for WC01 scanner runs. Do not run, enable, or add paths that click accept, reject, opt-out, save, or other consent controls against public sites. Consent-flow runtime artifacts may be analyzed only from retained historical/local fixtures; new scanner-quality work should use pre-consent observation, policy-surface discovery, deterministic fixtures, retained replay artifacts, and explicit limitation reporting instead. Consent-flow-dependent review rows are internal review aids only; use them to enhance GDPR/ePrivacy Evidence Review clarity, not as required production scanner coverage.

### WC01 responsibility boundary

WC01 owns:

- scan creation, product web flows, reporting, validation, and control-plane workflows
- normalized concern construction
- concern policy
- unified findings and checklist/regulatory projection
- executive summary and report display for already-projected findings

WC01 does not own scanner runtime observation, crawler identity, or raw evidence capture. Those belong in WS01.

Agents may inspect WS01 for scanner evidence contract, runtime signal, and retained evidence context. Only edit WS01 when the user request explicitly spans both repos or when a WC01 concern/policy change exposes a missing or incorrect upstream WS01 signal.

### Evidence contract discipline

WC01 should not consume loose, ad hoc, or display-only scanner fields. New scanner evidence consumed by WC01 should be structured, typed, bounded, and covered by focused fixtures/tests. Prefer shared runtime contract fixtures when adding or changing WS01 -> WC01 evidence shapes.

If WC01 starts consuming a new WS01 field, add or update a runtime contract fixture and the relevant normalized concern/policy test in the same change.

For CertScore v2, artifact contracts must stay typed, bounded, display-safe where projected, and covered by focused fixtures/tests. Do not carry raw cookies, raw request/response bodies, sensitive query values, unbounded DOM/policy text, or raw Nano reasoning into reviewer, report-adapter, or web-facing artifacts.

### Scan reliability and evidence quality

For GDPR/ePrivacy scan-quality work, start by auditing retained evidence, normalized concerns, concern policy, and unified finding projection before changing display code. Missing, downgraded, or unclear findings should be traced to the first broken point in the evidence pipeline.

Preserve evidence quality over deploy speed or runtime size. Full Chromium remains the default browser runtime for scanner/validation paths unless the user explicitly approves a browser-runtime change after an evidence-quality review.

Do not remove or downsample evidence artifacts, screenshots, browser traces, consent-flow proof, runtime diagnostics, or policy-surface context as a deploy optimization unless the change includes an explicit quality assessment and focused tests/fixtures showing GDPR/ePrivacy evidence is not degraded.

When a GDPR/ePrivacy signal is missing, prefer one of these fixes in order: upstream WS01 observed evidence capture, the WC01 typed evidence contract/fixture, WC01 normalized concern construction, WC01 concern policy, then unified finding/checklist projection. Do not create display-only fallbacks for missing evidence.

### Scan timing triage

When asked why a scan was slow, inspect retained timing artifacts before guessing. For local v2 DAG Lambda scans, start with the scan artifact directory and read:

- `V2ScanCorePhases.json` for scanner-core checkpoints, module start/finish order, and whether policy-surface work overlapped pre-consent runtime.
- `CanonicalEvidenceBundle.json` `modulesRun[].timingBreakdown` for child timings such as page navigation, early screenshot capture, consent UI capture/recapture, rendered policy discovery, policy fetch groups, vendor resolver, and artifact writes.
- `LocalV2DagLambdaManifest.json` for Lambda phase timings, scan tuning, runtime diagnostics, target region, proxy/egress, viewport, and artifact upload durations.
- `LambdaArtifactMirrorManifest.json` and scan events such as `v2_lambda_result.received` for post-Lambda result handoff, SQS polling, artifact mirroring, and WC01 materialization timing.

Report scanner core time separately from post-completion handoff. Call out overlapping lanes explicitly; for example, policy-surface extraction may run in parallel with the pre-consent path, so its duration should not be added to scanner wall time unless the phase checkpoints show it was awaited after pre-consent. Preserve evidence quality when optimizing slow phases such as early screenshot capture or rendered footer/header discovery.

### Canonical classification registries

Use canonical tracker, vendor, CMP, and domain classification registries for classification logic. Do not create feature-specific, regulation-specific, or display-specific vendor/domain registries unless the user explicitly approves a new canonical registry.

If a module needs different thresholds, severity, or status treatment, express that as WC01 policy over canonical classifications, not duplicated domain/vendor lists.

`packages/shared/src/known-cmps.ts` `KNOWN_CMP_REGISTRY` is the canonical CMP registry. Use it for CMP identity, aliases, domains, cookies, DOM selectors, globals, standards, and infrastructure treatment. CMPs may also appear in vendor resolution and vendor lists as consent-management vendors, but do not create a competing CMP list when the classification belongs in `KNOWN_CMP_REGISTRY`.

For CertScore v2 endpoint/vendor attribution, use `packages/certscore-vendor-resolver` as the canonical resolver home. Do not add local endpoint or vendor lists inside scan modules, report adapters, dry-run bridges, or docs when the classification belongs in the resolver.

Consent UI control discovery must use the canonical consent-control label classifier/registry for label-based classification of accept, reject, options/manage, and privacy opt-out controls. Do not add feature-specific or display-specific accept/reject/options regexes when the same rule belongs in the canonical classifier. New language terms, CMP label variants, or consent-control synonyms should be added to the canonical registry with typed intent, locale, match strength, optional variant, and focused tests.

Keep consent-control intents distinct. `reject` means refusal of optional cookies, tracking, or consent, including necessary-only equivalents. `privacy_opt_out` is refusal-adjacent evidence for sale/share, targeted advertising, legitimate-interest objection, or broader privacy-choice surfaces, but it must not automatically satisfy GDPR/ePrivacy first-layer cookie-banner reject availability. `options` may indicate a path to choices, but does not prove reject availability without retained deeper-path evidence.

WC01 display, executive summary, checklist, and top-finding code must not infer consent findings directly from raw labels. Label evidence should flow through observed structured evidence, normalized concerns, concern policy, and unified finding/checklist projection.

### Display and summary rules

Display copy may explain retained evidence and the already-determined policy/checklist status. Display copy must not create, upgrade, suppress, or infer findings, and must not change status, severity, eligibility, or regulatory posture.

Executive summaries and top findings may rank, allowlist, suppress, or group already-projected findings only. Top findings should be traceable to unified finding IDs or checklist/regulatory projection rows. Do not create executive-only findings from raw signals or display context.

DB repair and backfill scripts may repair records, but must not create findings that bypass normalized concern construction, concern policy, and unified finding/checklist projection.

### Legal conclusion language

CertScore reports risk signals, not legal determinations. User-facing copy must not state or imply definitive legal violations unless explicitly supported by product policy and retained evidence.

Prefer evidence-scoped language such as "signal observed", "review recommended", "not evaluated", or "insufficient evidence".

Internal v2 docs and artifacts should follow the same posture: no legal-conclusion language, no raw evidence leakage, no production eligibility claims, and no customer-facing copy unless separately approved.

### Monorepo structure

```text
WC01/
├─ apps/
│  ├─ web/                  # Product-facing Next.js web app (certscore.ai)
│  ├─ validation-web/       # Validation ops admin UI (lightweight Next.js app)
│  ├─ validation-worker/    # Background validation worker (TypeScript/Node)
│  └─ runtime-harness/      # Runtime harness (minimal scaffolding)
├─ packages/
│  ├─ certscore-contracts/   # CertScore v2 typed scanner/review/report contracts
│  ├─ certscore-scan-core/   # CertScore v2 browser evidence capture core
│  ├─ certscore-review-engine/ # CertScore v2 evidence interpretation engine
│  ├─ certscore-report-adapter/ # CertScore v2 internal projection, shadow, and dry-run adapters
│  ├─ certscore-vendor-resolver/ # CertScore v2 canonical vendor/product resolver
│  ├─ certscore-sdk/         # CertScore Pulse TypeScript SDK
│  ├─ certscore-mcp/         # CertScore Pulse MCP server
│  ├─ shared/               # Shared constants, types, validators, scoring config, scheduling helpers
│  ├─ db/                   # PostgreSQL query helpers, migrations, seed SQL, env helpers
│  ├─ ui/                   # Reusable UI primitives (React, Tailwind)
│  ├─ validation-shared/    # Validation-specific types, constants, and finding-promotion helpers
│  └─ web-bot-auth/         # Server-only Web Bot Auth signing and key-directory helpers (Cloudflare Verified Bot)
├─ scripts/                 # Operational, migration, and audit scripts (TS via tsx)
├─ infra/aws/               # AWS infrastructure definitions (web-ecs, validation)
├─ docs/                    # Architecture docs, runbooks, and checklists
├─ .github/workflows/       # CI/CD pipelines
├─ package.json             # Root scripts and devDependencies
├─ pnpm-workspace.yaml      # Workspace declaration
├─ turbo.json               # Turbo pipeline (build, dev, typecheck, clean)
└─ tsconfig.base.json       # Shared TypeScript config with path mappings
```

### Workspace packages

| Package | Path | Purpose |
|---|---|---|
| `@website-signal-risk-scanner/web` | `apps/web` | Next.js 15 + React 19 product app. Public marketing pages, authenticated dashboard, API routes, scan reporting. |
| `@website-signal-risk-scanner/validation-worker` | `apps/validation-worker` | Long-running TypeScript worker. Processes validation jobs, nano-document retrieval, LLM-driven finding validation, and scheduler sweeps. |
| `@website-signal-risk-scanner/validation-web` | `apps/validation-web` | Next.js admin UI for validation ops. |
| `@website-signal-risk-scanner/shared` | `packages/shared` | Cross-cutting types, constants, validators, scoring rules, taxonomy, and scheduling utilities. |
| `@website-signal-risk-scanner/db` | `packages/db` | PostgreSQL client helpers, S3 helpers, migrations (`packages/db/migrations/`), and seed data. |
| `@website-signal-risk-scanner/ui` | `packages/ui` | Reusable UI primitives (Button, Card, Badge, etc.) built with React and Tailwind CSS. |
| `@website-signal-risk-scanner/validation-shared` | `packages/validation-shared` | Validation-specific types, financial-claims drafts, privacy-runtime findings, and promotion coverage reports. |
| `@website-signal-risk-scanner/web-bot-auth` | `packages/web-bot-auth` | Server-only HTTP Message Signatures signing and key-directory helpers for crawler authentication. |
| `@certscore/contracts` | `packages/certscore-contracts` | CertScore v2 scanner, review, and projection contracts. |
| `@certscore/scan-core` | `packages/certscore-scan-core` | CertScore v2 browser evidence capture core. |
| `@certscore/review-engine` | `packages/certscore-review-engine` | CertScore v2 evidence review engine. |
| `@certscore/report-adapter` | `packages/certscore-report-adapter` | CertScore v2 internal report projection, WC01 shadow, dry-run, reviewer-packet, and evidence-preview adapters. |
| `@certscore/vendor-resolver` | `packages/certscore-vendor-resolver` | High-confidence CertScore v2 vendor and product resolver. |
| `@certscore/sdk` | `packages/certscore-sdk` | TypeScript SDK for the CertScore Pulse API. |
| `@certscore/mcp` | `packages/certscore-mcp` | MCP server for CertScore Pulse. |

### Technology stack

- **Runtime:** Node.js 20/22
- **Package manager:** pnpm 10.6.3 with `node-linker=hoisted`
- **Build orchestration:** Turbo 2.5
- **Web framework:** Next.js 15 (App Router, `output: "standalone"`)
- **UI library:** React 19, Tailwind CSS 3.4, clsx, tailwind-merge
- **Language:** TypeScript 5.8 (strict mode, `noUncheckedIndexedAccess: true`)
- **Auth:** Better Auth (email/password + Google OAuth), Nodemailer for Gmail SMTP
- **Database:** PostgreSQL (raw SQL via `pg` package; no ORM)
- **Storage:** AWS S3-compatible (AWS SDK v3 + presigned URLs)
- **Browser automation:** Playwright (Chromium) — used by validation worker
- **LLM integration:** OpenAI API (configurable models; default `gpt-5.4-nano` / `gpt-5.4-nano`)
- **Validation / Schema:** Zod
- **Testing:** Node.js built-in test runner (`node --test`) executed through `tsx`
- **CI/CD:** GitHub Actions
- **Deployment target:** AWS ECS/Fargate (Docker multi-stage builds)

---

## Build and test commands

### Root-level scripts

```bash
# Install dependencies
pnpm install

# Build everything (Turbo)
pnpm build

# Typecheck everything (Turbo)
pnpm typecheck

# Clean build artifacts (Turbo)
pnpm clean

# Fast change-aware preflight gate
pnpm preflight:fast

# Fast deploy-all gate for web, validation/DB, and all v2 Lambda scanner regions
pnpm preflight:all

# Full local preflight confidence gate
pnpm preflight:full

# Dev mode — web only (parallel via Turbo)
pnpm dev

# Dev mode — validation worker only
pnpm dev:validation

# Dev mode — web + validation worker together
pnpm dev:all

# Dev mode — storage (local MinIO)
pnpm dev:storage:local
```

### Web app (`apps/web`)

```bash
# Local dev (port 3000)
pnpm --filter @website-signal-risk-scanner/web dev

# Typecheck (includes next typegen)
pnpm --filter @website-signal-risk-scanner/web typecheck

# Build
pnpm --filter @website-signal-risk-scanner/web build

# Env / runtime checks (requires apps/web/.env.local)
pnpm check-env
pnpm --filter @website-signal-risk-scanner/web check-runtime
```

For local browser review, always use `http://localhost:3000`. If port 3000 is already occupied, inspect the existing listener before starting another server; do not switch to an alternate port for WC01 review unless the user explicitly asks.

### Validation worker (`apps/validation-worker`)

```bash
# Local dev (watched)
pnpm --filter @website-signal-risk-scanner/validation-worker dev

# Typecheck
pnpm --filter @website-signal-risk-scanner/validation-worker typecheck

# Build (tsc)
pnpm --filter @website-signal-risk-scanner/validation-worker build

# Run deterministic scan pipeline tests
pnpm test:scan-pipeline

# Run scheduler once
pnpm dev:validation:scheduler

# Env / runtime checks
pnpm check-env:validation
pnpm --filter @website-signal-risk-scanner/validation-worker check-runtime
```

### Workspace package builds

Shared packages must be built before the apps that depend on them:

```bash
pnpm --filter @website-signal-risk-scanner/shared build
pnpm --filter @website-signal-risk-scanner/ui build
pnpm --filter @website-signal-risk-scanner/db build
pnpm --filter @website-signal-risk-scanner/validation-shared build
pnpm --filter @website-signal-risk-scanner/web-bot-auth build
```

### CertScore v2 commands

V2 commands are internal diagnostic commands unless a task explicitly says otherwise. See `docs/certscore-v2/README.md` for full command sequences and artifact expectations.

Common root scripts:

```bash
pnpm v2:scan
pnpm v2:review
pnpm v2:calibrate
pnpm v2:shadow-project
pnpm v2:wc01-shadow
pnpm v2:wc01-allowlist-dry-run
pnpm v2:wc01-concern-input-dry-run
pnpm v2:wc01-concern-policy-simulate
pnpm v2:wc01-normalized-concern-adapter
pnpm v2:wc01-concern-policy-compare
pnpm v2:wc01-reviewer-packet
pnpm v2:wc01-evidence-preview
pnpm v2:wc01-policy-copy-review
pnpm v2:wc01-production-readiness-gate
pnpm v2:wc01-product-surface-proposal
pnpm v2:wc01-artifact-chain-smoke
```

V2 commands that perform live browser scans typically require `apps/web/.env.local` and, for Nano-assisted paths, `OPENAI_API_KEY`.

---

## Code style guidelines

### TypeScript configuration

- Base config: `tsconfig.base.json` at repo root.
- Strict mode is enabled.
- `noUncheckedIndexedAccess: true` — always handle `undefined` when indexing arrays/records.
- `isolatedModules: true` — each file must be independently compilable.
- Path mappings are defined in `tsconfig.base.json` for all workspace packages.

### Naming and organization

- Use **kebab-case** for filenames (`create-preview-scan.ts`, `unified-findings.ts`).
- Co-locate related logic: a domain folder under `server/` or `lib/` contains the module, repository, and tests together.
- Tests are co-located as `*.test.ts` or `*.test.tsx` next to the source file.
- Server-only modules must import `"server-only"` to prevent accidental client bundling.

### Environment handling

- **Do not** use a root `.env.local` for app runtime configuration.
- **Local development:** use `apps/web/.env.local` as the single runtime env file.
- Copy `apps/web/.env.example` to `apps/web/.env.local` to get started.
- `.env.example` at the root is only a reference template.
- Environment variables are validated with Zod schemas scoped to each runtime (web vs. worker).

### Finding pipeline convention (critical)

New `WC01` finding surfacing or gating logic **must** follow this order:

1. **Normalize inputs into a concern**
2. **Apply concern policy**
3. **Promote eligible concerns into unified findings**

Avoid adding new raw signal-key or raw policy-row gating paths when the same rule can live in the normalized concern pipeline.

Key pipeline files:
- `apps/web/lib/scans/normalized-concerns.ts`
- `apps/web/lib/scans/concern-policy.ts`
- `apps/web/lib/scans/unified-findings.ts`
- `apps/web/lib/scans/finding-evidence-gates.ts`

V2 dry-run adapters may produce internal candidate artifacts for comparison and reviewer workflow, but they must not call production concern policy, persist normalized concerns, or create unified findings unless a production integration proposal is explicitly approved.

---

## Testing instructions

### Test framework

This repo uses **Node.js built-in test runner** (`node:test` and `node:assert/strict`), not Jest or Vitest. Tests are executed via `tsx` so TypeScript files run directly.

### Running tests

```bash
# Validation pipeline tests (deterministic, runs without external secrets)
pnpm test:scan-pipeline

# Web-bot-auth package tests
pnpm test:web-bot-auth

# Individual test files (example)
node --import tsx --test apps/web/server/preview-scan/create-preview-scan.test.ts
node --import tsx --test packages/shared/src/regulatory-review/regulatory-review.test.ts
```

### CertScore v2 package tests

Run focused v2 tests for v2 package changes:

```bash
pnpm --filter @certscore/contracts test
pnpm --filter @certscore/vendor-resolver test
pnpm --filter @certscore/scan-core test
pnpm --filter @certscore/review-engine test
pnpm --filter @certscore/report-adapter test
```

Run focused v2 typechecks for v2 package changes:

```bash
pnpm --filter @certscore/contracts typecheck
pnpm --filter @certscore/vendor-resolver typecheck
pnpm --filter @certscore/scan-core typecheck
pnpm --filter @certscore/review-engine typecheck
pnpm --filter @certscore/report-adapter typecheck
```

### CI pipelines

- **`.github/workflows/accessibility-validation.yml`** — runs on PRs and `main` pushes:
  - `web-validation-contract` job: typechecks web, builds shared deps, runs cutover-contract and preview-scan tests.
  - `worker-scan-pipeline-tests` job: installs Playwright Chromium, typechecks validation-worker, runs `pnpm test:scan-pipeline`.
  - `live-validation-smoke` job: runs only when runtime secrets are configured; executes `smoke:validation` against the live database.
- **`.github/workflows/web-aws-ecs-deploy.yml`** — deploys `apps/web` to AWS ECS/Fargate on `main`.
- **`.github/workflows/validation-aws-deploy.yml`** — deploys validation web + worker + scheduler to AWS ECS/Fargate on `main`.

### Pre-ship verification

For deployment-bound changes, prefer the fast local gate before commit/push:

```bash
pnpm preflight:fast
```

`preflight:fast` is change-aware and runs only the deploy-targeted checks implied by the diff against `origin/main`, plus staged and unstaged local changes. Use `PREDEPLOY_BASE_REF=<ref>` or `-- --base <ref>` when comparing against a different deployed SHA.

When the user says **deploy all**, use the fast deploy-all gate before committing or pushing:

```bash
pnpm preflight:all
```

In this repo, **deploy all** means the public web app, validation worker/DB-related code paths, production DB migration workflow when migrations changed, and the v2 DAG Lambda scanner images in all three approved scanner regions: `eu-central-1`, `eu-west-1`, and `us-west-2`. Treat those as the canonical Lambda scanner regions unless the user explicitly approves a region change.

Use the full local gate when the change touches shared build infrastructure, broad dependency surfaces, release-critical scan behavior, or when you need maximum local confidence before pushing:

```bash
pnpm preflight:full
```

For manual verification outside the preflight scripts, run:

```bash
pnpm turbo run typecheck
pnpm turbo run build
```

For validation changes, also run:

```bash
pnpm --filter @website-signal-risk-scanner/validation-worker typecheck
pnpm test:scan-pipeline
```

---

## Security considerations

### Auth and session

- Auth is handled by **Better Auth** with the `nextCookies()` plugin.
- Middleware (`apps/web/middleware.ts`) protects `/app/:path*` routes using `getSession` with `disableCookieCache: true` and `returnHeaders: true`.
- Unauthenticated users are redirected to `/login?next=...`.
- Google OAuth redirect URIs must be explicitly allow-listed in the provider console.
- Local auth credentials and secrets must never point at production.

### Database access

- The web app and validation worker share the same PostgreSQL database.
- DB access is through raw SQL via the `@website-signal-risk-scanner/db` package.
- Migrations live in `packages/db/migrations/` and must be applied in order.
- There is no ORM; queries are handwritten parameterized SQL.

### Production DB inspection

For production DB inspection, use the ECS psql one-off task instead of local DB connections or direct secret access:

- task definition: `certscore-prod-psql-oneoff:1`
- `PGSSLMODE=require`
- same network as `certscore-validation-worker`
- SQL passed via `QUERY_B64`
- output read from CloudWatch logs

Do not use local production DB tunnels, ECS Exec, or copied secrets for routine inspection. Prefer `SELECT`-only queries with tight predicates and `LIMIT`. Avoid broad scans, writes, repairs, or migrations unless the user explicitly approves them.

### Storage

- Report artifacts and PDFs are stored in an S3-compatible bucket.
- Presigned URLs are used for secure client-side access.
- Local development uses MinIO (`pnpm dev:storage:local`).

### Web Bot Auth

- Optional Cloudflare Verified Bot workflow.
- Requires a private key PEM and signature agent URL.
- Commands: `pnpm web-bot-auth:generate`, `pnpm web-bot-auth:print`, `pnpm web-bot-auth:test-request`.

### Environment isolation

- Keep local and production environments strictly isolated.
- Local `NEXT_PUBLIC_APP_URL` should be `http://localhost:3000`.
- Production secrets must exist only in the active AWS/web or worker deployment settings.
- Do not commit `.env.local` files.

---

## Git and deployment workflow

- Make changes in the repo, then stage the relevant files with `git add`.
- Create a commit with a clear message.
- Push the branch to GitHub instead of deploying an uncommitted working tree directly to any production host.
- Prefer Git-based deploy promotion through the connected AWS ECS deployment workflows, but verify which runtime is actually serving `certscore.ai` before claiming production is updated.
- For a user request phrased as "deploy all", run `pnpm preflight:all` first, then deploy through the canonical paths: GitHub/AWS ECS for web and validation worker, `.github/workflows/prod-db-migrate.yml` for production DB migrations when migration files changed, and the local v2 DAG Lambda image deploy helpers for each approved scanner region (`eu-central-1`, `eu-west-1`, `us-west-2`). Preview deploy orchestration first with `pnpm deploy:all -- --plan` or `pnpm deploy:all -- --dry-run` when checking scope. Scanner deploys reuse prebuilt Lambda runtime-base images by default; rebuild and push the scanner runtime base only when explicitly requested with `--push-runtime-base`.

## Runtime and deployment topology

Do not assume Docker Compose or local container orchestration is the development or deployment path.

Production deploys run on AWS ECS/Fargate through the repo's deployment scripts and GitHub Actions workflows. Dockerfiles may be used to build ECS images, but do not deploy ad hoc local containers or alternate hosts unless the user explicitly requests it.

WC01 web production is `certscore.ai` on AWS ECS/Fargate. Do not deploy WC01 web changes to Vercel, `consentcheck.site`, or other alternate hosts.

## Local scan stack

To get the local scan stack running for WC01 workflows, use:

```bash
bash /Users/benmasek/WC01/scripts/ensure-local-scan-stack.sh
```

## Production expectation

- Treat the AWS ECS/Fargate service for `certscore.ai` as the preferred target web topology.
- The current production deploy route for `apps/web` is directly to the existing AWS ECS/Fargate public web service for `certscore.ai`.
- Do not deploy WC01 web changes to alternate hosts or obsolete hosting paths. Use the direct ECS/Fargate route and verify the ECS service and public host before claiming production is live.
- `consentcheck.site` is not a WC01 web host and WC01 must not claim or deploy it.
- A push to `main` is not enough to claim either host is live; for web changes, confirm the intended ECS deployment has completed successfully and the public host is serving the expected revision.
- If the active production host is uncertain, call it out before claiming a change is live in production.
- `apps/web` remains the canonical root for the CertScore public web host.
- Use `pnpm ops:check:deploy` after deployment-topology changes to catch stale local assumptions and wrong remotes before treating the path as healthy.

## Scope note

- These instructions apply to the web app deployment path.
- Worker deployments in `WC01` should follow the AWS validation deployment path and helper scripts.

## Agent Notes Maintenance

Keep `AGENTS.md` focused on durable repo-wide guidance. Do not add one-off task instructions, temporary prompts, or scan-specific notes. When guidance conflicts with current code/tests, inspect the code/tests and call out the mismatch before acting.

## Finding flow note

- New `WC01` finding surfacing or gating logic should prefer this order:
  1. normalize inputs into a concern
  2. apply concern policy
  3. promote eligible concerns into unified findings
- Avoid adding new raw signal-key or raw policy-row gating paths when the same rule can live in the normalized concern pipeline.
