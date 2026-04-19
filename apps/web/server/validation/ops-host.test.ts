import test from "node:test";
import assert from "node:assert/strict";
import { buildValidationOpsUrl, getValidationOpsHostState } from "./ops-host";

test("treats validation ops as external when base URL is configured on the main app", () => {
  const env = {
    APP_FLAVOR: "certscore",
    VALIDATION_OPS_BASE_URL: "https://validation.certscore.ai"
  } as unknown as NodeJS.ProcessEnv;

  assert.deepEqual(getValidationOpsHostState(env), {
    baseUrl: "https://validation.certscore.ai",
    hostedOnDedicatedOpsApp: true
  });
  assert.equal(buildValidationOpsUrl("/app/validation/scans?page=2", env), "https://validation.certscore.ai/app/validation/scans?page=2");
});

test("does not externalize validation routes on the dedicated validation app", () => {
  const env = {
    APP_FLAVOR: "validation_ops",
    VALIDATION_OPS_BASE_URL: "https://validation.certscore.ai"
  } as unknown as NodeJS.ProcessEnv;

  assert.deepEqual(getValidationOpsHostState(env), {
    baseUrl: "https://validation.certscore.ai",
    hostedOnDedicatedOpsApp: false
  });
});
