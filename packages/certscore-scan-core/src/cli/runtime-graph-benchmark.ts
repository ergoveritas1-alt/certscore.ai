import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir, cpus, platform, arch } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { runScan } from "../index.js";
import { runtimeGraphDispatchSchema, type CanonicalEvidenceBundle } from "@certscore/contracts";

// Local fixture benchmark only. No external target, credential, model call, or acceptance-baseline rewrite.
async function main() {
assert.ok(process.env.NODE_TEST_CONTEXT, "Run this loopback-only fixture with node --import tsx --test; production network guards are not modified.");
const args = process.argv.slice(2);
const value = (flag: string) => { const at = args.indexOf(flag); return at >= 0 ? args[at + 1] : undefined; };
const pairCount = Number(value("--pairs") ?? process.env.CERTSCORE_GRAPH_BENCHMARK_PAIRS ?? 100);
assert.ok(Number.isInteger(pairCount) && pairCount >= 2 && pairCount <= 200);
const outputPath = path.resolve(value("--out") ?? process.env.CERTSCORE_GRAPH_BENCHMARK_OUTPUT ?? "runtime-graph-benchmark.json");
const artifactRoot = await mkdtemp(path.join(tmpdir(), "certscore-graph-benchmark-"));
let requestCount = 0;
const server = createServer((request, response) => {
  requestCount++;
  const url = new URL(request.url ?? "/", "http://fixture.invalid");
  if (url.pathname === "/light" || url.pathname === "/heavy") {
    const heavy = url.pathname === "/heavy";
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><title>Local ${heavy ? "heavy" : "light"} benchmark</title><link rel="stylesheet" href="/style.css"><script src="/runtime.js?n=${heavy ? 60 : 4}"></script>${heavy ? '<iframe src="/frame"></iframe><iframe src="/frame"></iframe>' : ""}`);
  } else if (url.pathname === "/runtime.js") {
    response.setHeader("Content-Type", "application/javascript");
    const count = Number(url.searchParams.get("n"));
    response.end(`document.cookie='js_fixture=value; Path=/'; for(let i=0;i<${count * 10};i++) localStorage.setItem('key_'+i,'bounded'); for(let i=0;i<${count};i++) fetch('/collect/'+i); new Worker('/worker.js');`);
  } else if (url.pathname === "/worker.js") {
    response.setHeader("Content-Type", "application/javascript"); response.end("setTimeout(()=>fetch('/worker-collect'),80)");
  } else if (url.pathname === "/style.css") {
    response.setHeader("Content-Type", "text/css"); response.end("body{color:#123;background-image:url('/image')}");
  } else if (url.pathname === "/frame") {
    response.setHeader("Content-Type", "text/html"); response.end("<script>sessionStorage.setItem('frame_key','bounded');fetch('/frame-collect')</script>");
  } else {
    if (url.pathname.startsWith("/collect/")) response.setHeader("Set-Cookie", `server_${url.pathname.split("/").at(-1)}=value; Path=/; HttpOnly; SameSite=Lax`);
    response.end("fixture");
  }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address(); assert.ok(address && typeof address !== "string");
let seed = 0x47524150;
const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000; };
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)]!;
const rows: Array<{ pair: number; workload: string; cache: string; order: number; enabled: boolean; wallMs: number; cpuMs: number; rssBytes: number; bundleBytes: number; graphBytes: number; setupMs: number; finalizeMs: number; requests: number; networkEvents: number; cookieEvents: number; unresolved: number; dropped: number; reasons: string[] }> = [];
const counts = (bundle: CanonicalEvidenceBundle) => ({ network: bundle.networkEvents.length, scripts: bundle.scriptEvents.length, frames: bundle.iframeEvents.length, cookies: bundle.cookieEvents.filter(event => event.operation === "set_cookie_header").length });
try {
  for (let pair = 0; pair < pairCount; pair++) {
    const workload = pair % 2 ? "heavy" : "light"; const order = random() < 0.5 ? [false, true] : [true, false];
    const observations: ReturnType<typeof counts>[] = [];
    for (let index = 0; index < order.length; index++) {
      const enabled = order[index]!; const beforeRequests = requestCount; const cpu = process.cpuUsage(); const start = performance.now();
      const bundle = await runScan({ url: `http://127.0.0.1:${address.port}/${workload}`, outDir: path.join(artifactRoot, `${pair}-${enabled ? "on" : "off"}`), profile: "tiny", evidenceLane: "runtime_evidence", preConsentModuleDeadlineMs: 5000, preConsentScreenshotMode: "never", ...(enabled ? { runtimeGraph: runtimeGraphDispatchSchema.parse(JSON.parse(JSON.stringify({ contractVersion: "certscore.runtime-graph-dispatch.v1", scanId: `benchmark-${pair}`, mode: "project", profile: "bounded_passive_v1" }))) } : {}) });
      const wallMs = performance.now() - start; const usage = process.cpuUsage(cpu); const graph = bundle.runtimeEvidenceGraphs?.[0];
      assert.equal(Boolean(graph), enabled); assert.equal(bundle.screenshots.length, 0); assert.equal(bundle.policySurfaceObservations.length, 0);
      observations.push(counts(bundle));
      rows.push({ pair, workload, cache: "fresh_browser_context", order: index, enabled, wallMs, cpuMs: (usage.user + usage.system) / 1000, rssBytes: process.memoryUsage().rss, bundleBytes: Buffer.byteLength(JSON.stringify(bundle)), graphBytes: graph ? Buffer.byteLength(JSON.stringify(graph)) : 0, setupMs: graph?.timing.setupMs ?? 0, finalizeMs: graph?.timing.finalizeMs ?? 0, requests: requestCount - beforeRequests, networkEvents: bundle.networkEvents.length, cookieEvents: bundle.cookieEvents.length, unresolved: graph?.coverage.unresolvedRequests ?? 0, dropped: (graph?.coverage.droppedNodes ?? 0) + (graph?.coverage.droppedEdges ?? 0), reasons: graph?.coverage.reasons ?? [] });
    }
    assert.deepEqual(observations[0], observations[1], `paired core evidence counts differ on ${workload} pair ${pair}`);
    if ((pair + 1) % 10 === 0) console.info(JSON.stringify({ event: "runtime_graph_benchmark_progress", pairs: pair + 1, totalPairs: pairCount }));
  }
  const summarize = (subset: typeof rows) => {
    const off = subset.filter(row => !row.enabled); const on = subset.filter(row => row.enabled);
    const ratios = on.map(row => row.wallMs / off.find(other => other.pair === row.pair)!.wallMs);
    const samples = Array.from({ length: 1000 }, () => { const selected = Array.from({ length: on.length }, () => Math.floor(random() * on.length)); return percentile(selected.map(index => on[index]!.wallMs), .95) / percentile(selected.map(index => off.find(row => row.pair === on[index]!.pair)!.wallMs), .95); });
    const p95Ratio = percentile(on.map(row => row.wallMs), .95) / percentile(off.map(row => row.wallMs), .95);
    const upper95Ratio = percentile(samples, .975);
    return { pairs: on.length, offP95Ms: percentile(off.map(row => row.wallMs), .95), onP95Ms: percentile(on.map(row => row.wallMs), .95), p95Ratio, bootstrap95Interval: [percentile(samples, .025), upper95Ratio], medianPairRatio: percentile(ratios, .5), maxGraphBytes: Math.max(...on.map(row => row.graphBytes)), setupP95Ms: percentile(on.map(row => row.setupMs), .95), finalizeP95Ms: percentile(on.map(row => row.finalizeMs), .95), result: on.length < 50 ? "insufficient_sample" : p95Ratio > 1.05 ? "failed" : upper95Ratio > 1.05 ? "inconclusive" : "passed" };
  };
  const summary = { all: summarize(rows), light: summarize(rows.filter(row => row.workload === "light")), heavy: summarize(rows.filter(row => row.workload === "heavy")) };
  const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const measuredSourceFiles = ["packages/certscore-scan-core/src/index.ts", "packages/certscore-scan-core/src/scanners/pre-consent-runtime-scanner.ts", "packages/certscore-scan-core/src/runtime-evidence-graph.ts", "packages/certscore-scan-core/src/runtime-evidence-graph-capture.ts", "packages/certscore-contracts/src/index.ts", "packages/certscore-contracts/src/post-accept-observation.ts", "packages/certscore-contracts/src/post-refusal-observation.ts", "packages/certscore-contracts/src/runtime-evidence-graph.ts", "packages/certscore-scan-core/src/cli/runtime-graph-benchmark.ts"];
  measuredSourceFiles.push("packages/certscore-scan-core/src/consent-geometry-proof-budget.ts");
  const measuredSourceHashes = Object.fromEntries(await Promise.all(measuredSourceFiles.map(async file => [file, createHash("sha256").update(await readFile(path.join(repositoryRoot, file))).digest("hex")])));
  const result = { contractVersion: "certscore.runtime-graph-local-benchmark.v1", generatedAt: new Date().toISOString(), pairCount, nodeVersion: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), workingDiffSha256: createHash("sha256").update(execFileSync("git", ["diff", "HEAD"], { maxBuffer: 20 * 1024 * 1024 })).digest("hex"), baseline: "same candidate checkout with server-owned capture disabled", settings: { profile: "tiny", lane: "runtime_evidence", moduleDeadlineMs: 5000, screenshotMode: "never", seed: "0x47524150", browserContext: "fresh each run; first pair reported separately, subsequent pairs host-warm; no warm-browser-cache claim" }, firstPair: rows.filter(row => row.pair === 0), limitations: ["Local scanner wall time only; Lambda lane barrier/upload and WC01 handoff require deployed canaries", "Node CPU/RSS do not include Chromium process memory/CPU", "No accepted baseline or canonical quality expectation is changed"], summary, rows };
  await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, JSON.stringify({ ...result, measuredSourceHashes }, null, 2));
  console.info(JSON.stringify({ event: "runtime_graph_benchmark_complete", outputPath, summary }));
  if (pairCount >= 100 && Object.values(summary).some(row => row.result !== "passed")) process.exitCode = 1;
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await rm(artifactRoot, { recursive: true, force: true });
}
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
