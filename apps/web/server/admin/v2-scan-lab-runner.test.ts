import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildV2ScanLabRunPlan,
  getV2ScanLabRunProfiles,
  isV2ScanLabConsentDagEligibleProfile,
  isV2ScanLabRunProfile,
  normalizeV2ScanPlaywrightBrowsersPath,
  resolveV2ScanCoreCliCommand,
  runV2ScanLabArtifactChain,
} from "./v2-scan-lab-runner";

test("v2 scan lab runner exposes only supported launch profiles", () => {
  assert.deepEqual(getV2ScanLabRunProfiles(), ["tiny", "standard", "policy", "consent", "full"]);
  assert.equal(isV2ScanLabRunProfile("tiny"), true);
  assert.equal(isV2ScanLabRunProfile("standard"), true);
  assert.equal(isV2ScanLabRunProfile("policy"), true);
  assert.equal(isV2ScanLabRunProfile("consent"), true);
  assert.equal(isV2ScanLabRunProfile("full"), true);
  assert.deepEqual(getV2ScanLabRunProfiles().filter(isV2ScanLabConsentDagEligibleProfile), ["consent", "full"]);
});

test("normalizes Playwright browser path differently for local and production scans", () => {
  assert.equal(normalizeV2ScanPlaywrightBrowsersPath("0", "production"), "0");
  assert.equal(normalizeV2ScanPlaywrightBrowsersPath("0", "development"), "");
  assert.equal(normalizeV2ScanPlaywrightBrowsersPath("/ms-playwright", "production"), "/ms-playwright");
  assert.equal(normalizeV2ScanPlaywrightBrowsersPath(undefined, "production"), "");
});

test("builds a fresh artifact chain plan with stable run roots", () => {
  const workspaceRoot = path.join("/tmp", "wc01");
  const plan = buildV2ScanLabRunPlan({
    now: new Date("2026-06-10T17:11:12.000Z"),
    profile: "standard",
    url: "cnn.com",
    workspaceRoot,
  });

  assert.equal(plan.chainKey, "lab-cnn-com-standard-20260610T171112:cnn.com");
  assert.equal(plan.consentScenarioDag, false);
  assert.equal(plan.domain, "cnn.com");
  assert.equal(plan.normalizedUrl, "https://cnn.com/");
  assert.equal(plan.profile, "standard");
  assert.equal(plan.scenarioPlanningMode, "legacy_sequential");
  assert.equal(plan.timingPath, path.join(workspaceRoot, "artifacts", "v2-calibration-lab-cnn-com-standard-20260610T171112", "cnn.com", "V2ScanLabTiming.json"));
  assert.deepEqual(plan.steps.map((step) => step.script), ["v2:scan"]);
  assert.deepEqual(plan.steps.map((step) => [step.label, step.dependsOn ?? []]), [
    ["scan", []],
  ]);
  assert.ok(plan.steps[0]?.args.includes(path.join(workspaceRoot, "artifacts", "v2-calibration-lab-cnn-com-standard-20260610T171112", "cnn.com")));
  assert.equal(plan.steps.some((step) => step.script.startsWith("v2:wc01-")), false);
});

test("builds full scan lab plans with the full scan-core profile", () => {
  const workspaceRoot = path.join("/tmp", "wc01");
  const plan = buildV2ScanLabRunPlan({
    now: new Date("2026-06-10T17:11:12.000Z"),
    profile: "full",
    url: "example.com",
    workspaceRoot,
  });

  assert.equal(plan.chainKey, "lab-example-com-full-20260610T171112:example.com");
  assert.equal(plan.profile, "full");
  assert.deepEqual(plan.steps[0]?.args.slice(0, 4), ["--url", "https://example.com/", "--profile", "full"]);
  assert.ok(plan.steps[0]?.args.includes(path.join(workspaceRoot, "artifacts", "v2-calibration-lab-example-com-full-20260610T171112", "example.com")));
});

test("builds scan lab plans with optional replay capture", () => {
  const workspaceRoot = path.join("/tmp", "wc01");
  const plan = buildV2ScanLabRunPlan({
    captureReplay: true,
    captureReplayAuxiliaryProbes: "none",
    now: new Date("2026-06-10T17:11:12.000Z"),
    profile: "full",
    url: "example.com",
    workspaceRoot,
  });

  assert.ok(plan.steps[0]?.args.includes("--capture-replay"));
  assert.deepEqual(plan.steps[0]?.args.slice(
    plan.steps[0].args.indexOf("--capture-replay-aux-probes"),
    plan.steps[0].args.indexOf("--capture-replay-aux-probes") + 2,
  ), ["--capture-replay-aux-probes", "none"]);
});

