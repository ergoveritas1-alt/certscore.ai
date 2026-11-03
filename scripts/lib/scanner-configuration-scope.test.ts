import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertScannerConfigurationScope, configureScannerSettingsUnlessPreserved, scannerOperationalSnapshot,
  assertScannerOperationalSettingsPreserved } from "./scanner-configuration-scope";
import { synchronizeScannerImage, type ScannerImageControl } from "./scanner-image-provenance";

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
      "--preserve-scanner-configuration", "--preserve-scanner-operational-settings", "--no-predeploy", "--no-push", "--ref", "never-resolve-this-ref"],
      { encoding: "utf8", timeout: 15_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Refusing before remote work/);
    assert.doesNotMatch(result.stdout + result.stderr, /Fast deploy mode:|unknown revision|ambiguous argument|OFFLINE_TEST_BLOCKED/);
  }
});

const configuration = () => ({ MemorySize: 3008, Timeout: 40, RevisionId: "r0", State: "Active", LastUpdateStatus: "Successful",
  Variables: { CERTSCORE_POST_ACCEPT_WORKER_ENABLED: "0", CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED: "0",
    SECRET: "private-fixture-value", SCANNER_IMAGE_DIGEST: `sha256:${"a".repeat(64)}` } });
const snapshot = (v: unknown) => scannerOperationalSnapshot(v, { memoryMb: 3008, inventory: false });

test("a missing preceding argument cannot consume the no-configuration guard as its value", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/deploy-fast.ts", "all", "--base",
    "--preserve-scanner-configuration", "--no-push", "--no-predeploy"], { encoding: "utf8", timeout: 15_000 });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--base requires a value/);
  assert.doesNotMatch(result.stdout + result.stderr, /Fast deploy mode:|OFFLINE_TEST_BLOCKED/);
});

test("operational snapshots allow only provenance changes and expose no environment values", () => {
  const before = configuration(), after = configuration();
  after.Variables.SCANNER_IMAGE_DIGEST = `sha256:${"b".repeat(64)}`;
  assertScannerOperationalSettingsPreserved(snapshot(before), snapshot(after));
  assert.doesNotMatch(JSON.stringify(snapshot(before)), /private-fixture-value|POST_ACCEPT|PREFERENCE/);
  for (const change of ["flag", "secret", "extra", "removed", "timeout"] as const) {
    const changed = configuration();
    if (change === "flag") changed.Variables.CERTSCORE_POST_ACCEPT_WORKER_ENABLED = "1";
    if (change === "secret") changed.Variables.SECRET = "different";
    if (change === "extra") Object.assign(changed.Variables, { EXTRA: "value" });
    if (change === "removed") Reflect.deleteProperty(changed.Variables, "SECRET");
    if (change === "timeout") changed.Timeout++;
    assert.throws(() => assertScannerOperationalSettingsPreserved(snapshot(before), snapshot(changed)), /settings changed/);
  }
});

test("missing, malformed, unhealthy or wrong-capacity worker reads fail without normalization", () => {
  for (const value of [null, {}, { ...configuration(), MemorySize: 4096 }, { ...configuration(), Timeout: 0 },
    { ...configuration(), RevisionId: "" }, { ...configuration(), Variables: null },
    { ...configuration(), Variables: { SECRET: null } }, { ...configuration(), EnvironmentError: { Code: "unavailable" } },
    { ...configuration(), State: "Pending" }, { ...configuration(), LastUpdateStatus: "InProgress" }]) {
    assert.throws(() => snapshot(value), /refusing to normalize/);
  }
  const inventory = { ...configuration(), Timeout: 25, Variables: { ...configuration().Variables, CERTSCORE_FULL_SITE_INVENTORY_WORKER: "1" } };
  assert.doesNotThrow(() => scannerOperationalSnapshot(inventory, { memoryMb: 3008, inventory: true }));
  for (const value of [{ ...inventory, Timeout: 40 }, { ...inventory, Variables: {} }]) {
    assert.throws(() => scannerOperationalSnapshot(value, { memoryMb: 3008, inventory: true }));
  }
});

test("restricted promotion uses the real provenance transaction while both broad settings phases stay unreachable", async () => {
  const config = configuration(), before = snapshot(config), digest = `sha256:${"b".repeat(64)}`;
  const image = (d: string) => `199536052647.dkr.ecr.eu-central-1.amazonaws.com/certscore-v2-dag-local-lambda@${d}`;
  let imageUri = image(config.Variables.SCANNER_IMAGE_DIGEST), revision = 0;
  const calls: string[] = [];
  const control: ScannerImageControl = {
    async read() { return { imageUri, revisionId: config.RevisionId, state: config.State, updateStatus: config.LastUpdateStatus, variables: { ...config.Variables } }; },
    async environment(variables, id) { assert.equal(id, config.RevisionId); config.RevisionId = `r${++revision}`; config.Variables = { ...variables } as typeof config.Variables; calls.push("provenance"); },
    async code(uri, id) { assert.equal(id, config.RevisionId); assert.equal(config.Variables.SCANNER_IMAGE_DIGEST, undefined); config.RevisionId = `r${++revision}`; imageUri = uri; calls.push("image"); },
    async wait() {},
  };
  const forbidden = async () => { throw new Error("broad settings writer must not run"); };
  await configureScannerSettingsUnlessPreserved(true, forbidden);
  await synchronizeScannerImage(control, image(digest), true);
  await configureScannerSettingsUnlessPreserved(true, forbidden);
  assertScannerOperationalSettingsPreserved(before, snapshot(config));
  assert.deepEqual(calls, ["provenance", "image", "provenance"]);
  assert.equal(config.Variables.CERTSCORE_POST_ACCEPT_WORKER_ENABLED, "0");
  assert.equal(config.Variables.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED, "0");
  let legacyCalls = 0;
  await configureScannerSettingsUnlessPreserved(false, async () => { legacyCalls++; });
  assert.equal(legacyCalls, 1);
  await assert.rejects(configureScannerSettingsUnlessPreserved(false, forbidden), /must not run/);
});

test("both producer entry paths forward operational preservation and validate settings before build mutations", async () => {
  const source = await readFile("scripts/deploy-fast.ts", "utf8");
  assert.equal((source.match(/preserveOperationalSettings: args\.preserveScannerOperationalSettings/g) ?? []).length, 2);
  const body = source.slice(source.indexOf("async function deployScanners("), source.indexOf("async function readScannerOperationalSettings("));
  assert.ok(body.indexOf("await readScannerOperationalSettings()") < body.indexOf("await scannerRuntimeBaseMode("));
  assert.equal((body.match(/configureScannerSettingsUnlessPreserved\(input.preserveOperationalSettings/g) ?? []).length, 2);
  assert.match(body, /assertScannerOperationalSettingsPreserved\(before, after.get\(key\)!\)/);
});
