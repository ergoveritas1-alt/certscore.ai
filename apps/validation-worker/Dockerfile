FROM node:22-bookworm-slim

ARG BUILD_GIT_REF=""
ARG BUILD_GIT_SHA=""
ARG BUILD_IMAGE_TAG=""
ARG BUILD_RUNTIME_TARGET="ecs-fargate"

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV="production"
ENV PLAYWRIGHT_BROWSERS_PATH="/ms-playwright"
ENV BUILD_GIT_REF="${BUILD_GIT_REF}"
ENV BUILD_GIT_SHA="${BUILD_GIT_SHA}"
ENV BUILD_IMAGE_TAG="${BUILD_IMAGE_TAG}"
ENV BUILD_RUNTIME_TARGET="${BUILD_RUNTIME_TARGET}"

RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends awscli procps && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY apps/validation-worker ./apps/validation-worker
COPY packages/shared ./packages/shared
COPY packages/web-bot-auth ./packages/web-bot-auth
COPY packages/db ./packages/db
COPY packages/validation-shared ./packages/validation-shared

RUN rm -rf \
  ./apps/validation-worker/dist \
  ./packages/shared/dist \
  ./packages/web-bot-auth/dist \
  ./packages/db/dist \
  ./packages/validation-shared/dist

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @website-signal-risk-scanner/shared build
RUN pnpm --filter @website-signal-risk-scanner/web-bot-auth build
RUN pnpm --filter @website-signal-risk-scanner/db build
RUN pnpm --filter @website-signal-risk-scanner/validation-shared build
RUN pnpm --filter @website-signal-risk-scanner/validation-worker build
RUN pnpm --filter @website-signal-risk-scanner/validation-worker exec playwright install --with-deps chromium

CMD ["pnpm", "--filter", "@website-signal-risk-scanner/validation-worker", "start"]
