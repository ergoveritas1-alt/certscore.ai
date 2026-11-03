import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import path from "node:path";
import { parseCanonicalEvidenceArtifact } from "@certscore/contracts/dist/canonical-evidence-artifact.js";
import { canonicalEvidenceBundleSchema } from "@certscore/contracts";
import type { RunScanInput } from "@certscore/scan-core";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import type { ScanDetailResponse } from "../../web/server/scans/get-scan-by-id";
import { LocalCaptureSqsClient, LocalDiskS3Client } from "../../../scripts/run-local-v2-dag-lambda-parity";
import { buildLocalV2DagLambdaResultMessage, sendLocalV2DagLambdaResultMessage, runLocalV2DagLambdaShardedArtifactChain,
  parseLocalV2DagLambdaDispatchPayload, runLocalV2DagLambdaArtifactChain,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION, LOCAL_V2_DAG_SCAN_PROCESSOR } from "./handler";

const fixtureProvider: NonNullable<RunScanInput["localPolicyNanoAssistProvider"]> = {
  classifyLinks: async input => ({ assistId: input.assistId, rankedCandidates: input.candidates.map((c, i) => ({
    candidateId: c.candidateId, likelySurfaceType: "privacy_policy", shouldFetch: new URL(c.url).pathname === "/privacy",
    priorityRank: i + 1, confidence: 1, reason: "Explicit local fixture privacy-policy link." })) }),
  extractTopics: async input => ({ assistId: input.assistId, observedTopics: [], mentionedVendors: [],
    mentionedPurposes: [], mentionedRights: [], mentionedControls: [], confidence: 1 }),
};

function dispatch(scanId: string, targetUrl: string) {
  return parseLocalV2DagLambdaDispatchPayload({ artifactOnly: true, awsRegion: "us-west-1", callbackCorrelationId: scanId,
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION, hostname: new URL(targetUrl).hostname,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR, productionFindingIntegration: false, profile: "standard", functionName: "local-gpc-fixture",
    scannerRuntime: "certscore-v2-dag-parallel-path", strongEvidenceMode: "webmd",
    resourceInventoryCrawl: false, resourceInventoryDiscovery: false, orchestrationMode: "sharded",
    gpcObservation: { contractVersion: "certscore.gpc-observation-dispatch.v1", enabled: true,
      pairWithLane: "runtime_evidence", protocol: "passive_baseline_with_sec_gpc" },
    resultHandoff: "sqs", resultPurpose: "synthetic_verification", resultQueueUrl: "local://gpc-fixture",
    scanId, targetEnvironment: "local", targetUrl, vpcMode: "none" });
}

