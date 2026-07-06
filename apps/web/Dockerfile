# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS builder

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
COPY packages/certscore-mcp-auth/package.json ./packages/certscore-mcp-auth/package.json
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

RUN --mount=type=cache,id=wc01-web-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile \
    --filter @website-signal-risk-scanner/web... \
    --filter @certscore/vendor-resolver...

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY packages/db ./packages/db
COPY packages/validation-shared ./packages/validation-shared
COPY packages/certscore-api-contracts ./packages/certscore-api-contracts
COPY packages/certscore-contracts ./packages/certscore-contracts
COPY packages/certscore-mcp-auth ./packages/certscore-mcp-auth
COPY packages/certscore-vendor-resolver ./packages/certscore-vendor-resolver
COPY scripts/apply-db-migrations.mjs ./scripts/apply-db-migrations.mjs
COPY scripts/insert-integration-api-key.mjs ./scripts/insert-integration-api-key.mjs

RUN printf 'export const generatedBuildInfo = {"gitRef":"%s","gitSha":"%s","imageTag":"%s","runtimeTarget":"%s"} as const;\n' \
  "${BUILD_GIT_REF}" \
  "${BUILD_GIT_SHA}" \
  "${BUILD_IMAGE_TAG}" \
  "${BUILD_RUNTIME_TARGET}" > /app/apps/web/server/generated-build-info.ts

RUN rm -rf \
  ./apps/web/.next \
  ./packages/shared/dist \
  ./packages/ui/dist \
  ./packages/db/dist \
  ./packages/validation-shared/dist \
  ./packages/certscore-api-contracts/dist \
  ./packages/certscore-contracts/dist \
  ./packages/certscore-mcp-auth/dist \
  ./packages/certscore-vendor-resolver/dist

RUN pnpm --filter @website-signal-risk-scanner/shared build
RUN pnpm --filter @website-signal-risk-scanner/ui build
RUN pnpm --filter @website-signal-risk-scanner/db build
RUN pnpm --filter @website-signal-risk-scanner/validation-shared build
RUN pnpm --filter @certscore/api-contracts build
RUN pnpm --filter @certscore/contracts build
RUN pnpm --filter @certscore/mcp-auth build
RUN pnpm --filter @certscore/vendor-resolver build
RUN pnpm --filter @website-signal-risk-scanner/web build

FROM node:22-bookworm-slim AS runner

ARG BUILD_GIT_REF=""
ARG BUILD_GIT_SHA=""
ARG BUILD_IMAGE_TAG=""
ARG BUILD_RUNTIME_TARGET="ecs-fargate"

ENV NODE_ENV="production"
ENV PORT="3000"
ENV HOSTNAME="0.0.0.0"
ENV BUILD_GIT_REF="${BUILD_GIT_REF}"
ENV BUILD_GIT_SHA="${BUILD_GIT_SHA}"
ENV BUILD_IMAGE_TAG="${BUILD_IMAGE_TAG}"
ENV BUILD_RUNTIME_TARGET="${BUILD_RUNTIME_TARGET}"
ENV NODE_PATH="/app/runtime-node_modules/node_modules"

WORKDIR /app

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/packages/db/migrations ./packages/db/migrations
COPY --from=builder /app/packages/certscore-api-contracts/package.json ./packages/certscore-api-contracts/package.json
COPY --from=builder /app/packages/certscore-api-contracts/dist ./packages/certscore-api-contracts/dist
COPY --from=builder /app/packages/certscore-contracts/package.json ./packages/certscore-contracts/package.json
COPY --from=builder /app/packages/certscore-contracts/dist ./packages/certscore-contracts/dist
COPY --from=builder /app/packages/certscore-mcp-auth/package.json ./packages/certscore-mcp-auth/package.json
COPY --from=builder /app/packages/certscore-mcp-auth/dist ./packages/certscore-mcp-auth/dist
COPY --from=builder /app/packages/certscore-vendor-resolver/package.json ./packages/certscore-vendor-resolver/package.json
COPY --from=builder /app/packages/certscore-vendor-resolver/dist ./packages/certscore-vendor-resolver/dist
COPY --from=builder /app/scripts/apply-db-migrations.mjs ./scripts/apply-db-migrations.mjs
COPY --from=builder /app/scripts/apply-db-migrations.mjs ./apps/web/scripts/apply-db-migrations.mjs
COPY --from=builder /app/scripts/insert-integration-api-key.mjs ./apps/web/scripts/insert-integration-api-key.mjs

RUN mkdir -p /app/runtime-node_modules \
  && cd /app/runtime-node_modules \
  && npm init -y \
  && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --omit=dev --no-audit --no-fund \
    pg@8.20.0 \
    zod@3.24.2

RUN mkdir -p /app/node_modules/@certscore \
  && ln -sfn ../../packages/certscore-api-contracts /app/node_modules/@certscore/api-contracts \
  && ln -sfn ../../packages/certscore-contracts /app/node_modules/@certscore/contracts \
  && ln -sfn ../../packages/certscore-mcp-auth /app/node_modules/@certscore/mcp-auth \
  && ln -sfn ../../packages/certscore-vendor-resolver /app/node_modules/@certscore/vendor-resolver

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
