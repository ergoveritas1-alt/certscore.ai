import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getPredeployPlan } from "./predeploy.js";
import { commandWords, RELEASE_REGRESSION_MATRIX, reviewReleaseRegressions, type ReleaseRegressionMatrix } from "./lib/scan-release-regressions.js";

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
    for (const args of [["--base", "missing-review-revision"], ["--base="]]) {
      const result = spawnSync(process.execPath, ["--import", loader, entry, ...args], { cwd: root, encoding: "utf8" });
      assert.equal(result.status, 1, `unsafe empty success: ${result.stdout}`);
      assert.match(result.stderr, /base.*(?:available|requires)/i);
    }
    const valid = spawnSync(process.execPath, ["--import", loader, entry, "--base", "HEAD"], { cwd: root, encoding: "utf8" });
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
