import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertScannerConfigurationScope } from "./scanner-configuration-scope";

test("no-configuration scanner releases fail before promotion regardless of existing settings", () => {
  for (const mode of ["all", "scanners"] as const) {
    assert.throws(() => assertScannerConfigurationScope({ mode, preserveScannerConfiguration: true, plan: false, dryRun: false }),
      /SCANNER_IMAGE_DIGEST.*Refusing before remote work/);
  }
});

test("local plans and consumer-only modes preserve their existing behavior", () => {
  for (const mode of ["all", "scanners", "web", "validation", "db"] as const) {
    for (const [plan, dryRun] of [[true, false], [false, true]] as const) {
      assert.doesNotThrow(() => assertScannerConfigurationScope({ mode, preserveScannerConfiguration: true, plan, dryRun }));
    }
    assert.doesNotThrow(() => assertScannerConfigurationScope({ mode, preserveScannerConfiguration: false, plan: false, dryRun: false }));
  }
  for (const mode of ["web", "validation", "db"] as const) {
    assert.doesNotThrow(() => assertScannerConfigurationScope({ mode, preserveScannerConfiguration: true, plan: false, dryRun: false }));
  }
});

test("the actual CLI rejects scanner configuration preservation before Git resolution, push, preflight or AWS", () => {
  for (const mode of ["all", "scanners"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/deploy-fast.ts", mode,
      "--preserve-scanner-configuration", "--no-predeploy", "--no-push", "--ref", "never-resolve-this-ref"],
      { encoding: "utf8", timeout: 15_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Refusing before remote work/);
    assert.doesNotMatch(result.stdout + result.stderr, /Fast deploy mode:|unknown revision|ambiguous argument|OFFLINE_TEST_BLOCKED/);
  }
});
