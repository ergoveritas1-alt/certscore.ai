import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { runtimeGraphDispatchSchema, verifyRuntimeEvidenceGraph, type CanonicalEvidenceBundle, type RuntimeGraphDispatch } from "@certscore/contracts";
import { createHash } from "node:crypto";
import { RuntimeEvidenceGraphBuilder } from "../../../packages/certscore-scan-core/src/runtime-evidence-graph";
import { verifyLaneRuntimeGraph } from "./handler";

test("coordinator verifies scan, lane, mode, hash and capture identity and retains failure diagnostics", () => {
  const dispatch: RuntimeGraphDispatch = { contractVersion: "certscore.runtime-graph-dispatch.v1", scanId: "scan", mode: "project", profile: "bounded_passive_v1" };
  const graph = new RuntimeEvidenceGraphBuilder({ scanId: "scan", captureId: "scan:runtime_evidence", scenario: "pre_consent", mode: "project", startedAt: new Date().toISOString(), browserVersion: "fixture" }).finish();
  const bundle = { runtimeEvidenceGraphs: [graph] } as CanonicalEvidenceBundle;
  assert.equal(verifyLaneRuntimeGraph(bundle, "scan", "pre_consent", dispatch).graphs.length, 1);
  for (const [input, scanId, scenario, mode, reason] of [
    [bundle, "scan", "pre_consent", undefined, "unexpected_capture"],
    [bundle, "other", "pre_consent", dispatch, "identity_mismatch"],
    [bundle, "scan", "gpc", dispatch, "identity_mismatch"],
    [bundle, "scan", "pre_consent", { ...dispatch, mode: "capture_only" }, "identity_mismatch"],
    [{ runtimeEvidenceGraphs: [{ ...graph, sourceHash: "a".repeat(64) }] }, "scan", "pre_consent", dispatch, "hash_mismatch"],
    [{ runtimeEvidenceGraphs: [graph, graph] }, "scan", "pre_consent", dispatch, "ambiguous"],
    [{}, "scan", "pre_consent", dispatch, "unavailable"],
  ] as const) {
    const result = verifyLaneRuntimeGraph(input as CanonicalEvidenceBundle, scanId, scenario, mode);
    assert.equal(result.graphs.length, 0); assert.equal(result.diagnostics[0]?.reason, reason);
  }
});

test("production-minified capture retains browser probes, native behavior and bounded storage snapshots", { timeout: 20_000 }, async () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const tempRoot = path.join(repo, "apps/v2-dag-lambda/tmp"); await mkdir(tempRoot, { recursive: true });
  const dir = await mkdtemp(path.join(tempRoot, "graph-bundle-"));
  const server = createServer((_request, response) => { response.setHeader("Content-Type", "text/html"); response.end("<script>document.cookie='bundled_cookie=private_value; Path=/';localStorage.setItem('bundled_key','private_storage')</script>"); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch({ headless: true });
  try {
    const outfile = path.join(dir, "capture.cjs");
    await build({ entryPoints: [path.join(repo, "packages/certscore-scan-core/src/runtime-evidence-graph-capture.ts")], bundle: true, platform: "node", target: "node22", format: "cjs", minify: true, external: ["playwright", "pdf-parse"], tsconfig: path.join(repo, "tsconfig.base.json"), outfile });
    const bundled = createRequire(import.meta.url)(outfile) as typeof import("../../../packages/certscore-scan-core/src/runtime-evidence-graph-capture");
    const dispatch = runtimeGraphDispatchSchema.parse(JSON.parse(JSON.stringify({ contractVersion: "certscore.runtime-graph-dispatch.v1", scanId: "fixture", mode: "project", profile: "bounded_passive_v1" })));
    for (const [scenario, lane] of [["pre_consent", "runtime_evidence"], ["gpc", "gpc_observation"], ["post_accept", "accept_observation"], ["post_reject", "reject_observation"]] as const) {
    const context = await browser.newContext(); const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const capture = await bundled.installRuntimeGraphCapture(page, { ...dispatch, captureId: `fixture:${lane}`, scenario, startedAt: new Date().toISOString() });
    await page.goto(`http://127.0.0.1:${address.port}`);
    capture.cookies(await page.context().cookies()); await capture.snapshotStorage();
    const graph = capture.finish();
    assert.ok(graph);
    assert.equal(graph.contractVersion, "certscore.runtime-evidence-graph.v1");
    assert.equal("profile" in graph, false);
    assert.ok(verifyRuntimeEvidenceGraph(graph, { scanId: "fixture", scenario, mode: "project", sha256: value => createHash("sha256").update(value).digest("hex") }).graph);
    if (scenario === "pre_consent" || scenario === "gpc") assert.equal(verifyLaneRuntimeGraph({ runtimeEvidenceGraphs: [graph] } as CanonicalEvidenceBundle, "fixture", scenario, dispatch).graphs.length, 1);
    assert.deepEqual(errors, []);
    assert.ok(graph.nodes.some(node => node.operation === "js_set" && node.cookie?.name === "bundled_cookie"));
    assert.ok(graph.nodes.some(node => node.operation === "setItem" && node.name === "bundled_key"));
    assert.ok(graph.nodes.some(node => node.captureBasis === "page_realm_snapshot" && node.name === "bundled_key"));
    assert.ok(!JSON.stringify(graph).includes("private_"));
    assert.equal(await page.evaluate(() => localStorage.getItem("bundled_key")), "private_storage");
    await context.close();
    }
  } finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); }
});
