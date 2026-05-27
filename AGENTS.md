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

### Monorepo structure

```text
WC01/
├─ apps/
│  ├─ web/                  # Product-facing Next.js web app (certscore.ai)
│  ├─ validation-web/       # Validation ops admin UI (lightweight Next.js app)
│  ├─ validation-worker/    # Background validation worker (TypeScript/Node)
│  └─ runtime-harness/      # Runtime harness (minimal scaffolding)
├─ packages/
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
- **Browser automation:** Playwright 1.51 (Chromium) — used by validation worker
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

### CI pipelines

- **`.github/workflows/accessibility-validation.yml`** — runs on PRs and `main` pushes:
  - `web-validation-contract` job: typechecks web, builds shared deps, runs cutover-contract and preview-scan tests.
  - `worker-scan-pipeline-tests` job: installs Playwright Chromium, typechecks validation-worker, runs `pnpm test:scan-pipeline`.
  - `live-validation-smoke` job: runs only when runtime secrets are configured; executes `smoke:validation` against the live database.
- **`.github/workflows/web-aws-ecs-deploy.yml`** — deploys `apps/web` to AWS ECS/Fargate on `main`.
- **`.github/workflows/validation-aws-deploy.yml`** — deploys validation web + worker + scheduler to AWS ECS/Fargate on `main`.

### Pre-ship verification

Before shipping changes, run:

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

## Finding flow note

- New `WC01` finding surfacing or gating logic should prefer this order:
  1. normalize inputs into a concern
  2. apply concern policy
  3. promote eligible concerns into unified findings
- Avoid adding new raw signal-key or raw policy-row gating paths when the same rule can live in the normalized concern pipeline.
