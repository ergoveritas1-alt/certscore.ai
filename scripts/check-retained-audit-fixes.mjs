import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const major = Number(process.versions.node.split(".")[0]);
if (major < 22 || major >= 25) throw Error("Use the repository-supported Node 22–24 runtime.");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--out")) throw Error("Usage: pnpm test:retained-audit-fixes [--out FRESH_DIRECTORY]");
const startedAtUtc = new Date().toISOString();
const out = resolve(root, args[1] ?? `artifacts/daily-scan-audit/runs/${startedAtUtc.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-combined-retained-fixes-${randomUUID().slice(0, 8)}`);
if (existsSync(out)) throw Error("Output directory must be fresh; prior receipts are immutable.");
mkdirSync(out, { recursive: true });
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");
const git = (...parameters) => execFileSync("git", parameters, { cwd: root, encoding: "utf8" }).trim();
const sourcePins = () => {
  const files = new Set([
    ...git("diff", "--name-only", "HEAD").split("\n"),
    ...git("ls-files", "--others", "--exclude-standard").split("\n"),
    "package.json", "pnpm-lock.yaml", "tsconfig.base.json", "apps/web/tsconfig.test.json",
  ]);
  return [...files].filter(file => /^(?:apps\/|packages\/|scripts\/|docs\/|package\.json$|pnpm-lock\.yaml$|tsconfig\.base\.json$)/.test(file) && existsSync(resolve(root, file)))
    .sort().map(file => ({ file, sha256: hash(resolve(root, file)) }));
};
const headBefore = git("rev-parse", "HEAD");
const before = sourcePins();
const tests = [
  "packages/certscore-contracts/src/retained-policy-recognition-five.test.ts",
  "apps/web/server/scans/retained-policy-recognition-pipeline.test.ts",
  "apps/web/server/scans/policy-document-quality-isolation.test.ts",
  "packages/certscore-scan-core/src/consent-cookie-read-gate.test.ts",
  "packages/certscore-scan-core/src/consent-invalid-baseline-work.test.ts",
  "packages/certscore-scan-core/src/confirmation-diagnostic-reasons.test.ts",
  "packages/certscore-scan-core/src/form-destination-bounds.test.ts",
  "packages/certscore-scan-core/src/form-destination-frame-isolation.test.ts",
  "packages/certscore-scan-core/src/request-payload-signals.test.ts",
  "packages/certscore-scan-core/src/accessibility-selector-precision.test.ts",
  "packages/certscore-scan-core/src/post-accept-form-capture.test.ts",
  "packages/certscore-scan-core/src/post-accept-form-frame-progress.test.ts",
  "packages/certscore-contracts/src/accessibility-audit.test.ts",
  "packages/certscore-contracts/src/post-accept-form-capture.test.ts",
  "packages/certscore-contracts/src/post-accept-form-reconciliation.test.ts",
  "apps/web/server/scans/form-destination-projection.test.ts",
  "apps/web/lib/scans/post-accept-form-projection.test.ts",
  "apps/web/server/scans/report-forms-parity.test.ts",
  "apps/web/lib/scans/accessibility-score-policy.test.ts",
  "apps/web/lib/scans/accessibility-report.test.tsx",
  "packages/certscore-scan-core/src/accessibility-example-budget.test.ts",
  "packages/certscore-scan-core/src/gpc-body-limit-retention.test.ts",
  "packages/certscore-scan-core/src/consent-action-label-eligibility.test.ts",
  "packages/certscore-scan-core/src/consent-action-label-preflight.test.ts",
  "apps/web/server/scans/policy-text-source-binding.test.ts",
  "apps/web/server/scans/policy-text-decoding.test.ts",
  "apps/web/server/scans/report-pdf-remediation.test.ts",
  "packages/certscore-scan-core/src/onetrust-confirmation-readback.test.ts",
  "apps/web/lib/pulse/projection.test.ts",
  "apps/web/lib/api-v2/after-action-summary.test.ts",
  "apps/web/lib/api-v2/scan-resource.test.ts",
  "apps/web/lib/scans/public-first-layer-consent-evidence.test.ts",
  "apps/web/lib/scans/after-action-report-eligibility.test.ts",
  "apps/web/lib/scans/policy-surface-url-hygiene.test.ts",
  "apps/web/lib/scans/policy-topic-witnesses.test.ts",
  "apps/web/lib/scans/policy-section-pipeline.test.ts",
  "apps/web/server/scans/retained-first-layer-pipeline.test.ts",
  "apps/web/server/scans/air-tab-inspection.test.ts",
  "apps/web/server/scans/final-consent-geometry-refresh.test.ts",
  "apps/web/server/scans/final-consent-geometry-recovery.test.ts",
  "apps/web/server/scans/structural-consent-projection.test.ts",
  "apps/web/lib/scans/gdpr-transparency-topic-evidence-adapter.test.ts",
  "apps/web/lib/scans/cookie-classification-v3.test.ts",
  "packages/certscore-api-contracts/src/choice-confirmation-summary.test.ts",
  "packages/certscore-contracts/src/consent-control-label-classifier.test.ts",
  "packages/certscore-contracts/src/consent-control-assessment.test.ts",
  "packages/certscore-contracts/src/consent-control-inspection.test.ts",
  "packages/certscore-contracts/src/consent-action-stages.test.ts",
  "packages/certscore-contracts/src/consent-category-diagnostics.test.ts",
  "packages/certscore-contracts/src/consent-confirmation-diagnostics.test.ts",
  "packages/certscore-contracts/src/consent-receipt-availability.test.ts",
  "packages/certscore-contracts/src/post-accept-observation.test.ts",
  "packages/certscore-contracts/src/post-refusal-observation.test.ts",
  "packages/certscore-contracts/src/choice-path-execution.test.ts",
  "packages/certscore-contracts/src/article13-disclosure-rejection.test.ts",
  "packages/certscore-contracts/src/retained-competition-retention.test.ts",
  "packages/certscore-contracts/src/retained-controller-postal.test.ts",
  "packages/certscore-contracts/src/retained-personal-category-retention.test.ts",
  "packages/certscore-contracts/src/retained-prize-recipients.test.ts",
  "packages/certscore-contracts/src/gdpr-transparency-topic-classifier.test.ts",
  "packages/certscore-scan-core/src/policy-topic-witnesses.test.ts",
  "packages/certscore-scan-core/src/receipt-availability-bounds.test.ts",
  "packages/certscore-scan-core/src/consent-receipt-capture.test.ts",
  "packages/certscore-scan-core/src/consent-geometry-inventory-coverage.test.ts",
  "packages/certscore-contracts/src/consent-state-decision.test.ts",
  "packages/certscore-scan-core/src/documented-consent-api.protocol.test.ts",
    "packages/certscore-scan-core/src/cookieyes-legacy-consent-state.test.ts",
  "packages/certscore-scan-core/src/consent-final-geometry-refresh.test.ts",
  "packages/certscore-scan-core/src/consent-structural-coverage.test.ts",
  "packages/certscore-scan-core/src/consent-ui-recapture.test.ts",
  "packages/certscore-scan-core/src/pre-consent-gates.test.ts",
  "packages/certscore-scan-core/src/document-bound-capture.test.ts",
  "packages/certscore-scan-core/src/journey-builder.test.ts",
  "packages/certscore-vendor-resolver/src/cookie-knowledge-base.test.ts",
  "packages/certscore-vendor-resolver/src/cookie-classification-v3.test.ts",
  "packages/certscore-vendor-resolver/src/retained-cookie-purpose-review.test.ts",
  "packages/certscore-vendor-resolver/src/c3-cookie-coverage.test.ts",
  "packages/certscore-vendor-resolver/src/vendor-coverage.test.ts",
  "packages/certscore-vendor-resolver/src/x-cookie-purpose.test.ts",
  "packages/certscore-vendor-resolver/src/google-security-cookie.test.ts",
  "packages/certscore-vendor-resolver/src/funding-choices-analytics.test.ts",
];
const checks = [];
async function run(label, parameters) {
  const log = resolve(out, `${label}.log`);
  const fd = openSync(log, "wx");
  const start = Date.now();
  let exitCode;
  try {
    exitCode = await new Promise((resolveExit, reject) => {
      const child = spawn(process.execPath, parameters, { cwd: root,
        env: { ...process.env, TSX_TSCONFIG_PATH: resolve(root, "apps/web/tsconfig.test.json") },
        stdio: ["ignore", fd, fd] });
      child.once("error", reject);
      child.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
    });
  } finally { closeSync(fd); }
  const text = readFileSync(log, "utf8");
  checks.push({ label, command: [process.execPath, ...parameters], exitCode,
    durationMs: Date.now() - start, log, logSha256: hash(log),
    ...(label === "focused-tests" ? { tests: Number(/^# tests (\d+)$/m.exec(text)?.[1] ?? 0),
      passed: Number(/^# pass (\d+)$/m.exec(text)?.[1] ?? 0), failed: Number(/^# fail (\d+)$/m.exec(text)?.[1] ?? 0) } : {}) });
  console.log(`${label}: ${exitCode === 0 ? "passed" : "FAILED"} (${relative(root, log)})`);
  if (exitCode !== 0) throw Error(`${label} failed; inspect ${log}`);
}
let error;
try {
  await run("focused-tests", ["--import", "tsx", "--test", "--test-concurrency=1", ...tests]);
  for (const name of ["certscore-contracts", "certscore-api-contracts", "certscore-vendor-resolver", "certscore-scan-core"])
    await run(`${name}-types`, ["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false", "-p", `packages/${name}/tsconfig.json`]);
  await run("web-fixture-types", ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "scripts/retained-audit-fixes-tsconfig.json"]);
} catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
const after = sourcePins();
const sourceUnchanged = headBefore === git("rev-parse", "HEAD") && JSON.stringify(before) === JSON.stringify(after);
if (!sourceUnchanged) error = [error, "Source changed during validation; rerun on the final source."].filter(Boolean).join(" ");
const receipt = { version: "certscore.retained-audit-fixes-validation.v1", startedAtUtc,
  completedAtUtc: new Date().toISOString(), node: process.version, gitHead: headBefore,
  status: error ? "failed" : "passed", sourceUnchanged, sourcePins: before, checks, testFiles: tests,
  scope: "Local retained-fixture and focused contract/projection checks only", error: error ?? null,
  newScans: 0, cloudQueries: 0, deployments: 0, paidUsageUsd: 0, scheduledInvocationsAdded: 0 };
const receiptFile = resolve(out, "validation-receipt.json");
writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
console.log(`Validation receipt: ${receiptFile}`);
if (error) { console.error(error); process.exitCode = 1; }
