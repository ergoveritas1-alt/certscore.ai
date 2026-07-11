import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function readRepoFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("dev image scripts allow the approved Lambda scan regions", async () => {
  const buildScript = await readRepoFile("scripts/local-v2-dag-lambda/build-push-dev-image.sh");
  const setupScript = await readRepoFile("scripts/local-v2-dag-lambda/setup-dev-aws-image.sh");

  assert.match(buildScript, /region="\$\{AWS_REGION:-eu-central-1\}"/);
  assert.match(buildScript, /eu-central-1\|eu-west-1\|us-west-2/);
  assert.match(buildScript, /Unsupported local v2 DAG Lambda image region/);
  assert.match(buildScript, /--provenance=false/);
  assert.match(buildScript, /--sbom=false/);
  assert.match(buildScript, /CERTSCORE_V2_DAG_LAMBDA_RUNTIME_BASE_TAG/);
  assert.match(buildScript, /push_runtime_base="\$\{CERTSCORE_V2_DAG_LAMBDA_PUSH_RUNTIME_BASE:-false\}"/);
  assert.match(buildScript, /use_runtime_base="\$\{CERTSCORE_V2_DAG_LAMBDA_USE_RUNTIME_BASE:-true\}"/);
  assert.match(buildScript, /CERTSCORE_V2_DAG_LAMBDA_BUILD_CACHE_TAG/);
  assert.match(buildScript, /CERTSCORE_V2_DAG_LAMBDA_RUNTIME_BASE_CACHE_TAG/);
  assert.match(buildScript, /CERTSCORE_V2_DAG_LAMBDA_ECR_AUTH_ONLY/);
  assert.match(buildScript, /CERTSCORE_V2_DAG_LAMBDA_SKIP_ECR_LOGIN/);
  assert.match(buildScript, /Authenticated Docker to/);
  assert.match(buildScript, /Docker\.app\/Contents\/Resources\/cli-plugins\/docker-buildx/);
  assert.match(buildScript, /\$DOCKER_CONFIG\/cli-plugins\/docker-buildx/);
  assert.match(buildScript, /--target lambda-runtime-base/);
  assert.match(buildScript, /CERTSCORE_LAMBDA_RUNTIME_BASE=\$\{runtime_base_image_uri\}/);
  assert.match(buildScript, /--build-arg "BUILD_GIT_SHA=\$\{build_git_sha\}"/);
  assert.match(buildScript, /--build-arg "BUILD_IMAGE_TAG=\$\{build_image_tag\}"/);
  assert.match(buildScript, /--build-arg "SCANNER_RUNTIME_VERSION=\$\{scanner_runtime_version\}"/);
  assert.match(buildScript, /--cache-from "type=registry,ref=\$\{runtime_base_cache_image_uri\}"/);
  assert.match(buildScript, /--cache-to "type=registry,ref=\$\{runtime_base_cache_image_uri\},mode=max"/);
  assert.match(buildScript, /Runtime base image not found: \$\{runtime_base_image_uri\}/);
  assert.match(buildScript, /Routine scanner deploys reuse this prebuilt Chromium base by default/);
  assert.match(buildScript, /CERTSCORE_V2_DAG_LAMBDA_PUSH_RUNTIME_BASE=true \$0/);
  assert.match(buildScript, /CERTSCORE_V2_DAG_LAMBDA_USE_RUNTIME_BASE=false \$0/);
  assert.match(buildScript, /runtime_base_action="reused-existing"/);
  assert.match(buildScript, /CERTSCORE_V2_DAG_LAMBDA_RUNTIME_BASE_ACTION=\$\{runtime_base_action\}/);
  assert.match(buildScript, /--cache-from "type=registry,ref=\$\{build_cache_image_uri\}"/);
  assert.match(buildScript, /--cache-to "type=registry,ref=\$\{build_cache_image_uri\},mode=max"/);
  assert.match(setupScript, /region="\$\{AWS_REGION:-eu-central-1\}"/);
  assert.match(setupScript, /eu-central-1\) location_env_prefix="EU_DE"/);
  assert.match(setupScript, /eu-west-1\) location_env_prefix="EU_IE"/);
  assert.match(setupScript, /us-west-2\) location_env_prefix="US_WEST"/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_LOCATION_ENV_PREFIX="\$location_env_prefix"/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: "en-IE,en;q=0\.9"/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: "en-IE"/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: "Europe\/Dublin"/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_\$\{location_env_prefix\}_RESULT_QUEUE_URL/);
  assert.match(setupScript, /CERTSCORE_CHROMIUM_EXECUTABLE_PATH: "\/usr\/bin\/chromium"/);
  assert.doesNotMatch(setupScript, /PLAYWRIGHT_BROWSERS_PATH/);
});

