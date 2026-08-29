# syntax=docker/dockerfile:1.7

ARG VALIDATION_WORKER_RUNTIME_BASE=validation-worker-runtime-base

FROM node:22-bookworm-slim AS build

ARG BUILD_GIT_REF=""
ARG BUILD_GIT_SHA=""
ARG BUILD_IMAGE_TAG=""
ARG BUILD_RUNTIME_TARGET="ecs-fargate"

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV="production"

RUN corepack enable

WORKDIR /app

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/browser-extension/package.json ./apps/browser-extension/package.json
COPY apps/v2-dag-lambda/package.json ./apps/v2-dag-lambda/package.json
COPY apps/validation-worker/package.json ./apps/validation-worker/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/certscore-api-contracts/package.json ./packages/certscore-api-contracts/package.json
COPY packages/certscore-contracts/package.json ./packages/certscore-contracts/package.json
COPY packages/certscore-mcp/package.json ./packages/certscore-mcp/package.json
COPY packages/certscore-report-adapter/package.json ./packages/certscore-report-adapter/package.json
COPY packages/certscore-review-engine/package.json ./packages/certscore-review-engine/package.json
COPY packages/certscore-scan-core/package.json ./packages/certscore-scan-core/package.json
COPY packages/certscore-sdk/package.json ./packages/certscore-sdk/package.json
COPY packages/certscore-vendor-resolver/package.json ./packages/certscore-vendor-resolver/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/validation-shared/package.json ./packages/validation-shared/package.json
COPY packages/web-bot-auth/package.json ./packages/web-bot-auth/package.json

RUN --mount=type=cache,id=wc01-validation-worker-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile --filter @website-signal-risk-scanner/validation-worker...

COPY apps/web ./apps/web
COPY apps/validation-worker ./apps/validation-worker
COPY packages/certscore-api-contracts ./packages/certscore-api-contracts
COPY packages/certscore-contracts ./packages/certscore-contracts
COPY packages/certscore-scan-core ./packages/certscore-scan-core
COPY packages/certscore-vendor-resolver ./packages/certscore-vendor-resolver
COPY packages/shared ./packages/shared
COPY packages/web-bot-auth ./packages/web-bot-auth
COPY packages/db ./packages/db
COPY packages/validation-shared ./packages/validation-shared

RUN rm -rf \
  ./apps/validation-worker/dist \
  ./packages/certscore-api-contracts/dist \
  ./packages/certscore-contracts/dist \
  ./packages/certscore-scan-core/dist \
  ./packages/certscore-vendor-resolver/dist \
  ./packages/shared/dist \
  ./packages/web-bot-auth/dist \
  ./packages/db/dist \
  ./packages/validation-shared/dist

RUN pnpm --filter @certscore/api-contracts build
RUN pnpm --filter @certscore/contracts build
RUN pnpm --filter @certscore/vendor-resolver build
RUN pnpm --filter @website-signal-risk-scanner/shared build
RUN pnpm --filter @website-signal-risk-scanner/web-bot-auth build
RUN pnpm --filter @certscore/scan-core build
RUN pnpm --filter @website-signal-risk-scanner/db build
RUN pnpm --filter @website-signal-risk-scanner/validation-shared build
RUN pnpm --filter @website-signal-risk-scanner/validation-worker build

FROM build AS validation-worker-prod-deps

RUN rm -rf /app/deploy/validation-worker \
  && pnpm --filter @website-signal-risk-scanner/validation-worker deploy --prod --legacy /app/deploy/validation-worker

FROM node:22-bookworm-slim AS validation-worker-runtime-base

ENV NODE_ENV="production"
ENV PLAYWRIGHT_BROWSERS_PATH="/ms-playwright"

RUN apt-get update && apt-get install -y --no-install-recommends awscli procps && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=validation-worker-prod-deps /app/deploy/validation-worker/node_modules ./node_modules
COPY --from=build /app/packages/certscore-vendor-resolver/dist ./node_modules/@certscore/vendor-resolver/dist
RUN ./node_modules/.bin/playwright install --with-deps chromium

FROM ${VALIDATION_WORKER_RUNTIME_BASE} AS runtime

ARG BUILD_GIT_REF=""
ARG BUILD_GIT_SHA=""
ARG BUILD_IMAGE_TAG=""
ARG BUILD_RUNTIME_TARGET="ecs-fargate"

ENV BUILD_GIT_REF="${BUILD_GIT_REF}"
ENV BUILD_GIT_SHA="${BUILD_GIT_SHA}"
ENV BUILD_IMAGE_TAG="${BUILD_IMAGE_TAG}"
ENV BUILD_RUNTIME_TARGET="${BUILD_RUNTIME_TARGET}"

WORKDIR /app

COPY --from=build /app/apps/validation-worker/dist ./apps/validation-worker/dist
# Workspace packages in the prebuilt runtime base can lag the application SHA.
# Always overlay runtime contracts consumed by the compiled worker so its
# validators and contract constants are from the same build as the worker.
COPY --from=build /app/packages/certscore-contracts/dist ./node_modules/@certscore/contracts/dist
COPY --from=build /app/packages/certscore-api-contracts/dist ./node_modules/@certscore/api-contracts/dist
COPY --from=build /app/packages/certscore-scan-core/dist ./node_modules/@certscore/scan-core/dist
# The runtime base intentionally contains a resolver for standalone operation,
# but its contents can lag a resolver-only release. Always copy the resolver
# built with this application image so the canonical version tracks this SHA.
COPY --from=build /app/packages/certscore-vendor-resolver/dist ./node_modules/@certscore/vendor-resolver/dist

RUN node -e "const contracts=require('@certscore/contracts'); if (contracts.VERIFIED_POLICY_EVIDENCE_PACKET_VERSION !== 'certscore.verified-policy-evidence.v1' || typeof contracts.verifiedPolicyEvidencePacketSchema?.parse !== 'function') throw new Error('validation worker runtime is missing the current verified policy evidence contract');" \
  && node -e "const pw=require('playwright'); const pkg=require('playwright/package.json'); console.log(JSON.stringify({validationWorkerRuntime:{playwrightVersion:pkg.version,chromiumExecutablePath:pw.chromium.executablePath()}}));" \
  && du -sh node_modules /ms-playwright apps/validation-worker/dist

CMD ["node", "--enable-source-maps", "./apps/validation-worker/dist/apps/validation-worker/src/index.js"]
