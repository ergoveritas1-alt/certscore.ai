FROM node:20-bookworm-slim AS builder

ARG BUILD_GIT_REF=""
ARG BUILD_GIT_SHA=""
ARG BUILD_IMAGE_TAG=""
ARG BUILD_RUNTIME_TARGET="gcp-vm"

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV="production"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY packages/db ./packages/db
COPY packages/validation-shared ./packages/validation-shared

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
  ./packages/validation-shared/dist

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @website-signal-risk-scanner/shared build
RUN pnpm --filter @website-signal-risk-scanner/ui build
RUN pnpm --filter @website-signal-risk-scanner/db build
RUN pnpm --filter @website-signal-risk-scanner/validation-shared build
RUN pnpm --filter @website-signal-risk-scanner/web build

FROM node:20-bookworm-slim AS runner

ARG BUILD_GIT_REF=""
ARG BUILD_GIT_SHA=""
ARG BUILD_IMAGE_TAG=""
ARG BUILD_RUNTIME_TARGET="gcp-vm"

ENV NODE_ENV="production"
ENV PORT="3000"
ENV HOSTNAME="0.0.0.0"

WORKDIR /app

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