test("dev image setup uses local names and refuses non-dev resource names", async () => {
  const setupScript = await readRepoFile("scripts/local-v2-dag-lambda/setup-dev-aws-image.sh");

  assert.match(setupScript, /certscore-v2-dag-local/);
  assert.match(setupScript, /Refusing non-dev\/local Lambda function name/);
  assert.match(setupScript, /Refusing non-dev\/local SQS queue name/);
  assert.match(setupScript, /--package-type Image/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_MEMORY_SIZE/);
  assert.match(setupScript, /memory_size="\$\{CERTSCORE_V2_DAG_LAMBDA_MEMORY_SIZE:-3008\}"/);
  assert.match(setupScript, /between 512 and 10240 MB/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS: "15000"/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS: "15000"/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY: "1"/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE: "cmp_safe"/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT/);
  assert.match(setupScript, /CERTSCORE_CHROMIUM_ACCEPT_LANGUAGE/);
  assert.match(setupScript, /CERTSCORE_CHROMIUM_LOCALE/);
  assert.match(setupScript, /CERTSCORE_CHROMIUM_TIMEZONE_ID/);
  assert.match(setupScript, /CERTSCORE_CHROMIUM_USER_AGENT/);
  assert.match(setupScript, /s3:GetObject/);
  assert.match(setupScript, /lambda:InvokeFunction/);
  assert.match(setupScript, /\$\{prefix\}-production-results/);
  assert.match(setupScript, /--memory-size "\$memory_size"/);
  assert.match(setupScript, /OPENAI_API_KEY/);
  assert.match(setupScript, /file:\/\/\$\{environment_json\}/);
  assert.doesNotMatch(setupScript, /certscore-prod|certscore-v2-dag-production/);
});

test("Lambda setup disables default async retries and bounds event age", async () => {
  const imageSetup = await readRepoFile("scripts/local-v2-dag-lambda/setup-dev-aws-image.sh");
  const zipSetup = await readRepoFile("scripts/local-v2-dag-lambda/setup-dev-aws.sh");

  for (const source of [imageSetup, zipSetup]) {
    assert.match(source, /put-function-event-invoke-config/);
    assert.match(source, /--maximum-event-age-in-seconds 60/);
    assert.match(source, /--maximum-retry-attempts 0/);
    assert.match(source, /--destination-config "OnFailure=\{Destination=\$\{failure_queue_arn\}\}"/);
  }
});

test("local Lambda parity harness uses the Lambda pre-consent visual budget", async () => {
  const parityScript = await readRepoFile("scripts/run-local-v2-dag-lambda-parity.ts");

  assert.match(parityScript, /LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_SCREENSHOT_TIMEOUT_MS/);
  assert.match(parityScript, /LOCAL_V2_DAG_LAMBDA_DEFAULT_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS/);
  assert.match(parityScript, /CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS/);
  assert.doesNotMatch(parityScript, /CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS = "5000"/);
});

