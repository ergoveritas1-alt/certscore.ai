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
COPY apps/mcp/package.json ./apps/mcp/package.json
COPY apps/v2-dag-lambda/package.json ./apps/v2-dag-lambda/package.json
COPY apps/validation-worker/package.json ./apps/validation-worker/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/certscore-api-contracts/package.json ./packages/certscore-api-contracts/package.json
COPY packages/certscore-contracts/package.json ./packages/certscore-contracts/package.json
COPY packages/certscore-mcp-auth/package.json ./packages/certscore-mcp-auth/package.json
COPY packages/certscore-mcp/package.json ./packages/certscore-mcp/package.json
COPY packages/certscore-sdk/package.json ./packages/certscore-sdk/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN --mount=type=cache,id=wc01-mcp-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile --filter @certscore/mcp-http...

COPY apps/mcp ./apps/mcp
COPY packages/certscore-api-contracts ./packages/certscore-api-contracts
COPY packages/certscore-mcp-auth ./packages/certscore-mcp-auth
COPY packages/certscore-mcp ./packages/certscore-mcp
COPY packages/certscore-sdk ./packages/certscore-sdk
COPY packages/shared ./packages/shared

RUN rm -rf \
  ./apps/mcp/dist \
  ./packages/certscore-api-contracts/dist \
  ./packages/certscore-mcp-auth/dist \
  ./packages/certscore-mcp/dist \
  ./packages/certscore-sdk/dist \
  ./packages/shared/dist

RUN pnpm --filter @certscore/api-contracts build
RUN pnpm --filter @certscore/sdk build
RUN pnpm --filter @certscore/mcp-auth build
RUN pnpm --filter @certscore/mcp build
RUN pnpm --filter @certscore/mcp-http build

FROM builder AS prod-deps

RUN rm -rf /app/deploy/mcp \
  && pnpm --filter @certscore/mcp-http deploy --prod --legacy /app/deploy/mcp

FROM node:22-alpine AS runtime

ARG BUILD_GIT_REF=""
ARG BUILD_GIT_SHA=""
ARG BUILD_IMAGE_TAG=""
ARG BUILD_RUNTIME_TARGET="ecs-fargate"

ENV NODE_ENV="production"
ENV PORT="3004"
ENV BUILD_GIT_REF="${BUILD_GIT_REF}"
ENV BUILD_GIT_SHA="${BUILD_GIT_SHA}"
ENV BUILD_IMAGE_TAG="${BUILD_IMAGE_TAG}"
ENV BUILD_RUNTIME_TARGET="${BUILD_RUNTIME_TARGET}"

RUN apk upgrade --no-cache

WORKDIR /app

COPY --from=prod-deps /app/deploy/mcp/node_modules ./node_modules
COPY --from=builder /app/apps/mcp/dist ./apps/mcp/dist
COPY --from=builder /app/packages/certscore-api-contracts/dist ./packages/certscore-api-contracts/dist
COPY --from=builder /app/packages/certscore-api-contracts/package.json ./packages/certscore-api-contracts/package.json
COPY --from=builder /app/packages/certscore-mcp-auth/dist ./packages/certscore-mcp-auth/dist
COPY --from=builder /app/packages/certscore-mcp-auth/package.json ./packages/certscore-mcp-auth/package.json
COPY --from=builder /app/packages/certscore-mcp/dist ./packages/certscore-mcp/dist
COPY --from=builder /app/packages/certscore-mcp/package.json ./packages/certscore-mcp/package.json
COPY --from=builder /app/packages/certscore-sdk/dist ./packages/certscore-sdk/dist
COPY --from=builder /app/packages/certscore-sdk/package.json ./packages/certscore-sdk/package.json

EXPOSE 3004

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3004') + '/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--enable-source-maps", "./apps/mcp/dist/index.js"]