test("GPC product real loopback workers retain original source proof through publication and report hydration", { timeout: 240_000 }, async () => {
  const fixtureRoot = path.resolve("artifacts/local-v2-dag-scans");
  await mkdir(fixtureRoot, { recursive: true });
  const root = await mkdtemp(path.join(fixtureRoot, "gpc-release-"));
  const scanId = randomUUID(), bucket = "gpc-release-fixture", objectRoot = path.join(root, "objects"), artifactDir = path.join(root, "artifacts");
  const requests: Array<{ pathname: string; gpc: string | undefined }> = [];
  const server = createServer((req, res) => {
    const pathname = new URL(req.url!, "http://127.0.0.1").pathname;
    requests.push({ pathname, gpc: req.headers["sec-gpc"] as string | undefined });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (pathname === "/privacy") return res.end("<title>Privacy policy</title><main><h1>Privacy policy</h1><p>This local fixture describes data processing and privacy rights. Contact the fixture operator about access or deletion.</p></main>");
    if (pathname !== "/") { res.statusCode = 404; return res.end("Fixture route unavailable"); }
    res.setHeader("Set-Cookie", "fixture_preference=local; Path=/; SameSite=Lax");
    res.end(`<!doctype html><html lang="en"><title>CertScore.ai local GPC fixture</title><body><main><h1>Local product information</h1><p>This substantive page supplies deterministic consent observations for a local browser verification. It does not contain third party resources or forms.</p><a href="/privacy">Privacy policy</a></main><script>
      window.__gpp = (command, callback) => {
        const enabled = navigator.globalPrivacyControl === true;
        const ping = {gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],
          parsedSections:{usca:[{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:enabled?1:2,SharingOptOut:enabled?1:2},{GpcSegmentType:1,Gpc:enabled}]}};
        if(command === 'ping') callback(ping, true);
        if(command === 'addEventListener') callback({eventName:'listenerRegistered',data:true,listenerId:1,pingData:ping},true);
      };
    </script></body></html>`);
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  const changes: Record<string, string | undefined> = {
    NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    OPENAI_API_KEY: undefined, SCAN_PROXY_ENABLED: "false", CERTSCORE_V2_DAG_LAMBDA_REQUIRE_REGIONAL_EGRESS: "false",
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE: "3008", AWS_LAMBDA_FUNCTION_NAME: "local-gpc-fixture",
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET: bucket, CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_DIR: artifactDir,
    CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX: "fixture", CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS: "false",
    CERTSCORE_V2_DAG_LAMBDA_ORCHESTRATION_MODE: "sharded", CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY: "1",
    CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE: "cmp_safe", CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE: "none",
    CERTSCORE_POST_ACCEPT_WORKER_ENABLED: undefined, CERTSCORE_POST_REFUSAL_REJECT_WORKER_ENABLED: undefined,
    CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED: undefined,
    CERTSCORE_SCAN_TOOL: "local_v2_dag",
  };
  const previous = new Map(Object.keys(changes).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(changes)) v === undefined ? delete process.env[k] : process.env[k] = v;
  const operations: Array<{ kind: string; key: string }> = [], lanes: string[] = [];
  const s3 = new LocalDiskS3Client(objectRoot), send = s3.send.bind(s3);
  // Observe the real local object boundary; source buffers are neither replaced nor rewritten.
  s3.send = (async (command: GetObjectCommand | PutObjectCommand) => {
    operations.push({ kind: command instanceof GetObjectCommand ? "get" : "put", key: command.input.Key! });
    return send(command as GetObjectCommand);
  }) as typeof s3.send;
  const sqs = new LocalCaptureSqsClient();
  const lambda = { async send(command: InvokeCommand) {
    const payload = parseLocalV2DagLambdaDispatchPayload(JSON.parse(Buffer.from(command.input.Payload as Uint8Array).toString()));
    lanes.push(payload.workerLane!);
    const artifacts = await runLocalV2DagLambdaArtifactChain(payload, {
      artifactRoot: path.join(artifactDir, scanId, payload.workerLane!), physicalInvocationId: `fixture-${payload.workerLane}`,
      s3Client: s3, localPolicyNanoAssistProvider: fixtureProvider,
    });
    const result = { ...buildLocalV2DagLambdaResultMessage({ ...artifacts, payload, completedAt: new Date(), status: "completed" }), workerLane: payload.workerLane };
    const bytes = Buffer.from(JSON.stringify(result));
    return { $metadata: {}, StatusCode: 200, Payload: Object.assign(bytes, { transformToString: () => bytes.toString() }) };
  } };
  try {
    const payload = dispatch(scanId, targetUrl);
    const artifacts = await runLocalV2DagLambdaShardedArtifactChain(payload, { artifactRoot: path.join(artifactDir, scanId),
      s3Client: s3, s3GetClient: s3, lambdaClient: lambda, workspaceRoot: process.cwd() });
    const result = buildLocalV2DagLambdaResultMessage({ ...artifacts, payload, completedAt: new Date(), status: "completed" });
    await sendLocalV2DagLambdaResultMessage({ message: result, queueUrl: payload.resultQueueUrl, sqsClient: sqs });
    assert.deepEqual(lanes.sort(), ["consent_proof", "gpc_observation", "policy_evidence", "runtime_evidence"]);
    const terminal = sqs.messages.map(m => JSON.parse(m)).filter(m => m.status === "completed");
    assert.equal(terminal.length, 1);
    const message = terminal[0];
    const readOriginal = async (uri: string) => {
      const u = new URL(uri); assert.equal(u.hostname, bucket);
      return readFile(path.join(objectRoot, bucket, u.pathname));
    };
    const original = await readOriginal(message.artifactPointers.scanArtifactUri);
    assert.equal(original.length, message.artifactMetadata.scanArtifactUri.sizeBytes);
    assert.equal(createHash("sha256").update(original).digest("hex"), message.artifactMetadata.scanArtifactUri.sha256);
    const bundle = canonicalEvidenceBundleSchema.parse(parseCanonicalEvidenceArtifact(original.toString("utf8")));
    const assessment = bundle.gpcResponseAssessment!;
    assert.ok(assessment); assert.equal(assessment.contractVersion, "certscore.gpc-response-assessment.v3");
    assert.equal(assessment.observation.semanticProbe, "observed");
    assert.ok(bundle.gpcCmpStateComparison, JSON.stringify(assessment));
    assert.equal(bundle.gpcCmpStateComparison.baseline.sale, "not_opted_out");
    assert.equal(bundle.gpcCmpStateComparison.gpc.sale, "opted_out");
    assert.equal(operations.filter(o => o.kind === "get" && o.key.endsWith("/CanonicalEvidenceBundle.json")).length, 4);
    assert.equal(operations.filter(o => o.kind === "put" && o.key === new URL(message.artifactPointers.scanArtifactUri).pathname.slice(1)).length, 1);
    for (const pointer of [assessment.comparison.baselineArtifact!, assessment.comparison.gpcArtifact!]) {
      const bytes = await readOriginal(pointer.uri);
      assert.equal(bytes.length, pointer.sizeBytes); assert.equal(createHash("sha256").update(bytes).digest("hex"), pointer.sha256);
      const lane = canonicalEvidenceBundleSchema.parse(parseCanonicalEvidenceArtifact(bytes.toString("utf8")));
      assert.equal(lane.cookieSnapshots.some(s => s.gpcReadBinding), pointer.lane === "gpc_observation");
      assert.ok(lane.gpcImpactCapture?.document);
      if (pointer.lane === "gpc_observation") {
        assert.ok(lane.gpcObservationSession?.mainDocument);
        assert.equal(lane.gpcImpactCapture.document.committedAtMs, lane.gpcObservationSession.mainDocument.committedAtMs);
      }
    }
    assert.ok(requests.some(r => r.pathname === "/" && r.gpc === "1"));
    assert.ok(requests.some(r => r.pathname === "/" && r.gpc === undefined));
    const require = createRequire(import.meta.url);
    (require.cache as Record<string, unknown>)[require.resolve("server-only")] = { exports: {}, loaded: true };
    const { materializeLocalV2DagScanDetail } = await import("../../web/server/scans/local-v2-dag-report");
    const { buildUnifiedFindingDisplayPackets } = await import("../../web/lib/scans/unified-findings");
    const { buildPersistedScanReportProjection, readPersistedScanReportProjection, SCAN_REPORT_PROJECTION_VERSION } = await import("../../web/server/scans/scan-report-projection-contract");
    const { buildCanonicalReportExport } = await import("../../web/server/scans/report-export");
    const { buildGpcResponseReportProjection } = await import("../../web/components/scans/report-lab/gpc-report-projection");
    const { deriveApiV2GpcResponse } = await import("../../web/lib/api-v2/scan-resource");
    const now = new Date().toISOString();
    const record = { events: [{ id: randomUUID(), eventType: "v2_lambda_result.received", metadataJson: message, createdAt: now }],
      pageEvidence: [], policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [], primaryPolicyEnrichment: null,
      runtimeArtifacts: {}, signals: [], snapshot: {}, trackerVendors: [], validationFindings: [],
      scan: { id: scanId, domainHostname: "127.0.0.1", status: "completed", scanType: "full", scanFromValue: "california",
        createdAt: now, startedAt: now, completedAt: now, pagesRequested: 1, pagesScanned: 1,
        scanConfigJson: { hostname: "127.0.0.1", normalizedUrl: targetUrl, processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
          execution: { localV2Dag: { outDir: path.join(artifactDir, scanId) }, v2DagParallel: { localOnly: true, artifactOnly: true, profile: "standard", productionFindingIntegration: false } } } },
    } as unknown as ScanDetailResponse;
    const materialized = await materializeLocalV2DagScanDetail(record, { requireBundle: true });
    const findings = buildUnifiedFindingDisplayPackets({ runtimeArtifacts: materialized.runtimeArtifacts!, reviewFindingCandidates: [], validationFindings: [], validationFindingLookup: new Map() });
    const web = buildGpcResponseReportProjection(findings);
    assert.deepEqual(web?.cmpStateComparison, bundle.gpcCmpStateComparison);
    const canonical = { artifactVersion: "persisted-canonical-report-projection-v2", checklistRows: [], derivedContext: {},
      globalUnifiedFindings: findings, ownerUnifiedFindings: findings, normalizedConcerns: [], topFindingIds: [], legacyScoreAssessmentInput: { scanId } } as const;
    const persisted = buildPersistedScanReportProjection(materialized, { canonicalReportProjection: canonical as never });
    const hydrated = readPersistedScanReportProjection({ scan: materialized.scan, snapshot: {
      report_projection_computed_at: now, report_projection_payload: JSON.parse(persisted.serialized), report_projection_payload_sha256: persisted.sha256,
      report_projection_payload_size_bytes: persisted.sizeBytes, report_projection_status: "ready", report_projection_version: SCAN_REPORT_PROJECTION_VERSION } });
    assert.ok(hydrated);
    assert.deepEqual(deriveApiV2GpcResponse(hydrated)?.cmpStateComparison, bundle.gpcCmpStateComparison);
    const exported = buildCanonicalReportExport(hydrated, undefined, "ccpa_cpra")!;
    assert.deepEqual(exported.gpcResponse?.cmpStateComparison, bundle.gpcCmpStateComparison);
    assert.doesNotMatch(JSON.stringify({ comparison: exported.gpcResponse?.cmpStateComparison, guidance: exported.gpcResponse?.guidance }), /fixture_preference|documentToken|GppString|fixture-loader/);
    const { renderCanonicalReportPdf } = await import("../../web/server/scans/report-export-pdf");
    const { renderPulseMarkdown } = await import("../../web/lib/pulse/markdown");
    const { scanBundleText } = await import("../../../packages/certscore-mcp/src/tools");
    const { apiV2GpcResponseSchema } = await import("@certscore/api-contracts");
    const response = apiV2GpcResponseSchema.parse(exported.gpcResponse);
    // A real loopback target must fail the public PDF infrastructure guard.
    // Positive PDF layout/handoff uses the separate public-domain fixtures;
    // never relabel captured localhost evidence to make an export pass.
    assert.throws(() => renderCanonicalReportPdf(exported), /internal infrastructure details/);
    for (const text of [renderPulseMarkdown({ domain: "127.0.0.1", scanId, scanStatus: "completed", gpcResponse: response, topFindings: [], links: {}, summary: {} }),
      scanBundleText({ scanId, status: "completed", gpcResponse: response } as never)]) {
      assert.match(text, /Site-recorded opt-out settings/);
      assert.match(text, /does not establish that GPC caused/);
      assert.doesNotMatch(text, /fixture_preference|documentToken|GppString|deduct/i);
    }
    const receipt = { scanId, target: "loopback fixture", originalSourceBytesVerified: true, lanes, coordinatorOriginalBundleReads: 4,
      existingAuxiliaryReads: operations.filter(o => o.kind === "get" && !o.key.endsWith("/CanonicalEvidenceBundle.json")).length,
      terminalPublications: 1, cmpPacket: bundle.gpcCmpStateComparison, storedRootBytes: original.length,
      hydratedReportBytes: persisted.sizeBytes, publicPdfRejectsLoopback: true, externalRequestsAllowed: 0, paidModelCalls: 0 };
    console.info("GPC_RELEASE_PIPELINE_RECEIPT " + JSON.stringify(receipt));
    if (process.env.CERTSCORE_GPC_RELEASE_RECEIPT) await writeFile(process.env.CERTSCORE_GPC_RELEASE_RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
  } finally {
    for (const [k, v] of previous) v === undefined ? delete process.env[k] : process.env[k] = v;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("GPC product policy fixture injection rejects public and production targets before artifact work", async () => {
  for (const [url, env] of [["https://example.test/", "local"], ["http://127.0.0.1/", "production"]] as const) {
    await assert.rejects(runLocalV2DagLambdaArtifactChain({ ...dispatch(randomUUID(), url), targetEnvironment: env }, {
      artifactRoot: "/must-not-be-created", localPolicyNanoAssistProvider: fixtureProvider,
    }), /restricted to local loopback/);
  }
});
