import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production and cohort shadow comparisons use the exact customer-report row projection", async () => {
  const [service, cohortRunner] = await Promise.all([
    readFile("apps/web/server/scans/canonical-shadow-score-service.ts", "utf8"),
    readFile("apps/web/scripts/run-canonical-shadow-score-production-cohort.ts", "utf8")
  ]);
  const exactReportCoveragePipeline = /deriveGdprEprivacyUsableCoverageSummary\(\s*getReportableGdprEprivacyCoverageItems\(projection\.checklistRows\)\s*\)/s;

  assert.match(service, exactReportCoveragePipeline);
  assert.match(cohortRunner, exactReportCoveragePipeline);
});