test("Dockerfile uses slim Node image, system Chromium, and the local Lambda runtime bootstrap", async () => {
  const dockerfile = await readRepoFile("apps/v2-dag-lambda/Dockerfile");
  const bootstrap = await readRepoFile("apps/v2-dag-lambda/runtime-bootstrap.mjs");

  assert.match(dockerfile, /# syntax=docker\/dockerfile:1\.7/);
  assert.match(dockerfile, /ARG CERTSCORE_LAMBDA_RUNTIME_BASE=lambda-runtime-base/);
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS build/);
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS lambda-runtime-base/);
  assert.match(dockerfile, /FROM \$\{CERTSCORE_LAMBDA_RUNTIME_BASE\} AS runtime/);
  assert.match(dockerfile, /FROM node:22-bookworm-slim/);
  assert.match(dockerfile, /COPY \.npmrc package\.json pnpm-lock\.yaml pnpm-workspace\.yaml tsconfig\.base\.json \.\//);
  assert.match(dockerfile, /COPY apps\/v2-dag-lambda\/package\.json \.\/apps\/v2-dag-lambda\/package\.json/);
  assert.match(dockerfile, /COPY packages\/certscore-scan-core\/package\.json \.\/packages\/certscore-scan-core\/package\.json/);
  assert.match(dockerfile, /--mount=type=cache,id=wc01-v2-dag-lambda-pnpm-store,target=\/pnpm\/store/);
  assert.match(dockerfile, /pnpm install --frozen-lockfile/);
  assert.match(dockerfile, /COPY packages \.\/packages/);
  assert.match(dockerfile, /COPY apps\/v2-dag-lambda\/src \.\/apps\/v2-dag-lambda\/src/);
  assert.match(dockerfile, /COPY apps\/v2-dag-lambda\/tsconfig\.json \.\/apps\/v2-dag-lambda\/tsconfig\.json/);
  assert.match(dockerfile, /pnpm --filter @website-signal-risk-scanner\/v2-dag-lambda bundle/);
  assert.match(dockerfile, /\/lambda-deps/);
  assert.match(dockerfile, /dist-bundle\/src\/handler\.js/);
  assert.match(dockerfile, /cp -R \/lambda-deps\/node_modules\/playwright \/lambda\/node_modules\/playwright/);
  assert.match(dockerfile, /cp -R \/lambda-deps\/node_modules\/playwright-core \/lambda\/node_modules\/playwright-core/);
  assert.match(dockerfile, /apt-get install -y --no-install-recommends/);
  assert.match(dockerfile, /chromium/);
  assert.match(dockerfile, /ARG CERTSCORE_LAMBDA_BROWSER_PACKAGE=chromium/);
  assert.match(dockerfile, /ARG CERTSCORE_LAMBDA_BROWSER_EXECUTABLE=\/usr\/bin\/chromium/);
  assert.match(dockerfile, /ARG BUILD_GIT_SHA=""/);
  assert.match(dockerfile, /ARG BUILD_IMAGE_TAG=""/);
  assert.match(dockerfile, /ARG SCANNER_RUNTIME_VERSION="certscore-v2-dag-parallel-path"/);
  assert.match(dockerfile, /BUILD_GIT_SHA="\$\{BUILD_GIT_SHA\}"/);
  assert.match(dockerfile, /BUILD_IMAGE_TAG="\$\{BUILD_IMAGE_TAG\}"/);
  assert.match(dockerfile, /SCANNER_RUNTIME_VERSION="\$\{SCANNER_RUNTIME_VERSION\}"/);
  assert.match(dockerfile, /CERTSCORE_CHROMIUM_EXECUTABLE_PATH=\$\{CERTSCORE_LAMBDA_BROWSER_EXECUTABLE\}/);
  assert.match(dockerfile, /runtime-bootstrap\.mjs/);
  assert.doesNotMatch(dockerfile, /playwright install chromium/);
  assert.doesNotMatch(dockerfile, /PLAYWRIGHT_BROWSERS_PATH=\/ms-playwright/);
  assert.doesNotMatch(dockerfile, /COPY --from=build \/ms-playwright/);
  assert.doesNotMatch(dockerfile, /@certscore\/scan-core\/dist\/cli/);
  assert.match(dockerfile, /CMD \["src\/handler\.handler"\]/);
  assert.match(bootstrap, /AWS_LAMBDA_RUNTIME_API/);
  assert.match(bootstrap, /runtime\/invocation\/next/);
});

