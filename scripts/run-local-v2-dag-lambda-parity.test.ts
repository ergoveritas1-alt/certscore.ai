import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseArgs } from "./run-local-v2-dag-lambda-parity";
import { buildLocalV2DagSimulatedLambdaArgs } from "../apps/web/server/scans/local-v2-dag-lambda-simulated-dispatch";

test("simulated Lambda round-trips runtime graph configuration through CLI parsing", () => {
  for (const mode of ["capture_only", "project"] as const) {
    const runtimeGraph = {
      contractVersion: "certscore.runtime-graph-dispatch.v1" as const,
      scanId: "scan-graph",
      mode,
      profile: "bounded_passive_v1" as const,
    };
    const args = buildLocalV2DagSimulatedLambdaArgs({
      artifactDir: "artifacts/local-v2-dag-lambda-simulated",
      outPath: "artifacts/local-v2-dag-lambda-simulated/summary.json",
      payload: {
        awsRegion: "eu-central-1", profile: "standard", scanId: "scan-graph",
        targetUrl: "https://example.test/", runtimeGraph,
      },
    });
    const cliArgs = args.slice(args.indexOf("--") + 1);
    assert.deepEqual(parseArgs(cliArgs).runtimeGraph, runtimeGraph);
    const mismatched = [...cliArgs];
    mismatched[mismatched.indexOf("--scan-id") + 1] = "another-scan";
    assert.throws(() => parseArgs(mismatched), /must match the local scan ID/);
  }
});

test("local graph capture stays disabled when absent and rejects malformed configuration", () => {
  const args = buildLocalV2DagSimulatedLambdaArgs({
    artifactDir: "artifacts/local-v2-dag-lambda-simulated",
    outPath: "artifacts/local-v2-dag-lambda-simulated/summary.json",
    payload: {
      awsRegion: "eu-central-1", profile: "standard", scanId: "scan-graph",
      targetUrl: "https://example.test/",
    },
  });
  assert.equal(args.includes("--runtime-graph-config"), false);
  assert.equal(parseArgs(args.slice(args.indexOf("--") + 1)).runtimeGraph, null);
  for (const value of ["null", "{", "{}", JSON.stringify({
    contractVersion: "certscore.runtime-graph-dispatch.v1", scanId: "scan-graph",
    mode: "project", profile: "bounded_passive_v1", browserLanes: 8,
  })]) {
    assert.throws(() => parseArgs(["--scan-id", "scan-graph", "--runtime-graph-config", value]));
  }
});

test("parity coordinator payload forwards the parsed graph without selecting a new rollout", async () => {
  const source = await readFile(new URL("./run-local-v2-dag-lambda-parity.ts", import.meta.url), "utf8");
  assert.match(source, /\.\.\.\(args\.runtimeGraph \? \{ runtimeGraph: args\.runtimeGraph \} : \{\}\)/);
  assert.doesNotMatch(source, /selectRuntimeGraphDispatch/);
});


test("local crawl options survive simulated dispatch without enabling discovery for a homepage-only run", () => {
  for (const discovery of [undefined, false, true]) {
    const args = buildLocalV2DagSimulatedLambdaArgs({
      artifactDir: "artifacts/test", outPath: "artifacts/test/summary.json",
      payload: { awsRegion: "eu-west-1", profile: "standard", scanId: "crawl-test",
        targetUrl: "https://example.test/", resourceInventoryCrawl: true,
        resourceInventoryDiscovery: discovery },
    });
    const parsed = parseArgs(args.slice(args.indexOf("--") + 1));
    assert.equal(parsed.resourceInventoryCrawl, true);
    assert.equal(parsed.resourceInventoryDiscovery, discovery === true);
  }
  const defaults = parseArgs([]);
  assert.equal(defaults.resourceInventoryCrawl, false);
  assert.equal(defaults.resourceInventoryDiscovery, false);
});