test("builds scan lab plans with optional planned consent DAG flags", () => {
  const workspaceRoot = path.join("/tmp", "wc01");
  const plan = buildV2ScanLabRunPlan({
    consentScenarioDag: true,
    now: new Date("2026-06-10T17:11:12.000Z"),
    profile: "consent",
    url: "example.com",
    workspaceRoot,
  });
  const scanArgs = plan.steps[0]?.args ?? [];
  assert.deepEqual(
    scanArgs.slice(
      scanArgs.indexOf("--pre-consent-screenshot-timeout-ms"),
      scanArgs.indexOf("--pre-consent-screenshot-timeout-ms") + 2,
    ),
    ["--pre-consent-screenshot-timeout-ms", "15000"],
  );

  assert.deepEqual(scanArgs.slice(scanArgs.indexOf("--scenario-planning-mode"), scanArgs.indexOf("--scenario-planning-mode") + 2), [
    "--scenario-planning-mode",
    "planned_parallel",
  ]);
  assert.equal(plan.consentScenarioDag, true);
  assert.equal(plan.scenarioPlanningMode, "planned_parallel");
  assert.deepEqual(scanArgs.slice(scanArgs.indexOf("--scenario-concurrency"), scanArgs.indexOf("--scenario-concurrency") + 2), [
    "--scenario-concurrency",
    "2",
  ]);
  assert.deepEqual(scanArgs.slice(scanArgs.indexOf("--policy-planning-deadline-ms"), scanArgs.indexOf("--policy-planning-deadline-ms") + 2), [
    "--policy-planning-deadline-ms",
    "1500",
  ]);
  assert.deepEqual(scanArgs.slice(scanArgs.indexOf("--scenario-resource-mode"), scanArgs.indexOf("--scenario-resource-mode") + 2), [
    "--scenario-resource-mode",
    "lean",
  ]);
  assert.deepEqual(scanArgs.slice(scanArgs.indexOf("--consent-flow-deadline-ms"), scanArgs.indexOf("--consent-flow-deadline-ms") + 2), [
    "--consent-flow-deadline-ms",
    "30000",
  ]);
});

test("builds auxiliary replay plans with a larger consent-flow deadline", () => {
  const plan = buildV2ScanLabRunPlan({
    captureReplay: true,
    captureReplayAuxiliaryProbes: "form",
    consentScenarioDag: true,
    now: new Date("2026-06-10T17:11:12.000Z"),
    profile: "full",
    url: "example.com",
    workspaceRoot: path.join("/tmp", "wc01"),
  });
  const scanArgs = plan.steps[0]?.args ?? [];

  assert.deepEqual(scanArgs.slice(scanArgs.indexOf("--capture-replay-aux-probes"), scanArgs.indexOf("--capture-replay-aux-probes") + 2), [
    "--capture-replay-aux-probes",
    "form",
  ]);
  assert.deepEqual(scanArgs.slice(scanArgs.indexOf("--scenario-concurrency"), scanArgs.indexOf("--scenario-concurrency") + 2), [
    "--scenario-concurrency",
    "3",
  ]);
  assert.deepEqual(scanArgs.slice(scanArgs.indexOf("--consent-flow-deadline-ms"), scanArgs.indexOf("--consent-flow-deadline-ms") + 2), [
    "--consent-flow-deadline-ms",
    "45000",
  ]);
});

test("ignores consent DAG opt-in for non-consent scan lab profiles", () => {
  const plan = buildV2ScanLabRunPlan({
    consentScenarioDag: true,
    now: new Date("2026-06-10T17:11:12.000Z"),
    profile: "standard",
    url: "example.com",
    workspaceRoot: path.join("/tmp", "wc01"),
  });
  const scanArgs = plan.steps[0]?.args ?? [];

  assert.equal(plan.consentScenarioDag, false);
  assert.equal(plan.scenarioPlanningMode, "legacy_sequential");
  assert.equal(scanArgs.includes("--scenario-planning-mode"), false);
  assert.equal(scanArgs.includes("--scenario-concurrency"), false);
  assert.equal(scanArgs.includes("--policy-planning-deadline-ms"), false);
  assert.equal(scanArgs.includes("--scenario-resource-mode"), false);
  assert.equal(scanArgs.includes("--consent-flow-deadline-ms"), false);
});

