import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AWS deployment enables only the owner-approved bounded coverage policy", async () => {
  const deployment = await readFile(new URL("./deploy-fast.ts", import.meta.url), "utf8");
  assert.match(deployment, /CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED:\s*"1"/);
  assert.match(deployment, /CERTSCORE_CMP_PREFERENCE_COVERAGE_BUDGET_POLICY:\s*"coverage_25_gb_seconds.v1"/);
  assert.match(deployment, /CERTSCORE_ACCESSIBILITY_MENU_INSPECTION_ENABLED:\s*"1"/);
  assert.match(deployment, /CERTSCORE_POST_ACCEPT_WORKER_ENABLED:\s*"1"/);
  assert.match(deployment, /CERTSCORE_POST_REFUSAL_REJECT_WORKER_ENABLED:\s*"1"/);
  const parity = await readFile(new URL("./check-regional-scanner-parity.ts", import.meta.url), "utf8");
  assert.match(parity, /\["Read-only preferences worker", env\.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED, "1"\]/);
  assert.match(parity, /\["Preference coverage budget", env\.CERTSCORE_CMP_PREFERENCE_COVERAGE_BUDGET_POLICY, "coverage_25_gb_seconds.v1"\]/);
  assert.match(parity, /\["Navigation-menu accessibility inspection", env\.CERTSCORE_ACCESSIBILITY_MENU_INSPECTION_ENABLED, "1"\]/);
  const promotion = deployment.indexOf("const results = await Promise.all(SCANNER_REGIONS.map(async (region)");
  const coverage = deployment.indexOf("await applyScannerRuntimeConfiguration(true)");
  assert.ok(promotion > 0 && coverage > promotion);
  assert.ok(coverage < deployment.indexOf('details.regionParity = "passed"'));
  assert.match(deployment, /async function applyScannerRuntimeConfiguration\(enableCoverage = false\)/);
  assert.match(deployment, /enableCoverage \? SCANNER_COVERAGE_ENVIRONMENT : \{\}/);
});
