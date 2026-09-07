import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { apiRuntimeEvidenceGraphProjectionSchema } from "@certscore/api-contracts";
import { RuntimeEvidenceGraphBuilder } from "../../../../packages/certscore-scan-core/src/runtime-evidence-graph";
import { projectCrawlRuntimeGraph, projectRuntimeEvidenceGraphs, presentRuntimeGraphForRead } from "./runtime-evidence-graph-projection";

function fixture(mode: "capture_only" | "project" = "project") {
  const builder = new RuntimeEvidenceGraphBuilder({ scanId: "scan", captureId: "scan:runtime_evidence", scenario: "pre_consent", mode, startedAt: new Date(Date.now() - 1000).toISOString(), browserVersion: "fixture" });
  builder.handle("main", "Network.requestWillBeSent", { requestId: "1", frameId: "frame", loaderId: "document", timestamp: 1, documentURL: "https://example.com/", type: "Script", request: { url: "https://www.googletagmanager.com/gtm.js?id=redacted", method: "GET" }, initiator: { type: "parser", url: "https://example.com/" } });
  builder.handle("main", "Network.responseReceived", { requestId: "1", hasExtraInfo: false, timestamp: 1.2, response: { status: 200 } });
  return { bundle: { scanId: "scan", runtimeEvidenceGraphs: [builder.finish()] } as CanonicalEvidenceBundle, scanId: "scan", source: { verificationStatus: "verified", sha256: "a".repeat(64), sizeBytes: 4000 } };
}

test("verified inventory graph preserves every node/edge identity and source hash through public JSON", () => {
  const input = fixture(); const result = projectRuntimeEvidenceGraphs(input);
  assert.equal(result.graphs.length, 1);
  const source = input.bundle.runtimeEvidenceGraphs![0]!;
  assert.deepEqual(result.graphs[0]!.nodes.map(node => node.id), source.nodes.map(node => node.id));
  assert.deepEqual(result.graphs[0]!.edges, source.edges);
  assert.equal(result.graphs[0]!.sourceHash, source.sourceHash);
  assert.equal(result.findingOrScoreEffect, false);
  assert.ok(result.graphs[0]!.nodes.some(node => node.classification?.vendor));
  assert.deepEqual(apiRuntimeEvidenceGraphProjectionSchema.parse(JSON.parse(JSON.stringify(result))), JSON.parse(JSON.stringify(result)));
});

test("graph projection fails closed for unverified retention, tampering, cross-scan and capture-only evidence", () => {
  const variants = [
    { ...fixture(), source: undefined },
    { ...fixture(), scanId: "another" },
    fixture("capture_only"),
    (() => { const input = fixture(); input.bundle.runtimeEvidenceGraphs![0]!.nodes[0]!.name = "tampered"; return input; })(),
    (() => { const input = fixture(); input.bundle.runtimeEvidenceGraphs![0]!.scanId = "another"; return input; })(),
  ];
  for (const input of variants) {
    const result = projectRuntimeEvidenceGraphs(input); assert.equal(result.graphs.length, 0); assert.equal(result.status, "unavailable"); assert.ok(result.limitations.length);
  }
});

test("historical scans expose graph unavailability without creating absence findings", () => {
  const input = fixture(); delete input.bundle.runtimeEvidenceGraphs;
  const result = projectRuntimeEvidenceGraphs(input);
  assert.equal(result.status, "unavailable"); assert.equal(result.findingOrScoreEffect, false);
  assert.ok(!JSON.stringify(result).includes("gap_observed"));
});

test("presentation disable applies to a copy of persisted or cached reports and can be reversed without data loss", () => {
  const retained = { runtimeArtifacts: { runtimeEvidenceGraphProjection: projectRuntimeEvidenceGraphs(fixture()), existingEvidence: { keep: true } }, score: 73 };
  const before = JSON.stringify(retained);
  const disabled = presentRuntimeGraphForRead(retained, { CERTSCORE_RUNTIME_GRAPH_PRESENTATION: "off" });
  assert.notEqual(disabled, retained);
  assert.equal("runtimeEvidenceGraphProjection" in disabled.runtimeArtifacts, false);
  assert.deepEqual(disabled.runtimeArtifacts.existingEvidence, { keep: true });
  assert.equal(disabled.score, retained.score);
  assert.equal(JSON.stringify(retained), before);
  for (const setting of [undefined, "", "invalid", "off"]) {
    const hidden = presentRuntimeGraphForRead(retained, { CERTSCORE_RUNTIME_GRAPH_PRESENTATION: setting });
    assert.equal("runtimeEvidenceGraphProjection" in hidden.runtimeArtifacts, false);
    assert.equal(JSON.stringify(retained), before);
  }
  assert.equal(presentRuntimeGraphForRead(retained, { CERTSCORE_RUNTIME_GRAPH_PRESENTATION: "on" }), retained);
});

