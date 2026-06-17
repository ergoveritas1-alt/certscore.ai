import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function readRepoFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("dev image scripts refuse non-eu-central-1 AWS regions", async () => {
  const buildScript = await readRepoFile("scripts/local-v2-dag-lambda/build-push-dev-image.sh");
  const setupScript = await readRepoFile("scripts/local-v2-dag-lambda/setup-dev-aws-image.sh");

  assert.match(buildScript, /region="\$\{AWS_REGION:-eu-central-1\}"/);
  assert.match(buildScript, /Refusing to build\/push local v2 DAG Lambda image outside eu-central-1/);
  assert.match(buildScript, /--provenance=false/);
  assert.match(buildScript, /--sbom=false/);
  assert.match(setupScript, /region="\$\{AWS_REGION:-eu-central-1\}"/);
  assert.match(setupScript, /Refusing to create local v2 DAG Lambda resources outside eu-central-1/);
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
  assert.match(setupScript, /between 512 and 10240 MB/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS/);
  assert.match(setupScript, /CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY/);
  assert.match(setupScript, /s3:GetObject/);
  assert.match(setupScript, /lambda:InvokeFunction/);
  assert.match(setupScript, /--memory-size "\$memory_size"/);
  assert.match(setupScript, /OPENAI_API_KEY/);
  assert.match(setupScript, /file:\/\/\$\{environment_json\}/);
  assert.doesNotMatch(setupScript, /certscore-prod|production/);
});

test("Dockerfile uses Playwright image and the local Lambda runtime bootstrap", async () => {
  const dockerfile = await readRepoFile("apps/v2-dag-lambda/Dockerfile");
  const bootstrap = await readRepoFile("apps/v2-dag-lambda/runtime-bootstrap.mjs");

  assert.match(dockerfile, /mcr\.microsoft\.com\/playwright:v1\.58\.2-noble/);
  assert.match(dockerfile, /runtime-bootstrap\.mjs/);
  assert.match(dockerfile, /PLAYWRIGHT_BROWSERS_PATH=\/ms-playwright/);
  assert.match(dockerfile, /CMD \["src\/handler\.handler"\]/);
  assert.match(bootstrap, /AWS_LAMBDA_RUNTIME_API/);
  assert.match(bootstrap, /runtime\/invocation\/next/);
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