test("builds scan lab plans with seeded privacy control URLs", () => {
  const workspaceRoot = path.join("/tmp", "wc01");
  const plan = buildV2ScanLabRunPlan({
    captureReplay: true,
    now: new Date("2026-06-10T17:11:12.000Z"),
    privacyControlUrls: [
      "https://example.com/privacy/your-privacy-choices#section",
      "not-a-url",
    ],
    profile: "full",
    url: "example.com",
    workspaceRoot,
  });

  assert.deepEqual(plan.privacyControlUrls, ["https://example.com/privacy/your-privacy-choices"]);
  assert.ok(plan.steps[0]?.args.includes("--privacy-control-url"));
  assert.ok(plan.steps[0]?.args.includes("https://example.com/privacy/your-privacy-choices"));
});

test("resolves v2 scan CLI from compiled package dist in production-shaped cwd", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "wc01-prod-shape-"));
  const appCwd = path.join(root, "apps", "web");
  const distCli = path.join(root, "packages", "certscore-scan-core", "dist", "cli", "scan.js");
  await mkdir(path.dirname(distCli), { recursive: true });
  await mkdir(appCwd, { recursive: true });
  await writeFile(distCli, "console.log('scan');\n");

  assert.deepEqual(resolveV2ScanCoreCliCommand(appCwd), {
    entrypoint: distCli,
    requiresTsx: false,
  });
});

test("resolves v2 scan CLI from source in a workspace checkout even when dist exists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "wc01-workspace-shape-"));
  const srcCli = path.join(root, "packages", "certscore-scan-core", "src", "cli", "scan.ts");
  const distCli = path.join(root, "packages", "certscore-scan-core", "dist", "cli", "scan.js");
  await mkdir(path.dirname(srcCli), { recursive: true });
  await mkdir(path.dirname(distCli), { recursive: true });
  await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  await writeFile(srcCli, "console.log('src scan');\n");
  await writeFile(distCli, "console.log('dist scan');\n");

  assert.deepEqual(resolveV2ScanCoreCliCommand(path.join(root, "apps", "web")), {
    entrypoint: srcCli,
    requiresTsx: true,
  });
});

test("resolves v2 scan CLI from source when dist is unavailable", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "wc01-src-shape-"));
  const srcCli = path.join(root, "packages", "certscore-scan-core", "src", "cli", "scan.ts");
  await mkdir(path.dirname(srcCli), { recursive: true });
  await writeFile(srcCli, "console.log('scan');\n");

  assert.deepEqual(resolveV2ScanCoreCliCommand(root), {
    entrypoint: srcCli,
    requiresTsx: true,
  });
});

test("runs planned steps in order through injected command runner", async () => {
  const calls: string[] = [];
  const plan = await runV2ScanLabArtifactChain(
    {
      now: new Date("2026-06-10T17:11:12.000Z"),
      profile: "tiny",
      url: "https://example.com/privacy",
      workspaceRoot: path.join("/tmp", "wc01"),
    },
    {
      runCommand: async (step) => {
        calls.push(step.label);
      },
    },
  );

  assert.equal(plan.chainKey, "lab-example-com-tiny-20260610T171112:example.com");
  assert.deepEqual(calls, plan.steps.map((step) => step.label));
  const timing = JSON.parse(await readFile(plan.timingPath, "utf8"));
  assert.equal(timing.timingVersion, "wc01.v2_scan_lab_timing.1");
  assert.equal(timing.chainKey, plan.chainKey);
  assert.equal(timing.consentScenarioDag, false);
  assert.equal(timing.scenarioPlanningMode, "legacy_sequential");
  assert.equal(timing.stepTimings.length, plan.steps.length);
  assert.deepEqual(timing.stepTimings.map((step: { label: string }) => step.label), plan.steps.map((step) => step.label));
});

test("rejects invalid URLs before building scan commands", () => {
  assert.throws(
    () => buildV2ScanLabRunPlan({ profile: "tiny", url: "https://", workspaceRoot: "/tmp/wc01" }),
    /valid URL or domain/,
  );
});
