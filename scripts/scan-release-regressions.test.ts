import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getPredeployPlan } from "./predeploy.js";
import { commandWords, RELEASE_REGRESSION_MATRIX, reviewReleaseRegressions, type ReleaseRegressionMatrix } from "./lib/scan-release-regressions.js";

test("completed EU and California headline regressions run in fast web and full preflight", () => {
  const tests = [
    "apps/web/lib/scans/california-assessment-presentation.test.ts",
    "apps/web/components/scans/full-site-executive-summary.test.tsx",
    "apps/web/components/scans/site-priority-review.test.tsx",
    "apps/web/components/scans/completed-report-assessment-headline.test.tsx",
    "apps/web/lib/scans/regulatory-assessment-highlights.test.tsx",
    "apps/web/lib/scans/regulatory-review-catalog.test.tsx",
    "apps/web/lib/scans/top-finding-eligibility.test.ts",
    "apps/web/lib/scans/accessibility-report.test.tsx",
    "apps/web/lib/scans/california-priority-selection.test.ts",
    "apps/web/lib/scans/california-disclosure-priority.test.ts",
    "apps/web/lib/scans/california-agent-registration-presentation.test.ts",
  ];
  const script = JSON.parse(readFileSync("package.json", "utf8")).scripts["test:assessment-highlights"] as string;
  for (const file of tests) {
    assert.ok(script.split(/\s+/).includes(file), `assessment-highlights script omits ${file}`);
    for (const full of [false, true]) {
      const check = getPredeployPlan([file], { full }).checks.find(row => row.key === "assessment-highlights");
      assert.deepEqual(check?.command, ["pnpm", "test:assessment-highlights"], `${file}: ${full ? "full" : "fast"} preflight omits report headline regressions`);
    }
  }
});

test("CMP identity regressions run in fast and full release gates", () => {
  const inputs = ["packages/shared/src/known-cmps.ts", "packages/certscore-vendor-resolver/src/index.ts",
    "packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner.ts"];
  const tests = ["packages/shared/src/cmp-library-coverage.test.ts",
    "packages/certscore-vendor-resolver/src/cmp-library-coverage.test.ts",
    "packages/certscore-scan-core/src/cmp-attribution-capture.test.ts",
    "packages/certscore-scan-core/src/consent-geometry-checkpoint.test.ts",
    "packages/certscore-scan-core/src/cmp-library-coverage.test.ts"];
  for (const changed of [...inputs, ...tests]) {
    for (const full of [false, true]) {
      const commands = getPredeployPlan([changed], { full }).checks.flatMap(check => check.command);
      for (const file of tests) assert.ok(commands.includes(file), `${changed}: ${full ? "full" : "fast"} omits ${file}`);
    }
  }
});