test("public graph rejects raw values, unsafe URLs and dangling identities", () => {
  const result = projectRuntimeEvidenceGraphs(fixture());
  const withValue = structuredClone(result); Object.assign(withValue.graphs[0]!.nodes[0]!, { value: "private" });
  assert.equal(apiRuntimeEvidenceGraphProjectionSchema.safeParse(withValue).success, false);
  const withUrl = structuredClone(result); withUrl.graphs[0]!.nodes[0]!.url = "https://site.test/?secret=x";
  assert.equal(apiRuntimeEvidenceGraphProjectionSchema.safeParse(withUrl).success, false);
  const dangling = structuredClone(result); dangling.graphs[0]!.nodes = [];
  assert.equal(apiRuntimeEvidenceGraphProjectionSchema.safeParse(dangling).success, false);
});

test("action graphs cannot project without their verified retained action packet", () => {
  const input = fixture();
  const builder = new RuntimeEvidenceGraphBuilder({ scanId: "scan", captureId: "scan:reject_observation", scenario: "post_reject", mode: "project", startedAt: new Date(Date.now() - 1000).toISOString(), browserVersion: "fixture" });
  builder.confirmAction(Date.now()); input.bundle.runtimeEvidenceGraphs!.push(builder.finish());
  const result = projectRuntimeEvidenceGraphs(input);
  assert.ok(!result.graphs.some(graph => graph.scenario === "post_reject"));
  assert.ok(result.limitations.includes("post_reject:packet_unavailable"));
});

test("policy mentions require matching retained text hash, ownership and source bundle; partial absence stays unknown", () => {
  const input = fixture(); const vendor = projectRuntimeEvidenceGraphs(input).graphs[0]!.nodes.find(node => node.classification)?.classification!;
  const digest = (value: string) => createHash("sha256").update(value).digest("hex");
  const text = `This policy describes ${vendor.product} and the collection of website usage data.`;
  const document = { text, textSha256: digest(text), evidenceRef: `policy-text:fixture:${digest(text)}`, sourceBundleSha256: input.source.sha256, coverage: "partial" as const, verified: true, targetOwned: true };
  const classification = (docs: Parameters<typeof projectRuntimeEvidenceGraphs>[0]["policyDocuments"]) => projectRuntimeEvidenceGraphs({ ...input, policyDocuments: docs }).graphs[0]!.nodes.find(node => node.classification)?.classification!;
  assert.equal(classification([document]).disclosure, "mentioned");
  for (const changes of [{ targetOwned: false }, { verified: false }, { textSha256: "0".repeat(64) }, { sourceBundleSha256: "0".repeat(64) }]) assert.equal(classification([{ ...document, ...changes }]).disclosure, "unknown");
  const absentText = "Only first-party operational processing is described in this fixture.";
  const absent = { ...document, text: absentText, textSha256: digest(absentText) };
  assert.equal(classification([absent]).disclosure, "unknown");
  assert.equal(classification([{ ...absent, coverage: "complete" }]).disclosure, "not_found_in_reviewed_surfaces");
});


test("crawl graph binds retained relationships to the exact page and attempt", () => {
  const builder = new RuntimeEvidenceGraphBuilder({ scanId: "page", captureId: "page:attempt:runtime_evidence", scenario: "pre_consent", mode: "project", startedAt: new Date().toISOString(), browserVersion: "fixture" });
  builder.handle("main", "Network.requestWillBeSent", { requestId: "1", frameId: "frame", loaderId: "document", timestamp: 1, documentURL: "https://example.com/page", type: "Script", request: { url: "https://example.com/script.js", method: "GET" }, initiator: { type: "parser", url: "https://example.com/page" } });
  const input = { graph: builder.finish(), pageId: "page", attemptId: "attempt", source: { verificationStatus: "verified", sha256: "a".repeat(64), sizeBytes: 4000 } };
  const result = projectCrawlRuntimeGraph(input);
  assert.equal(result.graphs.length, 1);
  assert.deepEqual(result.graphs[0]!.edges, input.graph.edges);
  assert.equal(result.findingOrScoreEffect, false);
  for (const variant of [
    { ...input, pageId: "another-page" },
    { ...input, attemptId: "stale-attempt" },
    { ...input, graph: undefined },
    { ...input, source: { ...input.source, verificationStatus: "unverified" } },
    { ...input, graph: { ...input.graph, sourceHash: "b".repeat(64) } },
  ]) {
    const rejected = projectCrawlRuntimeGraph(variant);
    assert.equal(rejected.status, "unavailable");
    assert.equal(rejected.graphs.length, 0);
    assert.equal(rejected.findingOrScoreEffect, false);
  }
});