test("local Lambda zip packages the bundled handler with only Playwright runtime deps", async () => {
  const packageJson = await readRepoFile("apps/v2-dag-lambda/package.json");
  const zipScript = await readRepoFile("scripts/local-v2-dag-lambda/build-dev-zip.sh");

  assert.match(packageJson, /"bundle": "esbuild src\/handler\.ts --bundle --platform=node --target=node22 --format=cjs --outfile=dist-bundle\/src\/handler\.js --external:playwright --minify --tsconfig=\.\.\/\.\.\/tsconfig\.base\.json"/);
  assert.match(packageJson, /"esbuild": "\^0\.27\.3"/);
  assert.match(packageJson, /"clean": "rm -rf dist dist-bundle"/);
  assert.match(zipScript, /deps_dir="\$\{work_dir\}\/deps"/);
  assert.match(zipScript, /pnpm --filter @website-signal-risk-scanner\/v2-dag-lambda bundle/);
  assert.match(zipScript, /--prod deploy --legacy "\$deps_dir"/);
  assert.match(zipScript, /dist-bundle\/src\/handler\.js/);
  assert.match(zipScript, /node_modules\/playwright"/);
  assert.match(zipScript, /node_modules\/playwright-core"/);
  assert.doesNotMatch(zipScript, /@certscore\/scan-core\/dist\/cli/);
  assert.doesNotMatch(zipScript, /certscore-\$\{package_name\}\/dist/);
});

test("handler keeps Lambda outputs artifact-only and non-production", async () => {
  const handlerSource = await readRepoFile("apps/v2-dag-lambda/src/handler.ts");

  assert.match(handlerSource, /artifactOnly: true/);
  assert.match(handlerSource, /expectedConsentScenarios/);
  assert.match(handlerSource, /diagnosticExpectedScenarios/);
  assert.match(handlerSource, /actionTypeForConsentScenario/);
  assert.match(handlerSource, /productionFindingIntegration: false/);
  assert.doesNotMatch(handlerSource, /insert.*finding|checklistRows|executiveSummary|score:/i);
});

test("local Lambda parity cohort runner bounds per-site hangs with explicit quality artifacts", async () => {
  const cohortRunner = await readRepoFile("scripts/run-local-v2-dag-lambda-parity-cohort.ts");

  assert.match(cohortRunner, /siteTimeoutMs: 180_000/);
  assert.match(cohortRunner, /--site-timeout-ms/);
  assert.match(cohortRunner, /cohort_site_command_timeout/);
  assert.match(cohortRunner, /cohort_site_completed_after_wrapper_timeout/);
  assert.match(cohortRunner, /readCompletedSiteSummary/);
  assert.match(cohortRunner, /SIGKILL/);
  assert.match(cohortRunner, /timed out after \$\{options\.timeoutMs\}ms/);
  assert.match(cohortRunner, /cohort_site_timeout_before_scenario_quality/);
  assert.match(cohortRunner, /difficult10Sites/);
  assert.match(cohortRunner, /goldCohortSiteForUrl/);
  assert.match(cohortRunner, /gold_metadata_hydrated_for_local_lambda_parity/);
  assert.match(cohortRunner, /scenarioQuality: input\.siteMetadata\.expectedLanes/);
  assert.match(cohortRunner, /exercisedByWorker/);
  assert.match(cohortRunner, /goldExpectedButNotPlanned\.length === 0/);
  assert.match(cohortRunner, /!scenario\.plannedByCoordinator && !scenario\.expectedByGold && !scenario\.exercisedByWorker/);
  assert.match(cohortRunner, /input\.expectedByGold && !input\.plannedByCoordinator && !input\.exercisedByWorker/);
  assert.match(cohortRunner, /no_relevant_action_scenarios/);
  assert.match(cohortRunner, /topFailureBucketsForReport/);
  assert.match(cohortRunner, /isVagueActionLimitation/);
  assert.match(cohortRunner, /vague_action_limitation/);
  assert.match(cohortRunner, /privacy_center_surface_observed_without_verifiable_opt_out_control/);
  assert.match(cohortRunner, /privacy_control_click_without_verifiable_state_change/);
  assert.match(cohortRunner, /privacy_control_observed_without_clickable_target/);
  assert.match(cohortRunner, /privacy_control_target_closed_before_quality_artifact/);
  assert.match(cohortRunner, /planner_text_control_not_reacquired/);
  assert.match(cohortRunner, /privacy_control_not_observed/);
  assert.match(cohortRunner, /preference_center_action_not_observed/);
  assert.match(cohortRunner, /scenario_deadline_before_quality_artifact/);
  assert.match(cohortRunner, /scenario_failed_before_quality_artifact/);
  assert.match(cohortRunner, /banner_still_present_after_click\|action_not_completed\|attempted_not_succeeded/);
  assert.match(cohortRunner, /fallbackPrivacyControlUrls/);
  assert.match(cohortRunner, /expectedConsentScenarios/);
  assert.match(cohortRunner, /\/privacy-choices/);
  assert.match(cohortRunner, /\/do-not-sell/);
  assert.match(cohortRunner, /productionFindingIntegration: false/);
});

test("consent geometry ARO no-go Lambda gate stays artifact-only and review-gated", async () => {
  const packageJson = await readRepoFile("package.json");
  const gateScript = await readRepoFile("scripts/run-consent-geometry-aro-nogo-lambda-gate.ts");
  const cohorts = await readRepoFile("scripts/config/consent-geometry-aro-nogo-cohorts.json");

  assert.match(packageJson, /"v2:consent-geometry-aro-nogo-gate"/);
  assert.match(gateScript, /artifactOnly: true/);
  assert.match(gateScript, /productionFindingIntegration: false/);
  assert.match(gateScript, /resultHandoff: "sqs"/);
  assert.match(gateScript, /cleanupSqsMessages/);
  assert.match(gateScript, /runAwsWithRetry/);
  assert.match(gateScript, /AWS_CLI_READ_TIMEOUT/);
  assert.match(gateScript, /isRetryableAwsCliError/);
  assert.match(gateScript, /recoverLambdaResponseFromSqs/);
  assert.match(gateScript, /recoveredFromSqs/);
  assert.match(gateScript, /consent-geometry-review/);
  assert.match(gateScript, /consent-geometry-final-summary/);
  assert.match(gateScript, /human-adjudication-priority\.csv/);
  assert.match(gateScript, /human-adjudication-template\.csv|final-cohort-summary\.json/);
  assert.match(gateScript, /hasRequiredLoadedVisualProof/);
  assert.match(gateScript, /scannerObservedControl/);
  assert.doesNotMatch(gateScript, /post.?consent|consentFlowScreenshotMode/i);

  const parsed = JSON.parse(cohorts) as { adversarial?: unknown[]; baseline?: unknown[]; expanded?: unknown[] };
  assert.ok((parsed.baseline?.length ?? 0) >= 10);
  assert.ok((parsed.expanded?.length ?? 0) > (parsed.baseline?.length ?? 0));
  assert.ok((parsed.adversarial?.length ?? 0) >= 50);
  assert.ok((parsed.adversarial?.length ?? 0) > (parsed.expanded?.length ?? 0));
  assert.ok(parsed.expanded?.includes("nbcnews.com"));
  assert.ok(parsed.expanded?.includes("numastays.com"));
  assert.ok(parsed.adversarial?.includes("dailymotion.com"));
  assert.ok(parsed.adversarial?.includes("microsoft.com"));
  assert.ok(parsed.adversarial?.includes("cloudflare.com"));
});
