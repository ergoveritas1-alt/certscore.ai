import { readFileSync } from "node:fs";
import { getPredeployPlan } from "./predeploy.js";
import { RELEASE_REGRESSION_MATRIX, reviewReleaseRegressions, type ReleaseRegressionMatrix } from "./lib/scan-release-regressions.js";

const matrix = JSON.parse(readFileSync(RELEASE_REGRESSION_MATRIX, "utf8")) as ReleaseRegressionMatrix;
const calibration = JSON.parse(readFileSync("docs/certscore-v2/scan-quality-calibration-manifest.json", "utf8"));
if (calibration.layers?.deterministicFixtures?.releaseRegressionMatrix !== RELEASE_REGRESSION_MATRIX) {
  throw Error("The release regression matrix must belong to the canonical calibration manifest");
}
const result = reviewReleaseRegressions(process.cwd(), matrix, getPredeployPlan);
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
