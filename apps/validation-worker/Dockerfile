FROM node:20-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV="production"
ENV PLAYWRIGHT_BROWSERS_PATH="/ms-playwright"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/validation-worker ./apps/validation-worker
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/scan-core ./packages/scan-core
COPY packages/validation-shared ./packages/validation-shared

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @website-signal-risk-scanner/shared build
RUN pnpm --filter @website-signal-risk-scanner/db build
RUN pnpm --filter @website-signal-risk-scanner/validation-shared build
RUN pnpm --filter @website-signal-risk-scanner/scan-core build
RUN pnpm --filter @website-signal-risk-scanner/validation-worker build
RUN pnpm --filter @website-signal-risk-scanner/validation-worker exec playwright install --with-deps chromium

CMD ["pnpm", "--filter", "@website-signal-risk-scanner/validation-worker", "start"]
