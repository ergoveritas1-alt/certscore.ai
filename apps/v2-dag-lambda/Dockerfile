FROM mcr.microsoft.com/playwright:v1.51.1-noble AS build

WORKDIR /workspace
ENV CI=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN corepack enable && corepack prepare pnpm@10.6.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/v2-dag-lambda ./apps/v2-dag-lambda

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @certscore/contracts build
RUN pnpm --filter @certscore/vendor-resolver build
RUN pnpm --filter @certscore/review-engine build
RUN pnpm --filter @certscore/report-adapter build
RUN pnpm --filter @certscore/scan-core build
RUN pnpm --filter @website-signal-risk-scanner/v2-dag-lambda build
RUN pnpm --filter @website-signal-risk-scanner/v2-dag-lambda --prod deploy --legacy /lambda
RUN rm -rf /lambda/src \
  && mkdir -p /lambda/src \
  && cp /workspace/apps/v2-dag-lambda/dist/apps/v2-dag-lambda/src/handler.js /lambda/src/handler.js
RUN for package_name in contracts vendor-resolver review-engine report-adapter scan-core; do \
    package_dir="/lambda/node_modules/@certscore/${package_name}"; \
    source_dir="/workspace/packages/certscore-${package_name}/dist"; \
    if [ -d "$package_dir" ] && [ -d "$source_dir" ]; then \
      rm -rf "${package_dir}/dist"; \
      cp -R "$source_dir" "${package_dir}/dist"; \
    fi; \
  done

FROM mcr.microsoft.com/playwright:v1.51.1-noble

WORKDIR /var/task
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR=/tmp/certscore-v2-dag-lambda

RUN npm install -g aws-lambda-ric@3

COPY --from=build /lambda ./

ENTRYPOINT ["npx", "aws-lambda-ric"]
CMD ["src/handler.handler"]