test("Accept confirmation and diagnostic regressions run in fast and full release gates", () => {
  for (const changed of ["packages/certscore-scan-core/src/post-accept-observer.ts",
    "packages/certscore-scan-core/src/consent-control-geometry.ts",
    "packages/certscore-scan-core/src/consent-request-clock.test.ts",
    "packages/certscore-scan-core/src/consent-receipt-capture.ts",
    "packages/certscore-scan-core/src/public-network-guard.ts", "packages/certscore-contracts/src/consent-confirmation-diagnostics.ts",
    "packages/certscore-scan-core/src/cmp-api-consent-state.ts", "packages/certscore-scan-core/src/accept-confirmation-coverage.test.ts",
    "packages/certscore-scan-core/src/cmp-api-confirmation.ts",
    "packages/certscore-scan-core/src/cmp-control-actionability.ts",
    "packages/certscore-scan-core/src/cmp-action-control-proof.ts",
    "packages/certscore-scan-core/src/cmp-accessible-action.ts",
    "packages/certscore-scan-core/src/custom-accept-control.ts",
    "packages/certscore-scan-core/src/onetrust-document-binding.ts",
    "packages/certscore-scan-core/src/action-dom-storage-capture.ts",
    "packages/certscore-scan-core/src/confirmation-diagnostic-reasons.test.ts",
    "packages/certscore-scan-core/src/onetrust-consent-state.ts",
    "packages/certscore-scan-core/src/onetrust-sdk-source.ts",
    "packages/certscore-scan-core/src/consent-action-discovery.ts",
    "packages/certscore-scan-core/src/consent-document-readiness.ts",
    "packages/certscore-contracts/src/onetrust-applicability.ts",
    "packages/certscore-contracts/src/notification-acknowledgment.ts",
    "packages/certscore-scan-core/src/notification-acknowledgment.ts",
    "packages/certscore-scan-core/src/onetrust-confirmation-readback.test.ts"]) {
    for (const full of [false, true]) {
      const plan = getPredeployPlan([changed], { full });
      const checks = plan.checks.flatMap(check => check.command);
      for (const file of ["packages/certscore-contracts/src/consent-confirmation-diagnostics.test.ts",
        "packages/certscore-scan-core/src/accept-confirmation-coverage.test.ts",
        "packages/certscore-scan-core/src/reject-confirmation-coverage.test.ts",
        "packages/certscore-scan-core/src/cmp-api-consent-state.test.ts",
        "packages/certscore-scan-core/src/cmp-api-confirmation.test.ts",
        "packages/certscore-scan-core/src/cmp-control-actionability-deadline.test.ts",
        "packages/certscore-scan-core/src/cmp-action-control-proof-deadline.test.ts",
        "packages/certscore-scan-core/src/cmp-accessible-action.test.ts",
        "packages/certscore-scan-core/src/registered-contextual-accept.test.ts",
        "packages/certscore-scan-core/src/onetrust-document-binding.test.ts",
        "packages/certscore-scan-core/src/consent-control-read-budget.test.ts",
        "packages/certscore-scan-core/src/consent-request-clock.test.ts",
        "packages/certscore-scan-core/src/consent-receipt-capture.test.ts",
        "packages/certscore-contracts/src/consent-receipt-capture.test.ts",
        "packages/certscore-scan-core/src/public-network-guard.test.ts",
        "scripts/cmp-full-cohort-audit.test.ts",
        "packages/certscore-scan-core/src/onetrust-confirmation-readback.test.ts",
        "packages/certscore-scan-core/src/onetrust-sdk-applicability.test.ts",
        "packages/certscore-contracts/src/onetrust-applicability.test.ts",
        "packages/certscore-contracts/src/notification-acknowledgment.test.ts",
        "packages/certscore-scan-core/src/onetrust-control-resolution.test.ts",
        "packages/certscore-scan-core/src/onetrust-loading-resolution.test.ts",
        "packages/certscore-scan-core/src/registered-cmp-loading.test.ts",
        "packages/certscore-scan-core/src/consent-action-discovery.test.ts",
        "packages/certscore-scan-core/src/consent-search-readiness.test.ts",
        "packages/certscore-scan-core/src/consent-action-resolver-diagnostics.test.ts",
        "packages/certscore-scan-core/src/confirmation-diagnostic-reasons.test.ts"]) {
        assert.ok(checks.includes(file), `${changed}: ${full ? "full" : "fast"} omits ${file}`);
      }
    }
  }
});

test("the existing calibration release matrix has executable full and change-targeted regressions and controls", () => {
  const matrix = JSON.parse(readFileSync(RELEASE_REGRESSION_MATRIX, "utf8"));
  const review = reviewReleaseRegressions(process.cwd(), matrix, getPredeployPlan);
  assert.deepEqual(review.errors, []);
  assert.equal(review.passed, true);
});

