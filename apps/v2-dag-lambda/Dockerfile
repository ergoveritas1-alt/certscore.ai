# syntax=docker/dockerfile:1.7

ARG CERTSCORE_LAMBDA_RUNTIME_BASE=lambda-runtime-base

FROM node:22-bookworm-slim AS build

WORKDIR /workspace
ENV CI=1

RUN corepack enable && corepack prepare pnpm@10.6.3 --activate

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/mcp/package.json ./apps/mcp/package.json
COPY apps/v2-dag-lambda/package.json ./apps/v2-dag-lambda/package.json
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

RUN --mount=type=cache,id=wc01-v2-dag-lambda-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile

COPY packages ./packages
COPY apps/v2-dag-lambda/src ./apps/v2-dag-lambda/src
COPY apps/v2-dag-lambda/tsconfig.json ./apps/v2-dag-lambda/tsconfig.json
COPY apps/v2-dag-lambda/runtime-bootstrap.mjs ./apps/v2-dag-lambda/runtime-bootstrap.mjs

RUN pnpm --filter @website-signal-risk-scanner/v2-dag-lambda bundle
RUN --mount=type=cache,id=wc01-v2-dag-lambda-pnpm-store,target=/pnpm/store \
  pnpm --filter @website-signal-risk-scanner/v2-dag-lambda --prod deploy --legacy /lambda-deps
RUN mkdir -p /lambda/node_modules \
  && mkdir -p /lambda/src \
  && cp /workspace/apps/v2-dag-lambda/dist-bundle/src/handler.js /lambda/src/handler.js \
  && cp -R /lambda-deps/node_modules/playwright /lambda/node_modules/playwright \
  && cp -R /lambda-deps/node_modules/playwright-core /lambda/node_modules/playwright-core

FROM node:22-bookworm-slim AS lambda-runtime-base

WORKDIR /var/task
ARG CERTSCORE_LAMBDA_BROWSER_PACKAGE=chromium
ARG CERTSCORE_LAMBDA_BROWSER_EXECUTABLE=/usr/bin/chromium
ENV NODE_ENV=production \
    CERTSCORE_CHROMIUM_EXECUTABLE_PATH=${CERTSCORE_LAMBDA_BROWSER_EXECUTABLE} \
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR=/tmp/certscore-v2-dag-lambda

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ${CERTSCORE_LAMBDA_BROWSER_PACKAGE} \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/* /tmp/*

FROM ${CERTSCORE_LAMBDA_RUNTIME_BASE} AS runtime

WORKDIR /var/task
ARG BUILD_GIT_SHA=""
ARG BUILD_IMAGE_TAG=""
ARG SCANNER_RUNTIME_VERSION="certscore-v2-dag-parallel-path"
ENV BUILD_GIT_SHA="${BUILD_GIT_SHA}" \
    BUILD_IMAGE_TAG="${BUILD_IMAGE_TAG}" \
    SCANNER_RUNTIME_VERSION="${SCANNER_RUNTIME_VERSION}"

COPY --from=build /lambda ./
COPY apps/v2-dag-lambda/runtime-bootstrap.mjs ./runtime-bootstrap.mjs

ENTRYPOINT ["node", "runtime-bootstrap.mjs"]
CMD ["src/handler.handler"]