test("scanner-only, worker-only and MCP-only changes retain their downstream publication and surface gates", () => {
  for (const file of ["packages/certscore-scan-core/src/index.ts", "apps/validation-worker/src/validation/local-v2-dag-lambda-results.ts"]) {
    const keys = getPredeployPlan([file]).checks.map(check => check.key);
    for (const key of ["scan-release-regression-review", "scan-no-go-release", "report-publication", "report-evidence-recovery", "canonical-projection-parity"]) {
      assert.ok(keys.includes(key), `${file} lost ${key}`);
      assert.equal(keys.filter(value => value === key).length, 1, `${key} should run once`);
    }
  }
  assert.ok(getPredeployPlan(["packages/certscore-mcp/src/server.ts"]).checks.some(check => check.key === "canonical-projection-parity"));
  assert.deepEqual(getPredeployPlan(["README.md"]).checks, [], "unrelated prose must not trigger a scanner gate");
  assert.ok(getPredeployPlan(["docs/certscore-v2/scan-quality-calibration-manifest.json"]).checks.some(check => check.key === "scan-release-regression-review"));
});

test("the preflight CLI still rejects invalid arguments when invoked through a symlink", () => {
  const root = mkdtempSync(path.join(tmpdir(), "certscore-preflight-entry-"));
  const entry = path.join(root, "preflight.ts");
  try {
    symlinkSync(path.resolve("scripts/predeploy.ts"), entry);
    const result = spawnSync(process.execPath, ["--import", "tsx", entry, "--invalid-review-argument"], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown argument: --invalid-review-argument/);
    assert.doesNotMatch(result.stdout, /Fast predeploy|\$ pnpm/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a missing comparison revision cannot turn a clean checkout into a successful empty preflight", () => {
  const root = mkdtempSync(path.join(tmpdir(), "certscore-preflight-base-"));
  try {
    const init = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const commit = spawnSync("git", ["-c", "user.name=CertScore.ai fixture", "-c", "user.email=fixture@example.test", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "commit", "--quiet", "--allow-empty", "-m", "fixture"], { cwd: root, encoding: "utf8" });
    assert.equal(commit.status, 0, commit.stderr);
    const entry = path.resolve("scripts/predeploy.ts");
    // Resolve the installed loader before changing cwd; no install or cloud call.
    const loader = createRequire(import.meta.url).resolve("tsx");
    // tsx --tsconfig exports its path to children; keep it valid in the temporary checkout.
    const env = { ...process.env, TSX_TSCONFIG_PATH: path.resolve("tsconfig.base.json") };
    for (const args of [["--base", "missing-review-revision"], ["--base="]]) {
      const result = spawnSync(process.execPath, ["--import", loader, entry, ...args], { cwd: root, encoding: "utf8", env });
      assert.equal(result.status, 1, `unsafe empty success: ${result.stdout}`);
      assert.match(result.stderr, /base.*(?:available|requires)/i);
    }
    const valid = spawnSync(process.execPath, ["--import", loader, entry, "--base", "HEAD"], { cwd: root, encoding: "utf8", env });
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /No changed files detected/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function fixture(run: (input: { root: string; matrix: ReleaseRegressionMatrix; plan: typeof getPredeployPlan; source: (value: string) => void }) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "certscore-release-coverage-"));
  mkdirSync(path.join(root, "apps"));
  mkdirSync(path.join(root, "packages/unit"), { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {
    verify: "pnpm --filter @fixture/unit test && node --import tsx --test other.test.ts",
  } }));
  writeFileSync(path.join(root, "packages/unit/package.json"), JSON.stringify({ name: "@fixture/unit", scripts: {
    test: "node --import tsx --test --test-name-pattern='^reject|^allow' 'src/*.test.ts'",
  } }));
  mkdirSync(path.join(root, "packages/unit/src"));
  writeFileSync(path.join(root, "changed.ts"), "export {};\n");
  const source = (value: string) => writeFileSync(path.join(root, "packages/unit/src/proof.test.ts"), value);
  source("import test from 'node:test'; test('reject bad source',()=>{}); test('allow valid source',()=>{});");
  const ref = (name: string) => ({ file: "packages/unit/src/proof.test.ts", test: name, expectation: "source-bound result", fastChanges: ["changed.ts"] });
  const matrix: ReleaseRegressionMatrix = { schemaVersion: "certscore.scan_release_regressions.v1", cases: [{
    id: "source-proof", risk: "source isolation", issues: [], regression: ref("reject bad source"), control: ref("allow valid source"),
  }] };
  const plan = () => ({ targets: ["unit"], checks: [{ key: "unit", label: "unit", command: ["pnpm", "verify"] }] });
  try { run({ root, matrix, plan, source }); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("coverage follows quoted workspace scripts, nested pnpm commands and test-file globs without running them", () => {
  fixture(({ root, matrix, plan }) => {
    const review = reviewReleaseRegressions(root, matrix, plan);
    assert.equal(review.passed, true, review.errors.join("\n"));
  });
});

test("removing the full or fast runner is a coverage failure even though its tests still exist", () => {
  fixture(({ root, matrix, plan }) => {
    for (const missing of ["full", "fast"] as const) {
      const review = reviewReleaseRegressions(root, matrix, (files, options) =>
        Boolean(options?.full) === (missing === "full") ? { checks: [] } : plan(files, options));
      assert.equal(review.passed, false);
      assert.ok(review.errors.some(error => error.includes(missing === "full" ? "full preflight" : "fast preflight")));
    }
  });
});

test("a title in a comment, a renamed test or ambiguous duplicate declarations cannot count as coverage", () => {
  fixture(({ root, matrix, plan, source }) => {
    for (const text of [
      "// test('reject bad source',()=>{});\ntest('allow valid source',()=>{});",
      "test('renamed',()=>{}); test('allow valid source',()=>{});",
      "test('reject bad source',()=>{}); test('reject bad source',()=>{}); test('allow valid source',()=>{});",
    ]) {
      source(text);
      const review = reviewReleaseRegressions(root, matrix, plan);
      assert.equal(review.passed, false);
      assert.ok(review.errors.some(error => error.includes("test missing, ambiguous or skipped")));
    }
  });
});

test("skip, todo and runtime skip cannot masquerade as an exercised regression", () => {
  fixture(({ root, matrix, plan, source }) => {
    for (const declaration of [
      "test.skip('reject bad source',()=>{});",
      "test.todo('reject bad source',()=>{});",
      "test('reject bad source',{skip:true},()=>{});",
      "test('reject bad source',{'skip':true},()=>{});",
      "test('reject bad source',t=>{t.skip('not exercised');});",
    ]) {
      source(declaration + "test('allow valid source',()=>{});");
      assert.equal(reviewReleaseRegressions(root, matrix, plan).passed, false);
    }
  });
});

test("a nested declaration cannot borrow an independently addressable top-level test name", () => {
  fixture(({ root, matrix, plan, source }) => {
    for (const wrapper of ["describe", "describe.skip", "test"]) {
      source(`${wrapper}('parent',()=>{test('reject bad source',()=>{});}); test('allow valid source',()=>{});`);
      assert.equal(reviewReleaseRegressions(root, matrix, plan).passed, false);
    }
  });
});

test("test-name, skip-name and only filters cannot silently exclude a required control", () => {
  fixture(({ root, matrix }) => {
    for (const filter of ["--test-name-pattern=^reject", "--test-skip-pattern=^allow", "--test-only"]) {
      const plan = () => ({ checks: [{ key: "filtered", label: "filtered", command: ["node", "--import", "tsx", "--test", filter, "packages/unit/src/proof.test.ts"] }] });
      const review = reviewReleaseRegressions(root, matrix, plan);
      assert.equal(review.passed, false);
      assert.ok(review.errors.some(error => error.includes("source-proof/control")));
    }
  });
});

test("mentioning a test path in a runner option does not execute the file", () => {
  fixture(({ root, matrix }) => {
    const plan = () => ({ checks: [{ key: "wrong-file", label: "wrong-file", command: ["node", "--test", "--test-reporter-destination", "packages/unit/src/proof.test.ts", "other.test.ts"] }] });
    assert.equal(reviewReleaseRegressions(root, matrix, plan).passed, false);
  });
});

test("missing controls, duplicate case IDs and paths outside the repository fail the review", () => {
  fixture(({ root, matrix, plan }) => {
    const duplicate = structuredClone(matrix); duplicate.cases.push(duplicate.cases[0]!);
    assert.throws(() => reviewReleaseRegressions(root, duplicate, plan), /duplicate/);
    const missing = structuredClone(matrix); delete (missing.cases[0] as Partial<typeof missing.cases[0]>)!.control;
    assert.throws(() => reviewReleaseRegressions(root, missing, plan), /Missing control/);
    const external = structuredClone(matrix); external.cases[0]!.control.file = "../external.test.ts";
    assert.throws(() => reviewReleaseRegressions(root, external, plan), /stay in the repository/);
    const nonexistent = structuredClone(matrix); nonexistent.cases[0]!.control.fastChanges = ["missing.ts"];
    assert.throws(() => reviewReleaseRegressions(root, nonexistent, plan), /ENOENT|Missing representative/);
  });
});

test("shell interpretation, unsupported operators and unterminated quotes cannot establish coverage", () => {
  assert.deepEqual(commandWords("node --test --test-name-pattern='^reject bad|^allow good' 'src/*.test.ts'"),
    ["node", "--test", "--test-name-pattern=^reject bad|^allow good", "src/*.test.ts"]);
  for (const command of ["node --test a.test.ts; true", "node --test $(read-secret)", "node --test 'unclosed"]) {
    assert.throws(() => commandWords(command));
  }
});


test("CMP runtime visitor and coordinator edits run offline halt gates in fast and full plans", () => {
  for (const file of ["scripts/cmp-paired-runtime-visit.cjs", "scripts/cmp-paired-runtime-visit.test.cjs", "scripts/cmp-paired-runtime-runner.py", "scripts/cmp-paired-runtime-runner.test.py"]) {
    for (const full of [false, true]) {
      const keys = getPredeployPlan([file], { full }).checks.map(check => check.key);
      assert.ok(keys.includes("cmp-runtime-visitor"), file);
      assert.ok(keys.includes("cmp-runtime-coordinator"), file);
    }
  }
});

test("canonical framework scoping and status regressions run for web, API contracts and PDF changes",()=>{
  for(const file of ["apps/web/lib/scans/report-framework-scope.ts","apps/web/lib/scans/report-status-presentation.ts","apps/web/lib/scans/report-priority-projection.ts","apps/web/lib/scans/report-form-inventory.ts","apps/web/lib/scans/report-runtime-inventory.ts","apps/web/server/scans/report-inventory-parity.test.ts","apps/web/server/scans/report-executive-summary.ts","apps/web/server/scans/report-executive-docx.ts","apps/web/server/scans/assets/report-score-glyphs.json","scripts/report-score-glyphs.py","apps/web/server/scans/report-forms-parity.test.ts","apps/web/server/scans/report-pdf-priorities.ts","packages/certscore-api-contracts/src/detailed-evidence.ts","scripts/report-pdf-v2/render.py","apps/web/server/scans/report-export-docx.ts","scripts/preview-report-docx.ts","scripts/report-cross-surface-parity.test.mts","scripts/report-evidence-framework-route.test.ts","scripts/audit-report-export-parity.ts"]){
    for(const full of [false,true]){
      const check=getPredeployPlan([file],{full}).checks.find(row=>row.key==="report-presentation");
      assert.deepEqual(check?.command,["pnpm","test:report-presentation"]);
    }
  }
});
