import {derivePolicySurfaceInspectionOutcome} from "@certscore/contracts";
import { PRESENCE_ONLY_CAPTURE_PROFILE, PRESENCE_ONLY_WORKER_LANES } from "@certscore/contracts";
import {exactRouteEvidenceFixture} from "../../../packages/certscore-contracts/src/sale-sharing-exact-route.fixture";
import {SALE_SHARING_EXACT_ROUTE_POLICY,saleSharingExactRouteAuthorization} from "@certscore/contracts";
import {saleSharingCanaryFixture} from "../../../packages/certscore-contracts/src/sale-sharing-canary.fixture";
import { siteIntegrityObservationFixture } from "../../../packages/certscore-contracts/src/site-integrity.fixture.js";
import { accessibilityAuditFixture } from "../../../packages/certscore-contracts/src/accessibility-audit.fixture.js";
import { runScan } from "../../../packages/certscore-scan-core/src/index.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  cookieEventSchema,
  networkEventSchema,
  normalizedVendorObservationSchema,
  postAcceptEvidencePacketSchema,
  projectPostAcceptEvidenceForReport,
  type CanonicalEvidenceBundle,
  type ConsentActionAttempt,
  type ConsentFlowObservation,
  type ScreenshotArtifact,
  postRefusalEvidencePacketSchema,
} from "@certscore/contracts";
import { buildPreConsentRuntimePreview, buildGpcResponseAssessment } from "@certscore/scan-core";
import { gpcRuntimeFixture } from "../../../packages/certscore-contracts/src/test-fixtures/gpc-runtime";
import { OriginalRuntimeVisitFailure, PassiveLaneFailure, retainFailedTerminalLaneEvidence, localGpcComparisonMinDurationMs, localGpcAdaptiveEnabled } from "./handler";
import { parseLocalV2DagLambdaResultMessage } from "../../web/server/scans/local-v2-dag-lambda-dispatch";
import {
  LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_DEFAULT_SCANNER_WORK_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_SCANNER_WORK_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
  LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES,
  LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_SCANNER_WORK_TIMEOUT_MS,
  LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS,
  LOCAL_V2_DAG_LAMBDA_SHARDED_HANDLER_SAFETY_TIMEOUT_MS,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  POST_ACCEPT_WORKER_DEFAULT_DISPATCH_DELAY_MS,
  POST_ACCEPT_WORKER_FEATURE_FLAG,
  POST_ACCEPT_WORKER_MAX_TAIL_WAIT_MS,
  POST_ACCEPT_LATE_FORM_ADDITIONAL_TAIL_WAIT_MS,
  POST_ACCEPT_WORKER_OBSERVER_RESULT_BUDGET_MS,
  POST_REFUSAL_REJECT_WORKER_DEFAULT_DISPATCH_DELAY_MS,
  POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS,
  POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG,
  attachJoinedPostRefusalArtifactPointer,
  awaitPostRefusalWorkerWithinTailBudget,
  artifactPointersFromS3Keys,
  assessEgressProbeObservation,
  buildLocalV2DagLambdaLaneRun,
  buildLocalV2DagLambdaLaneTimingSummary,
  buildLocalV2DagLambdaResultMessage,
  buildCanonicalBundleScannerBuildProvenance,
  buildVerifiedPreConsentRuntimePreviewPacket,
  buildVerifiedPolicyEvidencePacket,
  buildLocalV2DagLambdaRuntimeDiagnostics,
  buildScannerRuntimeProvenance,
  buildLocalV2DagLambdaScanTuning,
  deriveConsentRejectAvailability,
  deriveConsentActionAvailability,
  egressIpMatchesExpected,
  egressRegionMatchesExpected,
  fetchEgressProbeThroughProxy,
  handler,
  invokeLocalV2DagLambdaWorker,
  invokeLocalV2DagLambdaWorkers,
  readLocalV2DagLambdaWorkerBundle,
  isPostRefusalRejectWorkerEnabled,
  isPostAcceptWorkerEnabled,
  mergeLocalV2DagLambdaEvidenceLaneBundles,
  mergeLocalV2DagLambdaShardBundles,
  mirrorWorkerArtifactsIntoFinalArtifactRoot,
  parseLocalV2DagLambdaDispatchPayload,
  parseEgressProbeResponse,
  postRefusalParentDispatchSha256,
  verifiedPostAcceptLateFormProgress,
  publishVerifiedPreConsentRuntimePreview,
  runLocalV2DagLambdaPostRefusalArtifactChain,
  runLocalV2DagLambdaPostAcceptArtifactChain,
  runLocalV2DagLambdaArtifactChain,
  runLocalV2DagLambdaShardedArtifactChain,
  runCmpPreferencesArtifactChain,
  retainCmpPreferencesPacket,
  retainSaleSharingOptOutPacket,
  sendLocalV2DagLambdaResultMessage,
  serializeCanonicalEvidenceBundle,
  unwrapLocalV2DagLambdaDispatchEvent,
  uploadAuxiliaryArtifactFiles,
  uploadArtifactFiles,
  writeEgressPreflightArtifact,
} from "./handler";

test("necessary-only Save remains eligible for the reject observation lane", () => {
  const availability = deriveConsentRejectAvailability(canonicalBundleFixture(
    "scan-necessary-only-reject-equivalent",
    {
      consentSurfaceInspection: {
        outcome: "actionable_surface_observed",
        coverageStatus: "complete",
        inspectionCompleted: true,
        inspectedPreInteraction: true,
        consentSurfaceObserved: true,
        actionableControlObserved: true,
        observedAtMs: 100,
        evidenceSources: ["control_inventory"],
        evidenceChannels: [],
        limitationKeys: [],
      },
      consentUiObservations: [{
        observationId: "necessary-only-save",
        observedAtMs: 100,
        likelyPresent: true,
        basis: ["fixture"],
        visibleChoiceLabels: ["Auswahl speichern"],
        defaultTogglePurposeLabels: ["Essenziell"],
        necessaryPreferenceSelectionObserved: true,
        necessaryPreferenceLabels: ["Essenziell"],
        precheckedOptionalPurposeCount: 0,
        precheckedOptionalPurposeLabels: [],
        acceptControlObserved: true,
        rejectControlObserved: false,
        managePreferencesControlObserved: true,
        controls: [{
          label: "Auswahl speichern",
          actionType: "save_preferences",
          selectorHint: "#tarteaucitronCloseAlert",
          visible: true,
          classifierReasonCodes: ["matched_options", "variant_save_preferences"],
        }],
      }],
    },
  ));

  assert.deepEqual(availability, {
    inventoryComplete: true,
    necessaryOnlyRejectEquivalentObserved: true,
    rejectControlObserved: false,
  });
});

test("BST external browser-setting instructions do not make a reject action applicable", () => {
  const availability = deriveConsentRejectAvailability(canonicalBundleFixture(
    "scan-bst-no-reject",
    {
      consentSurfaceInspection: {
        outcome: "actionable_surface_observed",
        coverageStatus: "complete",
        inspectionCompleted: true,
        inspectedPreInteraction: true,
        consentSurfaceObserved: true,
        actionableControlObserved: true,
        observedAtMs: 100,
        evidenceSources: ["control_inventory"],
        evidenceChannels: [],
        limitationKeys: [],
      },
      consentUiObservations: [{
        observationId: "bst-accept-only",
        observedAtMs: 100,
        likelyPresent: true,
        basis: ["fixture"],
        visibleChoiceLabels: ["VERSTANDEN"],
        defaultTogglePurposeLabels: [],
        necessaryPreferenceSelectionObserved: null,
        necessaryPreferenceLabels: [],
        precheckedOptionalPurposeCount: 0,
        precheckedOptionalPurposeLabels: [],
        acceptControlObserved: true,
        rejectControlObserved: false,
        managePreferencesControlObserved: false,
        controls: [{
          label: "VERSTANDEN",
          actionType: "accept_all",
          selectorHint: "button.bst-accept-btn",
          visible: true,
          classifierReasonCodes: ["matched_accept"],
        }],
      }],
    },
  ));

  assert.deepEqual(availability, {
    inventoryComplete: true,
    necessaryOnlyRejectEquivalentObserved: false,
    rejectControlObserved: false,
  });
});

test("canonical evidence bundle transport is compact without changing evidence", () => {
  const bundle = {
    cookieEvents: [{ cookieName: "session", evidenceRefs: ["cookie-1"] }],
    policySurfaceObservations: [{ status: "fetched", textExcerpt: "Retained evidence." }],
  };
  const serialized = serializeCanonicalEvidenceBundle(bundle);
  assert.equal(serialized, JSON.stringify(bundle));
  assert.deepEqual(JSON.parse(serialized), bundle);
  assert.equal(serialized.includes("\n"), false);
});

test("sharded orchestration fans out exactly one consent, runtime, and policy evidence lane", () => {
  assert.deepEqual(LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES, [
    "consent_proof",
    "runtime_evidence",
    "policy_evidence",
  ]);
});

test("required lane failure waits for sibling terminal outcomes and retains verified sources only in the failed result", async () => {
  const parent=parseLocalV2DagLambdaDispatchPayload(validPayload({orchestrationMode:"sharded"}));
  let siblingReturned=false;
  let failure: PassiveLaneFailure | undefined;
  try { await invokeLocalV2DagLambdaWorkers({parentPayload:parent,parentScanId:parent.scanId,workerLanes:["runtime_evidence","policy_evidence"],lambdaClient:{async send(command){
    const p=JSON.parse(Buffer.from(command.input.Payload??[]).toString());
    if(p.workerLane==='policy_evidence') throw Error('policy schema failure');
    await new Promise(resolve=>setTimeout(resolve,5));siblingReturned=true;
    return {StatusCode:200,Payload:Buffer.from(JSON.stringify({scanId:p.scanId,workerLane:p.workerLane,status:'completed',artifactPointers:{scanArtifactUri:'s3://fixture/runtime.json'}}))};
  }}}); } catch(e) { assert.ok(e instanceof PassiveLaneFailure);failure=e; }
  assert.ok(siblingReturned);assert.equal(failure!.results.length,2);
  const bundle=gpcRuntimeFixture({enabled:false});bundle.scanId=parent.scanId;
  const bytes=Buffer.from(JSON.stringify(bundle));
  const successful=failure!.results.find(r=>r.workerLane==='runtime_evidence')!;
  successful.artifactPointers={scanArtifactUri:'s3://fixture/runtime.json'};
  successful.artifactMetadata={scanArtifactUri:{sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length}};
  const summary=await retainFailedTerminalLaneEvidence(failure!.results,parent.scanId,{s3GetClient:{async send(){return {Body:bytes};}}});
  assert.equal(summary.lanes[0]!.status,'verified_retained');assert.equal(summary.lanes[1]!.status,'failed');
  const message=buildLocalV2DagLambdaResultMessage({payload:parent,completedAt:new Date(),status:'failed',terminalLaneEvidence:summary});
  assert.deepEqual(parseLocalV2DagLambdaResultMessage(JSON.stringify(message)).terminalLaneEvidence,summary);
  assert.equal(buildLocalV2DagLambdaResultMessage({payload:parent,completedAt:new Date(),status:'completed',terminalLaneEvidence:summary}).terminalLaneEvidence,undefined);
  successful.artifactMetadata.scanArtifactUri!.sha256='0'.repeat(64);
  const bad=await retainFailedTerminalLaneEvidence(failure!.results,parent.scanId,{s3GetClient:{async send(){return {Body:bytes};}}});
  assert.equal(bad.lanes[0]!.status,'unverifiable');assert.equal(bad.lanes[0]!.source,null);
});

test("a first successful redirect does not override a terminal navigation no-go",()=>{
 const bundle=gpcRuntimeFixture({enabled:true});
 bundle.modulesRun[0]!.status='failed';bundle.modulesRun[0]!.siteFacingNavigation={requestedUrl:bundle.url,firstResponseAt:bundle.startedAt,firstResponseOffsetMs:0,firstHttpStatus:302,firstEffectiveUrl:bundle.url,navigationCount:1,challengeDetected:false,challengeType:null};
 bundle.scanNoGoAssessment={status:'available',version:'scan-no-go-assessment-v1',decision:'no_go',scanNoGoConfidence:0.92,reasonCodes:['navigation_transport_failure'],corroboratorCodes:[],contradictorCodes:[],supportingSignals:{},evidenceRefs:[]};
 assert.equal(buildLocalV2DagLambdaLaneRun({bundle,workerLane:'gpc_observation',region:'us-west-1'})!.accessOutcome,'navigation_failed');
});

test("GPC observation binds its worker to the exact parent dispatch", async () => {
  const parent = parseLocalV2DagLambdaDispatchPayload(validPayload({
    gpcObservation: {
      contractVersion: "certscore.gpc-observation-dispatch.v1",
      enabled: true,
      pairWithLane: "runtime_evidence",
      protocol: "passive_baseline_with_sec_gpc",
    },
    orchestrationMode: "sharded",
  }));
  let dispatched: Record<string, unknown> | null = null;
  await invokeLocalV2DagLambdaWorker({
    parentPayload: parent,
    parentScanId: parent.scanId,
    workerLane: "gpc_observation",
    lambdaClient: {
      async send(command) {
        dispatched = JSON.parse(Buffer.from(command.input.Payload ?? []).toString("utf8"));
        return {
          StatusCode: 200,
          Payload: Buffer.from(JSON.stringify({
            artifactPointers: { scanArtifactUri: "s3://test/gpc/CanonicalEvidenceBundle.json" },
            parentDispatchSha256: postRefusalParentDispatchSha256(parent),
            scanId: parent.scanId,
            status: "completed",
            workerLane: "gpc_observation",
          })),
        };
      },
    },
  });
  assert.equal(dispatched?.workerLane, "gpc_observation");
  assert.equal(dispatched?.parentDispatchSha256, postRefusalParentDispatchSha256(parent));
  assert.deepEqual(dispatched?.gpcObservation, parent.gpcObservation);
  const terminal = buildLocalV2DagLambdaResultMessage({
    completedAt: new Date("2026-08-20T12:00:00.000Z"),
    payload: parseLocalV2DagLambdaDispatchPayload(dispatched),
    status: "completed",
  });
  assert.equal(terminal.parentDispatchSha256, postRefusalParentDispatchSha256(parent));

  let passiveDispatch: Record<string, unknown> | null = null;
  await invokeLocalV2DagLambdaWorker({
    parentPayload: parent,
    parentScanId: parent.scanId,
    workerLane: "runtime_evidence",
    lambdaClient: {
      async send(command) {
        passiveDispatch = JSON.parse(Buffer.from(command.input.Payload ?? []).toString("utf8"));
        return {
          StatusCode: 200,
          Payload: Buffer.from(JSON.stringify({
            artifactPointers: { scanArtifactUri: "s3://test/runtime/CanonicalEvidenceBundle.json" },
            scanId: parent.scanId,
            status: "completed",
            workerLane: "runtime_evidence",
          })),
        };
      },
    },
  });
  assert.equal(passiveDispatch?.gpcObservation, undefined);
  assert.doesNotThrow(() => parseLocalV2DagLambdaDispatchPayload(passiveDispatch));
});

test("GPC worker parsing fails closed without enabled configuration and parent checksum", () => {
  assert.throws(() => parseLocalV2DagLambdaDispatchPayload(validPayload({
    orchestrationMode: "worker",
    workerLane: "gpc_observation",
  })), /enabled GPC configuration/);
  assert.throws(() => parseLocalV2DagLambdaDispatchPayload(validPayload({
    gpcObservation: {
      contractVersion: "certscore.gpc-observation-dispatch.v1",
      enabled: true,
      pairWithLane: "runtime_evidence",
      protocol: "passive_baseline_with_sec_gpc",
    },
    orchestrationMode: "worker",
    workerLane: "gpc_observation",
  })), /exact parent dispatch checksum/);
});

test("diagnostic observation applies only to explicitly enabled local baseline and GPC workers", () => {
 for (const duration of [5000, 15000] as const) {
  for (const workerLane of ["runtime_evidence", "gpc_observation", "consent_proof", "policy_evidence", "accept_observation", "reject_observation"] as const) {
    for (const targetEnvironment of ["local", "production"] as const) {
      const expected = targetEnvironment === "local" && ["runtime_evidence", "gpc_observation"].includes(workerLane) ? duration : undefined;
      const payload = {targetEnvironment, workerLane, debugOverrides: {gpcComparisonMinDurationMs: duration}};
      assert.equal(localGpcComparisonMinDurationMs(payload), expected);
      assert.equal(localGpcComparisonMinDurationMs({...payload, debugOverrides: {}}), undefined);
      assert.equal(localGpcComparisonMinDurationMs({...payload, resourceInventoryCrawl: true}), undefined);
    }
  }
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({debugOverrides: {gpcComparisonMinDurationMs: duration}})).debugOverrides?.gpcComparisonMinDurationMs, duration);
 }
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({debugOverrides: {gpcComparisonMinDurationMs: 5000}}));
  assert.equal(payload.debugOverrides?.gpcComparisonMinDurationMs, 5000);
  for (const duration of [3000, 6000, 16000, "5000", "15000"]) {
    const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload({debugOverrides: {gpcComparisonMinDurationMs: duration}}));
    assert.equal(parsed.debugOverrides?.gpcComparisonMinDurationMs, undefined);
  }
});

test("adaptive comparison dispatch is strict and excludes production, action and inventory workers",()=>{
  for(const workerLane of ["runtime_evidence","gpc_observation","policy_evidence","consent_proof","accept_observation","reject_observation"] as const)
    for(const targetEnvironment of ["local","production"] as const){
      const payload={workerLane,targetEnvironment,debugOverrides:{gpcComparisonAdaptive:true as const}};
      const enabled=targetEnvironment==="local"&&["runtime_evidence","gpc_observation"].includes(workerLane);
      assert.equal(localGpcAdaptiveEnabled(payload),enabled);
      assert.equal(localGpcComparisonMinDurationMs(payload),enabled?15000:undefined);
      assert.equal(localGpcAdaptiveEnabled({...payload,resourceInventoryCrawl:true}),false);
    }
  for(const flag of [false,1,"true"]){
    const parsed=parseLocalV2DagLambdaDispatchPayload(validPayload({debugOverrides:{gpcComparisonAdaptive:flag}}));
    assert.equal(parsed.debugOverrides?.gpcComparisonAdaptive,undefined);
  }
});

test("GPC invocation failure is terminal and neutral without losing the three verified passive outcomes", async () => {
  const parent = parseLocalV2DagLambdaDispatchPayload(validPayload({ orchestrationMode: "sharded", gpcObservation: {
    contractVersion: "certscore.gpc-observation-dispatch.v1", enabled: true,
    pairWithLane: "runtime_evidence", protocol: "passive_baseline_with_sec_gpc",
  } }));
  const results = await invokeLocalV2DagLambdaWorkers({ parentPayload: parent, parentScanId: parent.scanId,
    workerLanes: [...LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES, "gpc_observation"], lambdaClient: {
      async send(command) {
        const p = JSON.parse(Buffer.from(command.input.Payload ?? []).toString());
        if (p.workerLane === "gpc_observation") throw new Error("worker unavailable");
        return { StatusCode: 200, Payload: Buffer.from(JSON.stringify({ scanId: p.scanId, workerLane: p.workerLane,
          status: "completed", artifactPointers: { scanArtifactUri: `s3://fixture/${p.workerLane}/bundle.json` } })) };
      },
    },
  });
  assert.equal(results.filter((r) => r.status === "completed").length, 3);
  const failed = results.find((r) => r.workerLane === "gpc_observation")!;
  assert.equal(failed.failureReason, "gpc_worker_failed");
  assert.equal(failed.artifactPointers, undefined);
  const summary = buildLocalV2DagLambdaLaneTimingSummary({ coordinatorStartedAtMs: Date.now() - 100,
    generatedAtMs: Date.now(), passiveLaneBarrierCompletedAtMs: Date.now(), passiveWorkerResults: results,
    postRefusal: { join: "disabled" }, postAccept: { join: "disabled" } });
  const gpc = summary.lanes.find((lane) => lane.lane === "gpc_observation")!;
  assert.equal(gpc.outcome, "failed");
  assert.equal(gpc.evidenceJoined, false);
  assert.ok(gpc.terminalOutcomeObservedAt);
  await assert.rejects(invokeLocalV2DagLambdaWorkers({ parentPayload: parent, parentScanId: parent.scanId,
    workerLanes: ["runtime_evidence"], lambdaClient: { async send() { throw new Error("critical baseline unavailable"); } } }), /critical baseline/);
});

test("real redirected passive workers retain parent and final-document identity through upload, verification and GPC pairing", { timeout: 30_000 }, async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "local-memory-only";
  const root = await mkdtemp(path.join(os.tmpdir(), "certscore-worker-identity-"));
  const server = createHttpServer((request, response) => {
    if (request.url === "/") {
      response.writeHead(302, { Location: "/final?region=us" });
      response.end();
      return;
    }
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html><body><h1>Local public information fixture</h1><p>This substantive document is a deterministic browser fixture for independent baseline and privacy-signal captures, without outside requests or consent interactions.</p></body></html>');
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  const bodies = new Map<string, Buffer>();
  const bundles: CanonicalEvidenceBundle[] = [];
  const pointers: Array<{ uri: string; sha256: string; sizeBytes: number }> = [];
  try {
    for (const workerLane of ["runtime_evidence", "gpc_observation"] as const) {
      const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({
        scanId: "paired-real-worker", targetUrl, hostname: "127.0.0.1", orchestrationMode: "worker", workerLane,
        parentDispatchSha256: "a".repeat(64),
        ...(workerLane === "gpc_observation" ? { gpcObservation: {
          contractVersion: "certscore.gpc-observation-dispatch.v1", enabled: true,
          pairWithLane: "runtime_evidence", protocol: "passive_baseline_with_sec_gpc",
        } } : {}),
      }));
      const artifacts = await runLocalV2DagLambdaArtifactChain(payload, {
        artifactRoot: path.join(root, workerLane), physicalInvocationId: `physical-${workerLane}`,
        preConsentModuleDeadlineMs: 5_000, preConsentScreenshotMode: "never",
        s3Client: { async send(command: PutObjectCommand) {
          bodies.set(String(command.input.Key), Buffer.from(command.input.Body as Uint8Array)); return {};
        } },
      });
      const result = { scanId: payload.scanId, workerLane, status: "completed" as const, ...artifacts };
      const verified = await readLocalV2DagLambdaWorkerBundle(result, { s3GetClient: { async send(command: GetObjectCommand) {
        const body = bodies.get(String(command.input.Key)); assert.ok(body); return { Body: body };
      } } });
      assert.ok(verified, "real captured bundle must verify, not only a hand-written fixture");
      assert.equal(verified.scanId, payload.scanId);
      assert.equal(verified.scanLaneRuns[0]?.physicalInvocationId, `physical-${workerLane}`);
      assert.equal(verified.scanLaneRuns[0]?.firstEffectiveUrl, targetUrl);
      assert.ok(verified.networkEvents.some((event) => event.isMainFrame && event.resourceType === "document" &&
        event.requestUrl === `${targetUrl}final?region=us`));
      bundles.push(verified);
      pointers.push({ uri: artifacts.artifactPointers.scanArtifactUri!, ...artifacts.artifactMetadata.scanArtifactUri! });
    }
    const assessment = buildGpcResponseAssessment({ baseline: bundles[0]!, gpc: bundles[1]!, baselineArtifact: pointers[0]!, gpcArtifact: pointers[1]! });
    assert.equal(assessment.comparison.delivery.status, "verified");
    assert.equal(assessment.comparison.limitationKeys.includes("paired_scan_context_mismatch"), false);
    assert.equal(assessment.comparison.limitationKeys.includes("baseline_gpc_document_mismatch"), false);
    assert.equal(assessment.status, "no_observable_response");
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

for (const failure of ["missing_metadata", "checksum", "size", "schema", "read", "parent_identity"] as const) {
  test(`GPC artifact ${failure} failure stays isolated from canonical baseline`, async () => {
    const body = Buffer.from(failure === "schema" ? '{}' : JSON.stringify(canonicalBundleFixture(failure === "parent_identity" ? "wrong-scan" : "gpc-verify")));
    const result = { scanId: "gpc-verify", workerLane: "gpc_observation" as const, status: "completed" as "completed" | "failed",
      artifactPointers: { scanArtifactUri: "s3://fixture/gpc/CanonicalEvidenceBundle.json" },
      artifactMetadata: failure === "missing_metadata" ? undefined : { scanArtifactUri: {
        sha256: failure === "checksum" ? "f".repeat(64) : createHash("sha256").update(body).digest("hex"),
        sizeBytes: body.length + (failure === "size" ? 1 : 0),
      } },
    };
    const bundle = await readLocalV2DagLambdaWorkerBundle(result, { s3GetClient: { async send() {
      if (failure === "read") throw new Error("unavailable");
      return { Body: body };
    } } });
    assert.equal(bundle, undefined);
    assert.equal(result.status, "failed");
    assert.equal((result as { failureReason?: string }).failureReason, "gpc_artifact_unverifiable");
  });
}

test("post-refusal dispatch is typed, exact-target authorized, and default off", () => {
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({
    postRefusalObservation: {
      enabled: true,
      dispatchDelayMs: 500,
      observationWindowMs: 8_000,
      confirmationTimeoutMs: 1_500,
      actionSearchTimeoutMs: 1_500,
      resolver: {
        kind: "named_cmp",
        cmpCanonicalName: "OneTrust",
        confirmation: { kind: "tcf_purposes_denied", purposeIds: [1, 2, 3, 4, 7, 9, 10] },
      },
      interactionAuthorization: {
        kind: "owned_canary",
        authorizationId: "ergoveritas_owned_post_refusal_canary.v1",
      },
    },
  }));

  assert.equal(
    payload.postRefusalObservation?.dispatchDelayMs,
    POST_REFUSAL_REJECT_WORKER_DEFAULT_DISPATCH_DELAY_MS,
  );
  assert.equal(isPostRefusalRejectWorkerEnabled(payload, {}), false);
  assert.equal(isPostRefusalRejectWorkerEnabled(payload, {
    [POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG]: "1",
  }), true);
  assert.match(postRefusalParentDispatchSha256(payload), /^[a-f0-9]{64}$/);
});

test("post-Accept dispatch is independently typed, delayed, and default off", () => {
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({
    orchestrationMode: "sharded",
    postAcceptObservation: {
      enabled: true,
      dispatchDelayMs: 1_000,
      observationWindowMs: 8_000,
      confirmationTimeoutMs: 1_500,
      actionSearchTimeoutMs: 1_500,
      resolver: {
        kind: "named_cmp",
        cmpCanonicalName: "OneTrust",
        confirmation: {
          kind: "tcf_purposes_granted_or_cmp_cookie_changed",
          purposeIds: [1, 3, 4],
          cookieName: "OptanonConsent",
        },
      },
      interactionAuthorization: {
        kind: "owned_canary",
        authorizationId: "ergoveritas_owned_post_refusal_canary.v1",
      },
    },
  }));

  assert.equal(payload.postAcceptObservation?.dispatchDelayMs, POST_ACCEPT_WORKER_DEFAULT_DISPATCH_DELAY_MS);
  assert.equal(isPostAcceptWorkerEnabled(payload, {}), false);
  assert.equal(isPostAcceptWorkerEnabled(payload, { [POST_ACCEPT_WORKER_FEATURE_FLAG]: "1" }), true);
  assert.match(postRefusalParentDispatchSha256(payload), /^[a-f0-9]{64}$/);
});

test("Accept worker late-banner budget remains bounded while the coordinator tail stays authoritative", () => {
  assert.ok(POST_ACCEPT_WORKER_OBSERVER_RESULT_BUDGET_MS >= 20_000);
  assert.ok(POST_ACCEPT_WORKER_OBSERVER_RESULT_BUDGET_MS < 30_000);
  assert.equal(POST_ACCEPT_WORKER_MAX_TAIL_WAIT_MS, 6_000);
  assert.ok(POST_ACCEPT_WORKER_MAX_TAIL_WAIT_MS < POST_ACCEPT_WORKER_OBSERVER_RESULT_BUDGET_MS);
  assert.equal(POST_ACCEPT_LATE_FORM_ADDITIONAL_TAIL_WAIT_MS, 12_000);
});

test("only a scan-bound late-form progress marker can extend the Accept tail", async () => {
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({ orchestrationMode: "sharded" }));
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-artifacts";
  const marker = { contractVersion: "certscore.post_accept_late_form_progress.v1",
    scanId: payload.scanId, parentDispatchSha256: postRefusalParentDispatchSha256(payload),
    targetSha256: createHash("sha256").update(payload.targetUrl).digest("hex") };
  try {
    const client = { send: async (command: GetObjectCommand) => {
      assert.equal(command.input.Bucket, "test-artifacts");
      assert.match(command.input.Key ?? "", /\/lanes\/accept_observation\/LateFormCaptureProgress\.json$/);
      return { Body: Buffer.from(JSON.stringify(marker)) };
    } };
    assert.equal(await verifiedPostAcceptLateFormProgress(payload, client), true);
    assert.equal(await verifiedPostAcceptLateFormProgress(payload, { send: async () => ({
      Body: Buffer.from(JSON.stringify({ ...marker, parentDispatchSha256: "0".repeat(64) })) }) }), false);
    assert.equal(await verifiedPostAcceptLateFormProgress(payload, { send: async () => { throw new Error("missing"); } }), false);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("complete consent inventory exposes Accept availability without changing Reject v1", () => {
  const bundle = canonicalBundleFixture("scan-action-availability", {
    consentSurfaceInspection: {
      artifactVersion: "certscore.consent_surface_inspection.v1",
      coverageStatus: "complete",
      inspectedAt: "2026-09-01T00:00:00.000Z",
      inspectionCompleted: true,
      limitationKeys: [],
      sourceObservationIds: ["consent-ui-1"],
    },
    consentUiObservations: [{
      observationId: "consent-ui-1",
      url: "https://example.com/",
      observedAt: "2026-09-01T00:00:00.000Z",
      bannerDetected: true,
      confidence: "high",
      firstLayer: true,
      acceptControlObserved: true,
      rejectControlObserved: false,
      optionsControlObserved: false,
      controls: [{
        controlId: "accept-1",
        actionType: "accept_all",
        labelText: "Accept all",
        visible: true,
      }],
      supportingArtifactIds: [],
    }],
  });
  assert.deepEqual(deriveConsentRejectAvailability(bundle), {
    inventoryComplete: true,
    necessaryOnlyRejectEquivalentObserved: false,
    rejectControlObserved: false,
  });
  assert.equal(deriveConsentActionAvailability(bundle).acceptControlObserved, true);
});

test("reject worker invocation clears the coordinator launch delay without changing parent identity", async () => {
  const parentPayload = parseLocalV2DagLambdaDispatchPayload(validPayload({
    orchestrationMode: "sharded",
    postRefusalObservation: {
      enabled: true,
      dispatchDelayMs: 500,
      resolver: {
        kind: "named_cmp",
        cmpCanonicalName: "OneTrust",
        confirmation: { kind: "tcf_purposes_denied", purposeIds: [1] },
      },
      interactionAuthorization: {
        kind: "owned_canary",
        authorizationId: "ergoveritas_owned_post_refusal_canary.v1",
      },
    },
  }));
  let childPayload: Record<string, unknown> | undefined;
  await invokeLocalV2DagLambdaWorker({
    parentPayload,
    parentScanId: parentPayload.scanId,
    workerLane: "reject_observation",
    lambdaClient: {
      async send(command) {
        childPayload = JSON.parse(Buffer.from(command.input.Payload ?? []).toString("utf8"));
        return {
          StatusCode: 200,
          Payload: Buffer.from(JSON.stringify({
            artifactMetadata: {
              postRefusalPacketUri: { sha256: "a".repeat(64), sizeBytes: 10 },
            },
            artifactPointers: {
              postRefusalPacketUri: "s3://test-bucket/reject/PostRefusalEvidencePacket.json",
            },
            postRefusalEvidence: {
              artifactOnly: true,
              contractVersion: "certscore.v2.lambda-post-refusal-evidence-descriptor.v1",
              generatedAt: "2026-08-26T12:00:00.000Z",
              descriptorKind: "post_refusal_evidence_descriptor",
              packetMetadata: { sha256: "a".repeat(64), sizeBytes: 10 },
              packetPointer: "s3://test-bucket/reject/PostRefusalEvidencePacket.json",
              parentDispatchSha256: "b".repeat(64),
              parentScanId: parentPayload.scanId,
              processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
              productionFindingIntegration: false,
              refusalExercised: false,
              observationCount: 0,
              scanId: parentPayload.scanId,
              status: "unsupported",
              targetEnvironment: "local",
            },
            scanId: parentPayload.scanId,
            status: "completed",
            workerLane: "reject_observation",
          })),
        };
      },
    },
  });

  assert.equal(childPayload?.scanId, parentPayload.scanId);
  assert.equal(childPayload?.workerLane, "reject_observation");
  assert.equal(
    (childPayload?.postRefusalObservation as Record<string, unknown>)?.dispatchDelayMs,
    0,
  );
  assert.equal(childPayload?.parentDispatchSha256, postRefusalParentDispatchSha256(parentPayload));
  const changedConfirmation = parseLocalV2DagLambdaDispatchPayload(validPayload({
    orchestrationMode: "sharded",
    postRefusalObservation: {
      ...parentPayload.postRefusalObservation,
      resolver: {
        kind: "named_cmp",
        cmpCanonicalName: "OneTrust",
        confirmation: { kind: "tcf_purposes_denied", purposeIds: [1, 2] },
      },
    },
  }));
  assert.notEqual(
    postRefusalParentDispatchSha256(changedConfirmation),
    postRefusalParentDispatchSha256(parentPayload),
  );
});

test("Reject Path uses a 500 ms launch offset and an eight-second post-primary tail cap", async () => {
  assert.equal(POST_REFUSAL_REJECT_WORKER_DEFAULT_DISPATCH_DELAY_MS, 500);
  assert.equal(POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS, 8_000);

  const completedController = new AbortController();
  assert.equal(await awaitPostRefusalWorkerWithinTailBudget({
    abortController: completedController,
    maxTailWaitMs: 25,
    passiveLaneBarrierCompletedAtMs: Date.now(),
    workerPromise: Promise.resolve(),
  }), true);
  assert.equal(completedController.signal.aborted, false);

  const timedOutController = new AbortController();
  const startedAt = Date.now();
  assert.equal(await awaitPostRefusalWorkerWithinTailBudget({
    abortController: timedOutController,
    maxTailWaitMs: 25,
    passiveLaneBarrierCompletedAtMs: startedAt,
    workerPromise: new Promise<void>(() => undefined),
  }), false);
  assert.equal(timedOutController.signal.aborted, true);
  assert.ok(Date.now() - startedAt < 250);
});

test("Reject Path worker return and packet verification share one absolute tail deadline", async () => {
  const controller = new AbortController();
  const passiveLaneBarrierCompletedAtMs = Date.now();
  const firstStageCompleted = await awaitPostRefusalWorkerWithinTailBudget({
    abortController: controller,
    maxTailWaitMs: 100,
    passiveLaneBarrierCompletedAtMs,
    workerPromise: new Promise<void>((resolve) => setTimeout(resolve, 10)),
  });
  const secondStageCompleted = await awaitPostRefusalWorkerWithinTailBudget({
    abortController: controller,
    maxTailWaitMs: 100,
    passiveLaneBarrierCompletedAtMs,
    workerPromise: new Promise<void>(() => undefined),
  });

  assert.equal(firstStageCompleted, true);
  assert.equal(secondStageCompleted, false);
  assert.equal(controller.signal.aborted, true);
  assert.ok(Date.now() - passiveLaneBarrierCompletedAtMs < 500);
});

test("concurrent action joins do not stack equal absolute tail deadlines", async () => {
  const passiveLaneBarrierCompletedAtMs = Date.now();
  const rejectController = new AbortController();
  const acceptController = new AbortController();
  const [rejectCompleted, acceptCompleted] = await Promise.all([
    awaitPostRefusalWorkerWithinTailBudget({
      abortController: rejectController,
      maxTailWaitMs: 100,
      passiveLaneBarrierCompletedAtMs,
      workerPromise: new Promise<void>((resolve) => setTimeout(resolve, 35)),
    }),
    awaitPostRefusalWorkerWithinTailBudget({
      abortController: acceptController,
      maxTailWaitMs: 100,
      passiveLaneBarrierCompletedAtMs,
      workerPromise: new Promise<void>(() => undefined),
    }),
  ]);

  assert.equal(rejectCompleted, true);
  assert.equal(acceptCompleted, false);
  assert.equal(acceptController.signal.aborted, true);
  assert.ok(Date.now() - passiveLaneBarrierCompletedAtMs < 300);
});

test("a terminal Accept join is retained while Reject uses its remaining tail budget", async () => {
  const passiveLaneBarrierCompletedAtMs = Date.now();
  const rejectController = new AbortController();
  const acceptController = new AbortController();
  const [rejectCompleted, acceptCompleted] = await Promise.all([
    awaitPostRefusalWorkerWithinTailBudget({
      abortController: rejectController,
      maxTailWaitMs: 100,
      passiveLaneBarrierCompletedAtMs,
      workerPromise: new Promise<void>(() => undefined),
    }),
    awaitPostRefusalWorkerWithinTailBudget({
      abortController: acceptController,
      maxTailWaitMs: 100,
      passiveLaneBarrierCompletedAtMs,
      workerPromise: new Promise<void>((resolve) => setTimeout(resolve, 35)),
    }),
  ]);

  assert.equal(rejectCompleted, false);
  assert.equal(acceptCompleted, true);
  assert.equal(rejectController.signal.aborted, true);
  assert.equal(acceptController.signal.aborted, false);
});

test("an already-terminal action worker is retained when its sequential join runs after the shared deadline", async () => {
  const controller = new AbortController();
  const completed = await awaitPostRefusalWorkerWithinTailBudget({
    abortController: controller,
    maxTailWaitMs: 25,
    passiveLaneBarrierCompletedAtMs: Date.now() - 50,
    workerAlreadySettled: true,
    workerPromise: Promise.resolve(),
  });

  assert.equal(completed, true);
  assert.equal(controller.signal.aborted, false);
});

test("lane timing summary makes all four completion times and the reject barrier delta queryable", () => {
  const coordinatorStartedAtMs = Date.parse("2026-08-26T20:00:00.000Z");
  const passiveLaneBarrierCompletedAtMs = coordinatorStartedAtMs + 5_000;
  const result = (
    workerLane: "consent_proof" | "runtime_evidence" | "policy_evidence" | "reject_observation",
    responseOffsetMs: number,
  ) => ({
    completedAt: new Date(coordinatorStartedAtMs + responseOffsetMs - 50).toISOString(),
    coordinatorTiming: {
      durationMs: responseOffsetMs,
      invocationStartedAt: new Date(coordinatorStartedAtMs).toISOString(),
      responseReceivedAt: new Date(coordinatorStartedAtMs + responseOffsetMs).toISOString(),
    },
    handlerTiming: {
      completedAt: new Date(coordinatorStartedAtMs + responseOffsetMs - 50).toISOString(),
      handlerDurationMs: responseOffsetMs - 50,
      handlerStartedAt: new Date(coordinatorStartedAtMs).toISOString(),
    },
    scanId: "scan-lane-timing-1",
    status: "completed" as const,
    workerLane,
  });
  const reject = result("reject_observation", 6_200);
  const summary = buildLocalV2DagLambdaLaneTimingSummary({
    coordinatorStartedAtMs,
    generatedAtMs: coordinatorStartedAtMs + 6_250,
    passiveLaneBarrierCompletedAtMs,
    passiveWorkerResults: [
      result("consent_proof", 4_000),
      result("runtime_evidence", 5_000),
      result("policy_evidence", 3_000),
    ],
    postRefusal: {
      dispatchStartedAtMs: coordinatorStartedAtMs + 500,
      join: "joined",
      outcomeObservedAtMs: coordinatorStartedAtMs + 6_200,
      result: reject,
    },
  });

  assert.equal(summary.lanes.length, 4);
  assert.equal(summary.passiveLaneBarrierCompletedAt, "2026-08-26T20:00:05.000Z");
  assert.equal(summary.rejectCompletedBeforeOrAtPassiveBarrier, false);
  assert.equal(summary.rejectTailDeltaMs, 1_200);
  assert.equal(summary.rejectLaneAddedWaitMs, 1_200);
  assert.deepEqual(
    summary.lanes.map((lane) => [lane.lane, lane.coordinatorElapsedMs, lane.terminalOutcomeDeltaFromPassiveBarrierMs]),
    [
      ["consent_proof", 4_000, -1_000],
      ["runtime_evidence", 5_000, 0],
      ["policy_evidence", 3_000, -2_000],
      ["reject_observation", 6_200, 1_200],
    ],
  );

  const timedOut = buildLocalV2DagLambdaLaneTimingSummary({
    coordinatorStartedAtMs,
    generatedAtMs: coordinatorStartedAtMs + 13_000,
    passiveLaneBarrierCompletedAtMs,
    passiveWorkerResults: [
      result("consent_proof", 4_000),
      result("runtime_evidence", 5_000),
      result("policy_evidence", 3_000),
    ],
    postRefusal: {
      dispatchStartedAtMs: coordinatorStartedAtMs + 500,
      join: "timed_out",
      outcomeObservedAtMs: coordinatorStartedAtMs + 13_000,
    },
  });
  const timedOutReject = timedOut.lanes.find((lane) => lane.lane === "reject_observation");
  assert.equal(timedOut.rejectLaneJoin, "timed_out");
  assert.equal(timedOut.rejectLaneAddedWaitMs, 8_000);
  assert.equal(timedOut.rejectTailDeltaMs, 8_000);
  assert.equal(timedOutReject?.outcome, "timed_out");
  assert.equal(timedOutReject?.terminalOutcomeDeltaFromPassiveBarrierMs, 8_000);

  const noRejectObservedAtMs = passiveLaneBarrierCompletedAtMs - 200;
  const notApplicable = buildLocalV2DagLambdaLaneTimingSummary({
    coordinatorStartedAtMs,
    generatedAtMs: coordinatorStartedAtMs + 5_050,
    passiveLaneBarrierCompletedAtMs,
    passiveWorkerResults: [
      result("consent_proof", 4_800),
      result("runtime_evidence", 5_000),
      result("policy_evidence", 3_000),
    ],
    postRefusal: {
      dispatchStartedAtMs: coordinatorStartedAtMs + 500,
      join: "not_applicable",
      outcomeObservedAtMs: noRejectObservedAtMs,
      result: result("reject_observation", 1_500),
    },
  });
  const notApplicableReject = notApplicable.lanes.find((lane) => lane.lane === "reject_observation");
  assert.equal(notApplicable.rejectLaneJoin, "not_applicable");
  assert.equal(notApplicable.rejectTailDeltaMs, -200);
  assert.equal(notApplicable.rejectLaneAddedWaitMs, 0);
  assert.equal(notApplicable.rejectCompletedBeforeOrAtPassiveBarrier, true);
  assert.equal(notApplicableReject?.outcome, "not_applicable");
  assert.equal(notApplicableReject?.evidenceJoined, false);
  assert.equal(notApplicableReject?.terminalOutcomeDeltaFromPassiveBarrierMs, -200);

  const terminal = buildLocalV2DagLambdaResultMessage({
    completedAt: new Date(coordinatorStartedAtMs + 6_250),
    laneTimingSummary: summary,
    payload: parseLocalV2DagLambdaDispatchPayload(validPayload()),
    status: "completed",
  });
  const parsedTerminal = parseLocalV2DagLambdaResultMessage(JSON.stringify(terminal), {
    expectedTargetEnvironment: "local",
  });
  assert.equal(parsedTerminal.laneTimingSummary?.rejectTailDeltaMs, 1_200);
  assert.equal(parsedTerminal.laneTimingSummary?.lanes.length, 4);
});

test("five-lane timing retains independent Accept telemetry without changing Reject telemetry", () => {
  const coordinatorStartedAtMs = Date.parse("2026-09-01T20:00:00.000Z");
  const passiveLaneBarrierCompletedAtMs = coordinatorStartedAtMs + 5_000;
  const result = (
    workerLane: "consent_proof" | "runtime_evidence" | "policy_evidence" | "reject_observation" | "accept_observation",
    responseOffsetMs: number,
  ) => ({
    completedAt: new Date(coordinatorStartedAtMs + responseOffsetMs - 25).toISOString(),
    coordinatorTiming: {
      durationMs: responseOffsetMs,
      invocationStartedAt: new Date(coordinatorStartedAtMs).toISOString(),
      responseReceivedAt: new Date(coordinatorStartedAtMs + responseOffsetMs).toISOString(),
    },
    scanId: "scan-five-lane-timing",
    status: "completed" as const,
    workerLane,
  });
  const summary = buildLocalV2DagLambdaLaneTimingSummary({
    coordinatorStartedAtMs,
    generatedAtMs: coordinatorStartedAtMs + 6_100,
    passiveLaneBarrierCompletedAtMs,
    passiveWorkerResults: [
      result("consent_proof", 4_500),
      result("runtime_evidence", 5_000),
      result("policy_evidence", 3_500),
    ],
    postAccept: {
      dispatchStartedAtMs: coordinatorStartedAtMs + 1_000,
      join: "joined",
      result: result("accept_observation", 5_900),
    },
    postRefusal: {
      dispatchStartedAtMs: coordinatorStartedAtMs + 500,
      join: "joined",
      result: result("reject_observation", 4_100),
    },
  });

  assert.equal(summary.lanes.length, 5);
  assert.equal(summary.acceptLaneJoin, "joined");
  assert.equal(summary.maxAcceptTailWaitMs, 6_000);
  assert.equal(summary.acceptLaneAddedWaitMs, 900);
  assert.equal(summary.acceptTailDeltaMs, 900);
  assert.equal(summary.rejectLaneJoin, "joined");
  assert.equal(summary.maxRejectTailWaitMs, 8_000);
  assert.equal(summary.rejectLaneAddedWaitMs, 0);
  assert.equal(summary.rejectTailDeltaMs, -900);
  assert.deepEqual(summary.lanes.map((lane) => lane.lane), [
    "consent_proof",
    "runtime_evidence",
    "policy_evidence",
    "reject_observation",
    "accept_observation",
  ]);

  const terminal = buildLocalV2DagLambdaResultMessage({
    completedAt: new Date(coordinatorStartedAtMs + 6_100),
    laneTimingSummary: summary,
    payload: parseLocalV2DagLambdaDispatchPayload(validPayload()),
    status: "completed",
  });
  const parsed = parseLocalV2DagLambdaResultMessage(JSON.stringify(terminal), {
    expectedTargetEnvironment: "local",
  });
  assert.equal(parsed.laneTimingSummary?.lanes.length, 5);
  assert.equal(parsed.laneTimingSummary?.acceptTailDeltaMs, 900);
  assert.equal(parsed.laneTimingSummary?.rejectTailDeltaMs, -900);
});

test("reject worker retains a neutral unsupported packet for the coordinator without publishing independently", async () => {
  const priorFlag = process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  const outDir = await mkdtemp(path.join(os.tmpdir(), "certscore-reject-worker-"));
  const puts: PutObjectCommand[] = [];
  process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-artifact-bucket";
  try {
    const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({
      orchestrationMode: "worker",
      parentDispatchSha256: "c".repeat(64),
      targetEnvironment: "production",
      targetUrl: "https://ergoveritas.com/.well-known/certscore-canary/post-refusal/reject-honored.html",
      workerLane: "reject_observation",
      postRefusalObservation: {
        enabled: true,
        dispatchDelayMs: 0,
        observationWindowMs: 8_000,
        confirmationTimeoutMs: 1_500,
        actionSearchTimeoutMs: 1_500,
        resolver: {
          kind: "named_cmp",
          cmpCanonicalName: "Unknown CMP",
          confirmation: { kind: "tcf_purposes_denied", purposeIds: [1] },
        },
        interactionAuthorization: {
          kind: "owned_canary",
          authorizationId: "ergoveritas_owned_post_refusal_canary.v1",
        },
      },
    }));
    const result = await runLocalV2DagLambdaPostRefusalArtifactChain(payload, {
      artifactRoot: outDir,
      s3Client: { async send(command) { puts.push(command as PutObjectCommand); return {}; } },
    });

    assert.equal(puts.length, 1);
    assert.equal(result.postRefusalEvidence?.status, "unsupported");
    assert.equal(result.postRefusalEvidence?.refusalExercised, false);
    assert.equal(result.postRefusalEvidence?.observationCount, 0);
    assert.match(result.artifactPointers?.postRefusalPacketUri ?? "", /PostRefusalEvidencePacket\.json$/);
  } finally {
    if (priorFlag === undefined) delete process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
    else process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
    await rm(outDir, { recursive: true, force: true });
  }
});

test("Accept worker retains a neutral unsupported packet and never enables production projection", async () => {
  const priorFlag = process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  const outDir = await mkdtemp(path.join(os.tmpdir(), "certscore-accept-worker-"));
  const puts: PutObjectCommand[] = [];
  process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-artifact-bucket";
  try {
    const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({
      orchestrationMode: "worker",
      parentDispatchSha256: "e".repeat(64),
      targetEnvironment: "production",
      targetUrl: "https://ergoveritas.com/.well-known/certscore-canary/post-accept/accept-honored.html",
      workerLane: "accept_observation",
      postAcceptObservation: {
        enabled: true,
        dispatchDelayMs: 0,
        observationWindowMs: 8_000,
        confirmationTimeoutMs: 1_500,
        actionSearchTimeoutMs: 1_500,
        resolver: {
          kind: "named_cmp",
          cmpCanonicalName: "Unknown CMP",
          confirmation: {
            kind: "local_storage_equals",
            key: "consent",
            expectedValue: "granted",
          },
        },
        interactionAuthorization: {
          kind: "owned_canary",
          authorizationId: "ergoveritas_owned_post_refusal_canary.v1",
        },
      },
    }));
    const result = await runLocalV2DagLambdaPostAcceptArtifactChain(payload, {
      artifactRoot: outDir,
      s3Client: { async send(command) { puts.push(command as PutObjectCommand); return {}; } },
    });

    assert.equal(puts.length, 1);
    assert.equal(result.postAcceptEvidence?.status, "unsupported");
    assert.equal(result.postAcceptEvidence?.acceptanceExercised, false);
    assert.equal(result.postAcceptEvidence?.productionFindingIntegration, false);
    assert.match(result.artifactPointers?.postAcceptPacketUri ?? "", /PostAcceptEvidencePacket\.json$/);
  } finally {
    if (priorFlag === undefined) delete process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];
    else process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
    await rm(outDir, { recursive: true, force: true });
  }
});

test("Accept worker completes a non-CMP click/capture without treating banner dismissal as verified consent", async () => {
  const priorFlag = process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  const outDir = await mkdtemp(path.join(os.tmpdir(), "certscore-accept-canonical-non-cmp-"));
  const puts: PutObjectCommand[] = [];
  let acceptActions = 0;
  const server = createHttpServer((request, response) => {
    if (request.url === "/accept-action") {
      acceptActions += 1;
      response.writeHead(204).end();
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("set-cookie", "=private-unnamed-cookie; Path=/; SameSite=Lax");
    response.end(`<!doctype html><html><body>
      <section id="privacy-consent" role="dialog" aria-label="Cookie consent choices">
        <p>Choose whether this site may use analytics and advertising cookies.</p>
        <button class="choice">Reject all</button>
        <button class="choice">Manage choices</button>
        <button class="choice accept-choice">Accept all</button>
      </section>
      <script>
        localStorage.setItem('', 'private-unnamed-key');
        document.querySelector('.accept-choice').addEventListener('click', () => {
          fetch('/accept-action', { method: 'POST' });
          document.querySelector('#privacy-consent').hidden = true;
        });
      </script>
    </body></html>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const targetUrl = `http://127.0.0.1:${address.port}/`;
  process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-artifact-bucket";
  try {
    const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({
      orchestrationMode: "worker",
      parentDispatchSha256: "f".repeat(64),
      targetEnvironment: "local",
      targetUrl,
      workerLane: "accept_observation",
      postAcceptObservation: {
        enabled: true,
        rolloutMode: "all_eligible",
        dispatchDelayMs: 0,
        observationWindowMs: 50,
        confirmationTimeoutMs: 500,
        actionSearchTimeoutMs: 2_000,
        resolver: {
          kind: "canonical_cmp_registry",
          recipeSetId: "canonical-consent-control-accept-v3",
        },
        interactionAuthorization: {
          authorizationId: "loopback_local_lab",
          kind: "loopback",
        },
      },
    }));
    const result = await runLocalV2DagLambdaPostAcceptArtifactChain(payload, {
      artifactRoot: outDir,
      s3Client: { async send(command) { puts.push(command as PutObjectCommand); return {}; } },
    });

    const retainedPacket = postAcceptEvidencePacketSchema.parse(JSON.parse(
      await readFile(path.join(outDir, "PostAcceptEvidencePacket.json"), "utf8"),
    ));
    assert.equal(acceptActions, 1, JSON.stringify(retainedPacket));
    assert.equal(puts.length, 1);
    const uploadedBody = Buffer.from(puts[0]!.input.Body as Uint8Array);
    const metadata = result.artifactMetadata?.postAcceptPacketUri;
    assert.equal(metadata?.sha256, createHash("sha256").update(uploadedBody).digest("hex"));
    assert.equal(metadata?.sizeBytes, uploadedBody.byteLength);
    const uploadedPacket = postAcceptEvidencePacketSchema.parse(JSON.parse(uploadedBody.toString("utf8")));
    assert.deepEqual(uploadedPacket, retainedPacket, "Shared validation must not discard evidence during handoff");
    const projection = projectPostAcceptEvidenceForReport({ packet: uploadedPacket, packetSha256: metadata!.sha256 });
    const unnamed = projection.afterActionStorage!.filter((item) => item.name === "");
    assert.deepEqual(unnamed.map((item) => item.storageType).sort(), ["cookie", "local_storage"]);
    assert.equal(new Set(unnamed.map((item) => item.identityHash)).size, 2);
    assert.equal(projection.packetSha256, metadata!.sha256);
    assert.equal(projection.registrationStatus, "unconfirmed");
    assert.equal(uploadedBody.includes("private-unnamed"), false);
    assert.equal(result.postAcceptEvidence?.status, "unconfirmed");
    assert.equal(result.postAcceptEvidence?.acceptanceExercised, false);
    assert.equal(result.postAcceptEvidence?.productionFindingIntegration, false);
    assert.equal(retainedPacket.afterActionCapture?.activationStatus, "completed");
    assert.equal(retainedPacket.afterActionCapture?.stopReason, "window_elapsed");
  } finally {
    if (priorFlag === undefined) delete process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];
    else process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    );
    await rm(outDir, { recursive: true, force: true });
  }
});

test("reject worker accepts an exact public calibration allowlist and remains neutral when the CMP is unsupported", async () => {
  const priorFlag = process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  const outDir = await mkdtemp(path.join(os.tmpdir(), "certscore-reject-public-calibration-"));
  const puts: PutObjectCommand[] = [];
  process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-artifact-bucket";
  try {
    const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({
      orchestrationMode: "worker",
      parentDispatchSha256: "d".repeat(64),
      targetEnvironment: "local",
      targetUrl: "https://www.orange.es/",
      workerLane: "reject_observation",
      postRefusalObservation: {
        enabled: true,
        dispatchDelayMs: 0,
        observationWindowMs: 8_000,
        confirmationTimeoutMs: 1_500,
        actionSearchTimeoutMs: 10_000,
        resolver: {
          kind: "named_cmp",
          cmpCanonicalName: "Unknown CMP",
          confirmation: { kind: "tcf_purposes_denied", purposeIds: [1] },
        },
        interactionAuthorization: {
          authorizationId: "calibration-orange-es",
          kind: "explicit_allowlist",
          targets: [{ hostname: "www.orange.es", pathPrefix: "/" }],
        },
      },
    }));
    const result = await runLocalV2DagLambdaPostRefusalArtifactChain(payload, {
      artifactRoot: outDir,
      s3Client: { async send(command) { puts.push(command as PutObjectCommand); return {}; } },
    });

    assert.equal(puts.length, 1);
    assert.equal(result.postRefusalEvidence?.status, "unsupported");
  } finally {
    if (priorFlag === undefined) delete process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
    else process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
    await rm(outDir, { recursive: true, force: true });
  }
});

test("lane instrumentation retains the first top-level response and distinguishes physical invocations", () => {
  const bundle = canonicalBundleFixture("scan-lanes", {
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "completed",
      startedAt: "2026-06-15T18:00:00.010Z",
      completedAt: "2026-06-15T18:00:01.000Z",
      durationMs: 990,
      recoveryDiagnostics: {
        attempted: false,
        attemptCount: 0,
        modes: [],
        durationMs: 0,
        attempts: [{
          url: "https://example.com/?token=secret",
          mode: "initial_navigation",
          outcome: "success",
          httpStatus: 200,
          durationMs: 40,
        }],
      },
      evidenceRefs: [],
      errors: [],
    }],
    networkEvents: [{
      eventId: "net-1",
      eventType: "network_request",
      requestId: "request-1",
      timestampMs: 20,
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: "https://example.com/?token=secret",
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
      resourceType: "document",
      requestUrl: "https://example.com/?token=secret",
      isMainFrame: true,
      queryParamNames: ["token"],
      identifierParamNames: [],
      advertisingClickIdParamNames: [],
      tagContainerParamNames: [],
      hasIdentifierLikeParameters: false,
      hasAdvertisingClickIdParameters: false,
      hasTagContainerParameters: false,
      redirectChainRequestIds: [],
      cookieHeaderPresent: false,
      cookieNamesSent: [],
      authorizationHeaderPresent: false,
      collectionEndpointObserved: false,
    }] as CanonicalEvidenceBundle["networkEvents"],
    networkResponseEvents: [{
      eventId: "response-1",
      eventType: "network_response",
      requestId: "request-1",
      timestampMs: 35,
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: "https://example.com/?token=secret",
      responseUrl: "https://example.com/?token=secret",
      status: 200,
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
      setCookieHeaders: [],
      setCookieMetadata: [],
      cookieNamesSet: [],
      cacheHeaders: {},
      accessControlHeaders: {},
    }] as CanonicalEvidenceBundle["networkResponseEvents"],
  });

  const consent = buildLocalV2DagLambdaLaneRun({
    bundle,
    physicalInvocationId: "aws-request-consent",
    region: "eu-west-1",
    workerLane: "consent_proof",
  });
  const runtime = buildLocalV2DagLambdaLaneRun({
    bundle,
    physicalInvocationId: "aws-request-runtime",
    region: "eu-west-1",
    workerLane: "runtime_evidence",
  });

  assert.equal(consent?.firstHttpStatus, 200);
  assert.equal(consent?.firstResponseOffsetMs, 35);
  assert.equal(consent?.navigationCount, 1);
  assert.deepEqual(consent?.navigationAttempts, [{
    sequence: 1,
    mode: "initial_navigation",
    outcome: "success",
    httpStatus: 200,
    durationMs: 40,
    effectiveUrl: "https://example.com/",
  }]);
  assert.equal(consent?.accessOutcome, "representative_page");
  assert.equal(consent?.firstEffectiveUrl?.includes("secret"), false);
  assert.notEqual(consent?.physicalInvocationId, runtime?.physicalInvocationId);
});

test("lane instrumentation retains representative navigation when the initial request event is unavailable", () => {
  const bundle = canonicalBundleFixture("scan-navigation-fallback", {
    domSnapshots: [{
      url: "https://www.amazon.de/?token=secret",
    } as CanonicalEvidenceBundle["domSnapshots"][number]],
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "completed",
      startedAt: "2026-06-15T18:00:00.010Z",
      completedAt: "2026-06-15T18:00:01.000Z",
      durationMs: 990,
      recoveryDiagnostics: {
        attempted: false,
        attemptCount: 0,
        modes: [],
        durationMs: 0,
        attempts: [{
          url: "https://amazon.de/",
          mode: "initial_https_navigation",
          outcome: "success",
          httpStatus: 200,
          durationMs: 800,
        }],
      },
      evidenceRefs: [],
      errors: [],
    }],
    normalizedUrl: "https://amazon.de/",
    runtimeCoverage: {
      coverageStatus: "usable",
      limitationKeys: [],
      fallbackModesUsed: [],
      observationCounts: {
        networkEvents: 1,
        thirdPartyRequests: 0,
        cookieEvents: 0,
        cookiesBeforeConsent: 0,
        normalizedVendors: 0,
        observedJourneys: 0,
      },
      silentEmpty: false,
      notes: [],
    },
    url: "https://amazon.de/",
  });

  const lane = buildLocalV2DagLambdaLaneRun({
    bundle,
    physicalInvocationId: "aws-request-runtime",
    region: "eu-west-1",
    workerLane: "runtime_evidence",
  });

  assert.equal(lane?.firstHttpStatus, 200);
  assert.equal(lane?.firstResponseAt, null);
  assert.equal(lane?.firstResponseOffsetMs, null);
  assert.equal(lane?.firstEffectiveUrl, "https://www.amazon.de/");
  assert.equal(lane?.accessOutcome, "representative_page");
});

test("policy access uses terminal evidence, never the initial redirect or successful subpages", () => {
  for (const terminalAccess of ["access_denied", "representative_page", "unknown", "bot_challenge", undefined] as const) {
    const bundle = canonicalBundleFixture("policy-terminal", {
      modulesRun: [{ moduleName: "policySurfaceScanner", status: "completed",
        startedAt: "2026-06-15T18:00:00.000Z", evidenceRefs: [], errors: [],
        siteFacingNavigation: { requestedUrl: "https://example.com/", firstResponseAt: null, firstResponseOffsetMs: null,
          firstHttpStatus: 301, firstEffectiveUrl: "https://example.com/", navigationCount: 1,
          challengeDetected: false, challengeType: null,
          ...(terminalAccess ? { terminalAccess, terminalHttpStatus: terminalAccess === "access_denied" ? 403 : terminalAccess === "representative_page" ? 200 : null } : {}),
        },
      }],
    });
    const lane = buildLocalV2DagLambdaLaneRun({ bundle, workerLane: "policy_evidence", region: "us-west-1" });
    assert.equal(lane?.firstHttpStatus, 301);
    assert.equal(lane?.accessOutcome, terminalAccess ?? "unknown");
  }
});

test("incidental challenge traffic does not override this lane's corroborated substantive successful page", async () => {
  const { gpcIncidentalChallengeFixture } = await import("../../../packages/certscore-scan-core/src/test-fixtures/gpc-incidental-challenge.cases");
  for (const defect of ["none", "real_challenge", "blocking_frame", "blocked_status", "malformed_status", "missing_text", "missing_proof", "empty_capture", "wrong_origin", "unsettled", "failed", "policy_lane", "explicit_navigation_challenge", "terminal_denial"] as const) {
    const bundle = gpcIncidentalChallengeFixture();
    const signals = bundle.scanNoGoAssessment!.supportingSignals;
    if (defect === "real_challenge") bundle.scanNoGoAssessment!.decision = "no_go";
    if (defect === "blocking_frame") signals.blockingFrameChallengeObserved = true;
    if (defect === "blocked_status") signals.mainDocumentStatus = 403;
    if (defect === "malformed_status") signals.mainDocumentStatus = "200";
    if (defect === "missing_text") signals.substantiveRetainedDomVolumeObserved = false;
    if (defect === "missing_proof") delete signals.visualHardNoGoPageState;
    if (defect === "empty_capture") bundle.runtimeCoverage!.coverageStatus = "limited_none";
    if (defect === "wrong_origin") signals.expectedOriginReached = false;
    if (defect === "unsettled") signals.successfulSettledMainDocument = false;
    if (defect === "failed") bundle.modulesRun[0]!.status = "failed";
    if (defect === "policy_lane") bundle.modulesRun[0]!.moduleName = "policySurfaceScanner";
    if (defect === "explicit_navigation_challenge") bundle.modulesRun[0]!.siteFacingNavigation = {
      requestedUrl: bundle.url, firstResponseAt: null, firstResponseOffsetMs: null, firstHttpStatus: 200,
      firstEffectiveUrl: bundle.url, navigationCount: 1, challengeDetected: true, challengeType: "captcha_or_challenge",
    };
    if (defect === "terminal_denial") bundle.modulesRun[0]!.siteFacingNavigation = {
      requestedUrl: bundle.url, firstResponseAt: null, firstResponseOffsetMs: null, firstHttpStatus: 200,
      firstEffectiveUrl: bundle.url, navigationCount: 1, challengeDetected: false, challengeType: null,
      terminalAccess: "access_denied", terminalHttpStatus: 403,
    };
    const original = structuredClone(bundle.scanNoGoAssessment);
    const lane = buildLocalV2DagLambdaLaneRun({ bundle, workerLane: defect === "policy_lane" ? "policy_evidence" : "gpc_observation", region: "local" })!;
    assert.equal(lane.challengeDetected, !["none", "terminal_denial"].includes(defect), defect);
    assert.equal(lane.accessOutcome, defect === "none" ? "representative_page" : defect === "terminal_denial" ? "access_denied" : "bot_challenge", defect);
    assert.deepEqual(bundle.scanNoGoAssessment, original, "retain the observed security traffic and diagnostic limitations");
  }
});

test("technical browser success remains a bot-challenge access outcome", () => {
  const bundle = canonicalBundleFixture("scan-challenge", {
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "completed",
      startedAt: "2026-06-15T18:00:00.000Z",
      completedAt: "2026-06-15T18:00:00.500Z",
      durationMs: 500,
      evidenceRefs: [],
      errors: [],
    }],
    scanNoGoAssessment: {
      status: "available",
      version: "scan-no-go-assessment-v1",
      decision: "no_go",
      scanNoGoConfidence: 0.98,
      reasonCodes: ["captcha_or_challenge", "scan_no_go_corroborated"],
      corroboratorCodes: ["network_security_challenge_request_observed"],
      contradictorCodes: [],
      supportingSignals: { challengeSignalsDetected: true },
    } as CanonicalEvidenceBundle["scanNoGoAssessment"],
  });

  const lane = buildLocalV2DagLambdaLaneRun({
    bundle,
    physicalInvocationId: "aws-request-challenge",
    region: "us-west-1",
    workerLane: "runtime_evidence",
  });

  assert.equal(lane?.executionOutcome, "success");
  assert.equal(lane?.challengeDetected, true);
  assert.equal(lane?.accessOutcome, "bot_challenge");
});

test("evidence workers start concurrently and retain the parent scan identity", async () => {
  const seenPayloads: Array<Record<string, unknown>> = [];
  let activeInvocations = 0;
  let maximumConcurrentInvocations = 0;
  const parentPayload = parseLocalV2DagLambdaDispatchPayload(validPayload({ orchestrationMode: "sharded" }));

  const results = await invokeLocalV2DagLambdaWorkers({
    parentPayload,
    parentScanId: parentPayload.scanId,
    workerLanes: LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES,
    lambdaClient: {
      async send(command) {
        const workerPayload = JSON.parse(Buffer.from(command.input.Payload ?? []).toString("utf8")) as Record<string, unknown>;
        seenPayloads.push(workerPayload);
        activeInvocations += 1;
        maximumConcurrentInvocations = Math.max(maximumConcurrentInvocations, activeInvocations);
        await new Promise<void>((resolve) => setImmediate(resolve));
        activeInvocations -= 1;
        return {
          StatusCode: 200,
          Payload: Buffer.from(JSON.stringify({
            artifactPointers: {
              scanArtifactUri: `s3://test-bucket/v2/${String(workerPayload.workerLane)}/CanonicalEvidenceBundle.json`,
            },
            scanId: workerPayload.scanId,
            status: "completed",
            workerLane: workerPayload.workerLane,
          })),
        };
      },
    },
  });

  assert.equal(maximumConcurrentInvocations, 3);
  assert.deepEqual(seenPayloads.map((payload) => payload.workerLane), LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_LANES);
  assert.equal(seenPayloads.every((payload) => payload.scanId === parentPayload.scanId), true);
  assert.equal(results.every((result) => result.scanId === parentPayload.scanId), true);
});

test("the default artifact chain preserves at least the full terminal publication reserve", () => {
  assert.equal(LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS, 30_000);
  assert.ok(
    LOCAL_V2_DAG_LAMBDA_DEFAULT_SCANNER_WORK_TIMEOUT_MS <
      LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS,
  );
  assert.ok(
    LOCAL_V2_DAG_LAMBDA_DEFAULT_ARTIFACT_CHAIN_TIMEOUT_MS <=
      LOCAL_V2_DAG_LAMBDA_DEFAULT_HANDLER_SAFETY_TIMEOUT_MS -
        LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS,
  );
});

test("sharded coordinator safety deadline stays below the 75-second Lambda cutoff", () => {
  assert.equal(LOCAL_V2_DAG_LAMBDA_SHARDED_HANDLER_SAFETY_TIMEOUT_MS, 65_000);
  assert.ok(LOCAL_V2_DAG_LAMBDA_SHARDED_HANDLER_SAFETY_TIMEOUT_MS < 75_000);
  assert.ok(
    LOCAL_V2_DAG_LAMBDA_SHARDED_HANDLER_SAFETY_TIMEOUT_MS -
      LOCAL_V2_DAG_LAMBDA_DEFAULT_RESULT_PUBLISH_TIMEOUT_MS >= 5_000,
  );
});

test("dedicated evidence workers preserve the standard profile module budget", async () => {
  let allowRuntimeEvidenceFinalizationAfterAbort: boolean | undefined;
  let preConsentModuleDeadlineMs: number | undefined;
  let physicalInvocationId: string | undefined;
  const result = await handler(validPayload({
    orchestrationMode: "worker",
    profile: "standard",
    workerLane: "runtime_evidence",
  }), {
    awsRequestId: "aws-request-runtime-worker",
    runArtifactChain: async (_payload, options) => {
      allowRuntimeEvidenceFinalizationAfterAbort = options.allowRuntimeEvidenceFinalizationAfterAbort;
      preConsentModuleDeadlineMs = options.preConsentModuleDeadlineMs;
      physicalInvocationId = options.physicalInvocationId;
      return {
        artifactMetadata: {},
        artifactPointers: {},
        phaseTimings: [],
      };
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(allowRuntimeEvidenceFinalizationAfterAbort, true);
  assert.equal(
    preConsentModuleDeadlineMs,
    LOCAL_V2_DAG_LAMBDA_EVIDENCE_WORKER_SCANNER_WORK_TIMEOUT_MS -
      LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS,
  );
  assert.equal(preConsentModuleDeadlineMs, 35_000);
  assert.equal(physicalInvocationId, "aws-request-runtime-worker");
});

test("consent-proof workers reserve a bounded visual recovery window", async () => {
  let allowRuntimeEvidenceFinalizationAfterAbort: boolean | undefined;
  let preConsentModuleDeadlineMs: number | undefined;
  let preConsentVisualFallbackDeadlineMs: number | undefined;
  const result = await handler(validPayload({
    orchestrationMode: "worker",
    profile: "standard",
    workerLane: "consent_proof",
  }), {
    runArtifactChain: async (_payload, options) => {
      allowRuntimeEvidenceFinalizationAfterAbort = options.allowRuntimeEvidenceFinalizationAfterAbort;
      preConsentModuleDeadlineMs = options.preConsentModuleDeadlineMs;
      preConsentVisualFallbackDeadlineMs = options.preConsentVisualFallbackDeadlineMs;
      return {
        artifactMetadata: {},
        artifactPointers: {},
        phaseTimings: [],
      };
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(allowRuntimeEvidenceFinalizationAfterAbort, false);
  assert.equal(preConsentModuleDeadlineMs, 35_000);
  assert.equal(
    preConsentModuleDeadlineMs,
    LOCAL_V2_DAG_LAMBDA_CONSENT_PROOF_SCANNER_WORK_TIMEOUT_MS -
      LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS -
      4_000 -
      6_000,
  );
  assert.equal(preConsentVisualFallbackDeadlineMs, 6_000);
});

test("early policy handoff packet is typed, hash-bound, and non-projectable", () => {
  const packet = buildVerifiedPolicyEvidencePacket({
    payload: parseLocalV2DagLambdaDispatchPayload(validPayload()),
    result: {
      artifactRefs: [],
      moduleRun: {
        moduleName: "policySurfaceScanner",
        status: "completed",
        startedAt: "2026-07-31T20:00:00.000Z",
        completedAt: "2026-07-31T20:00:03.000Z",
        durationMs: 3_000,
        timingBreakdown: Array.from({ length: 45 }, (_, index) => ({
          label: `policy timing ${index + 1}`,
          durationMs: index + 1,
        })),
      },
      policySurfaceObservations: [{
        observationId: "privacy-policy-1",
        cmpDiscovery: [{
          contractVersion: "cmp_policy_discovery.v1",
          source: "cmp_config", cmpProvider: "Didomi",
          sourcePageUrl: "https://example.com/",
          sourceLocator: "window.didomiConfig.app.privacyPolicyURL",
        }],
        surfaceType: "privacy_policy",
        url: "https://example.com/privacy",
        normalizedUrl: "https://example.com/privacy",
        status: "fetched",
        documentFetchState: "fetched",
        documentEvaluationState: "usable",
        documentRole: "policy_document",
        documentFormat: "html",
        targetRelationship: "target_controller",
        contentCoverage: {
          status: "complete",
          sourceTextChars: 72,
          extractedSectionCount: 1,
          retainedSectionCount: 1,
          retainedStrongSectionCount: 1,
          retainedTableRowCount: 0,
          limitationKeys: [],
        },
        observedTopics: ["processing_purposes"],
        policyCookieDisclosures: [],
        mentionedRights: [],
        textExcerpt: "We process personal information to provide the services you request.",
        confidence: 0.98,
        artifactRefs: [],
      }],
    },
  });
  const { sourceHash, ...unsigned } = packet;

  assert.equal(packet.policySurfaceObservations[0]?.cmpDiscovery?.[0]?.cmpProvider, "Didomi");
  const withoutProvenance = packet.policySurfaceObservations.map(({ cmpDiscovery: _provenance, ...row }) => row);
  assert.notEqual(packet.policyContentHash, createHash("sha256").update(JSON.stringify(withoutProvenance)).digest("hex"));
  assert.equal(packet.artifactOnly, true);
  assert.equal(packet.productionFindingIntegration, false);
  assert.equal(packet.policySurfaceInspection.privacyPolicyObserved, true);
  assert.equal(packet.moduleRun.timingBreakdown?.length, 40);
  assert.equal(packet.moduleRun.timingBreakdown?.[39]?.label, "timing entries truncated");
  assert.equal(
    sourceHash,
    createHash("sha256").update(JSON.stringify(unsigned)).digest("hex"),
  );
});

test("early runtime preview packet retains bounded passive cookie and tracker observations without projecting findings", () => {
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload());
  const preview = buildPreConsentRuntimePreview(canonicalBundleFixture(payload.scanId, {
      cookieEvents: [cookieEventSchema.parse({
        eventId: "cookie-ga",
        eventType: "cookie",
        timestampMs: 1_200,
        sourceScanner: "pre_consent_runtime",
        scenario: "fresh_pre_consent",
        consentStateAtTime: "pre_consent",
        pagePhase: "network_idle",
        evidenceRefs: [],
        confidence: 0.98,
        directVsInferred: "direct",
        cookieName: "_ga",
        cookieDomain: ".example.com",
        cookieParty: "first_party",
        vendorAssociated: true,
        cookiePurpose: "analytics",
        cookieEssentiality: "non_essential",
        operation: "browser_snapshot",
        valueRedacted: true,
      })],
      networkEvents: [networkEventSchema.parse({
        eventId: "network-ga",
        eventType: "network_request",
        timestampMs: 1_300,
        sourceScanner: "pre_consent_runtime",
        scenario: "fresh_pre_consent",
        consentStateAtTime: "pre_consent",
        pagePhase: "network_idle",
        evidenceRefs: [],
        confidence: 0.97,
        directVsInferred: "direct",
        requestId: "request-ga",
        method: "GET",
        requestUrl: "https://www.google-analytics.com/g/collect?secret=redacted",
        requestHostname: "www.google-analytics.com",
        thirdParty: true,
        isThirdParty: true,
      })],
      normalizedVendorObservations: [normalizedVendorObservationSchema.parse({
        observationId: "vendor-google-analytics",
        entity: "Google",
        vendor: "Google",
        product: "Google Analytics",
        purpose: "analytics",
        confidence: 0.96,
        basis: ["canonical_vendor_registry"],
        matchedEvidenceIds: ["network-ga", "cookie-ga"],
        matchedHostnames: ["www.google-analytics.com"],
        matchedUrls: ["https://www.google-analytics.com/g/collect?secret=redacted"],
        matchedCookieNames: ["_ga"],
      })],
      runtimeCoverage: {
        coverageStatus: "usable",
        limitationKeys: [],
        fallbackModesUsed: [],
        observationCounts: {
          networkEvents: 1,
          thirdPartyRequests: 1,
          cookieEvents: 1,
          cookiesBeforeConsent: 1,
          normalizedVendors: 1,
          observedJourneys: 0,
        },
        silentEmpty: false,
        notes: [],
      },
    }));
  const packet = buildVerifiedPreConsentRuntimePreviewPacket({
    payload,
    preview,
  });
  const { sourceHash, ...unsigned } = packet;
  const serialized = JSON.stringify(packet);

  assert.equal(packet.artifactOnly, true);
  assert.equal(packet.productionFindingIntegration, false);
  assert.equal(packet.preview.final, false);
  assert.equal(packet.preview.mustContinuePolling, true);
  assert.deepEqual(packet.preview.summary, {
    cookieCount: 1,
    returnedCookieCount: 1,
    trackerCount: 1,
    trackingVendorCount: 1,
    returnedTrackingVendorCount: 1,
    operationalVendorCount: 0,
    returnedOperationalVendorCount: 0,
    thirdPartyRequestCount: 1,
    vendorCount: 1,
  });
  assert.deepEqual(packet.preview.cookies[0], {
    name: "_ga",
    domain: "example.com",
    party: "first_party",
    purpose: "analytics",
    essentiality: "non_essential",
    observedAtMs: 1_200,
  });
  assert.deepEqual(packet.preview.trackers[0], {
    vendor: "Google",
    product: "Google Analytics",
    purpose: "analytics",
    confidence: 0.96,
    domains: ["www.google-analytics.com"],
  });
  assert.equal(sourceHash, createHash("sha256").update(JSON.stringify(unsigned)).digest("hex"));
  assert.doesNotMatch(serialized, /secret=redacted/);
  assert.equal("findings" in packet.preview, false);
  assert.equal("score" in packet.preview, false);
});

test("early runtime preview publication writes one bounded S3 packet and one non-terminal SQS message", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  const puts: PutObjectCommand[] = [];
  const sends: SendMessageCommand[] = [];
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "runtime-preview-test-bucket";
  try {
    const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({
      orchestrationMode: "worker",
      workerLane: "runtime_evidence",
    }));
    const packet = buildVerifiedPreConsentRuntimePreviewPacket({
      payload,
      preview: buildPreConsentRuntimePreview(canonicalBundleFixture(payload.scanId)),
    });
    const message = await publishVerifiedPreConsentRuntimePreview({
      packet,
      payload,
      s3Client: {
        async send(command) {
          puts.push(command as PutObjectCommand);
          return {};
        },
      },
      sqsClient: {
        async send(command) {
          sends.push(command as SendMessageCommand);
          return {};
        },
      },
    });

    assert.equal(puts.length, 1);
    assert.equal(sends.length, 1);
    assert.match(String(puts[0]?.input.Key), /VerifiedPreConsentRuntimePreviewPacket\.json$/);
    assert.equal(message.messageKind, "runtime_preview_ready");
    assert.equal(message.productionFindingIntegration, false);
    assert.equal(message.sourceHash, packet.sourceHash);
    assert.deepEqual(JSON.parse(String(sends[0]?.input.MessageBody)), message);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("terminal result retains the verified early-policy pointer as an ordering fallback", () => {
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload());
  const policyEvidence = {
    artifactMetadata: { sha256: "a".repeat(64), sizeBytes: 123 },
    artifactOnly: true as const,
    artifactPointer: "s3://certscore-dev-artifacts/v2/scan-local-1/VerifiedPolicyEvidencePacket.json",
    contractVersion: "certscore.v2.lambda-policy-evidence-ready.v1" as const,
    generatedAt: "2026-07-31T20:00:03.000Z",
    messageKind: "policy_evidence_ready" as const,
    policyContentHash: "b".repeat(64),
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false as const,
    scanId: payload.scanId,
    sourceHash: "c".repeat(64),
    targetEnvironment: payload.targetEnvironment,
  };
  const result = buildLocalV2DagLambdaResultMessage({
    completedAt: new Date("2026-07-31T20:00:05.000Z"),
    payload,
    policyEvidence,
    status: "completed",
  });

  assert.deepEqual(result.policyEvidence, policyEvidence);
  assert.equal(result.policyEvidence?.productionFindingIntegration, false);
});

test("terminal result cryptographically binds enabled reject evidence to its parent dispatch", () => {
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({
    postRefusalObservation: {
      enabled: true,
      dispatchDelayMs: 500,
      resolver: {
        kind: "named_cmp",
        cmpCanonicalName: "OneTrust",
        confirmation: { kind: "tcf_purposes_denied", purposeIds: [1] },
      },
      interactionAuthorization: {
        kind: "owned_canary",
        authorizationId: "ergoveritas_owned_post_refusal_canary.v1",
      },
    },
  }));
  const result = buildLocalV2DagLambdaResultMessage({
    completedAt: new Date("2026-08-26T20:00:05.000Z"),
    payload,
    status: "completed",
  });
  const passiveResult = buildLocalV2DagLambdaResultMessage({
    completedAt: new Date("2026-08-26T20:00:05.000Z"),
    payload: parseLocalV2DagLambdaDispatchPayload(validPayload()),
    status: "completed",
  });

  assert.equal(result.parentDispatchSha256, postRefusalParentDispatchSha256(payload));
  assert.match(result.parentDispatchSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(passiveResult.parentDispatchSha256, undefined);
});

test("the single-barrier Reject Path join retains its packet digest on the terminal artifact set", () => {
  const joined = attachJoinedPostRefusalArtifactPointer({
    artifactMetadata: {
      scanArtifactUri: { sha256: "a".repeat(64), sizeBytes: 100 },
    },
    artifactPointers: {
      scanArtifactUri: "s3://test-bucket/scan/CanonicalEvidenceBundle.json",
    },
    phaseTimings: [],
  }, {
    artifactMetadata: {
      postRefusalPacketUri: { sha256: "b".repeat(64), sizeBytes: 50 },
    },
    artifactPointers: {
      postRefusalPacketUri: "s3://test-bucket/scan/reject/PostRefusalEvidencePacket.json",
    },
  });

  assert.equal(joined.artifactMetadata.postRefusalPacketUri?.sha256, "b".repeat(64));
  assert.match(joined.artifactPointers.postRefusalPacketUri ?? "", /PostRefusalEvidencePacket/);
});

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    artifactOnly: true,
    awsRegion: "eu-central-1",
    callbackCorrelationId: "scan-local-1",
    contractVersion: LOCAL_V2_DAG_LAMBDA_DISPATCH_CONTRACT_VERSION,
    functionName: "certscore-v2-dag-local",
    hostname: "example.com",
    localCallbackUrl: null,
    processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
    productionFindingIntegration: false,
    profile: "tiny",
    resultHandoff: "sqs",
    resultPurpose: "synthetic_verification",
    resultQueueUrl: "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-local-results",
    scanId: "scan-local-1",
    scannerRuntime: "certscore-v2-dag-parallel-path",
    targetEnvironment: "local",
    targetUrl: "https://example.com/",
    vpcMode: "none",
    ...overrides
  };
}

function coordinatorPostAcceptConfig(dispatchDelayMs: number) {
  return {
    enabled: true,
    dispatchDelayMs,
    observationWindowMs: 100,
    confirmationTimeoutMs: 100,
    actionSearchTimeoutMs: 100,
    resolver: {
      kind: "named_cmp" as const,
      cmpCanonicalName: "Fixture CMP",
      confirmation: {
        kind: "local_storage_equals" as const,
        key: "fixture-consent",
        expectedValue: "granted",
      },
    },
    interactionAuthorization: {
      kind: "loopback" as const,
      authorizationId: "loopback_local_lab",
    },
  };
}

function coordinatorPostRefusalConfig(dispatchDelayMs: number) {
  return {
    enabled: true,
    dispatchDelayMs,
    observationWindowMs: 100,
    confirmationTimeoutMs: 100,
    actionSearchTimeoutMs: 100,
    resolver: {
      kind: "named_cmp" as const,
      cmpCanonicalName: "Fixture CMP",
      confirmation: { kind: "tcf_purposes_denied" as const, purposeIds: [1] },
    },
    interactionAuthorization: {
      kind: "loopback" as const,
      authorizationId: "loopback_local_lab",
    },
  };
}

function coordinatorConsentBundle(
  scanId: string,
  options: {
    inspectionCompleted: boolean;
    acceptControlObserved?: boolean;
    limited?: boolean;
    rejectControlObserved?: boolean;
  },
) {
  const acceptControlObserved = options.acceptControlObserved === true;
  const rejectControlObserved = options.rejectControlObserved === true;
  const actionableControlObserved = acceptControlObserved || rejectControlObserved;
  return canonicalBundleFixture(scanId, {
    consentSurfaceInspection: {
      artifactVersion: "certscore.consent_surface_inspection.v1",
      coverageStatus: options.limited ? "limited" : "complete",
      outcome: options.limited
        ? "indeterminate_limited_coverage"
        : actionableControlObserved
          ? "actionable_surface_observed"
          : "no_surface_observed_complete_coverage",
      inspectedAt: "2026-09-10T00:00:00.000Z",
      inspectionCompleted: options.inspectionCompleted,
      inspectedPreInteraction: true,
      consentSurfaceObserved: actionableControlObserved,
      actionableControlObserved,
      observedAtMs: 100,
      evidenceSources: ["control_inventory"],
      limitationKeys: options.limited ? ["consent_session_access_limited"] : [],
      sourceObservationIds: actionableControlObserved ? ["fixture-consent-ui"] : [],
    },
    consentUiObservations: actionableControlObserved ? [{
      observationId: "fixture-consent-ui",
      url: "https://example.com/",
      observedAt: "2026-09-10T00:00:00.000Z",
      observedAtMs: 100,
      bannerDetected: true,
      confidence: 0.99,
      firstLayer: true,
      likelyPresent: true,
      basis: ["control_inventory"],
      acceptControlObserved,
      rejectControlObserved,
      optionsControlObserved: false,
      controls: [
        ...(acceptControlObserved ? [{
          controlId: "fixture-accept",
          actionType: "accept_all" as const,
          label: "Accept all",
          visible: true,
          classifierReasonCodes: [],
        }] : []),
        ...(rejectControlObserved ? [{
          controlId: "fixture-reject",
          actionType: "reject_all" as const,
          label: "Reject all",
          visible: true,
          classifierReasonCodes: [],
        }] : []),
      ],
      supportingArtifactIds: [],
    }] : [],
  });
}

function coordinatorPostAcceptPacket(scanId: string) {
  return postAcceptEvidencePacketSchema.parse({
    artifactVersion: "certscore.post_accept_evidence.v1",
    artifactOnly: true,
    productionProjectable: true,
    scanId: `${scanId}:accept_observation`,
    parentScanId: scanId,
    targetUrl: "https://example.com/",
    normalizedUrl: "https://example.com/",
    observationBranch: "accept_only",
    phase: "post_action",
    consentAction: "accept",
    startedAt: "2026-09-10T00:00:00.000Z",
    completedAt: "2026-09-10T00:00:02.000Z",
    resolver: {
      found: true,
      method: "cmp_registry_recipe",
      confidence: 1,
      recipeId: "canonical-cmp:fixture:accept:v1",
      cmpId: "fixture",
    },
    actionControlProof: {
      contractVersion: "certscore.consent_action_control_proof.v1",
      action: "accept",
      observedAtMs: 95,
      accessibleLabel: "Accept all",
      labelSource: "visible_text",
      actionSemantics: "direct_label",
      classifierIntent: "accept",
      classifierConfidence: 1,
      matchedLocale: "en",
      matchStrength: "direct",
      classifierReasonCodes: ["exact_accept_label"],
      cmpId: "fixture",
      recipeId: "canonical-cmp:fixture:accept:v1",
      selectorHint: "#accept-all",
      visible: true,
      enabled: true,
      uniquelyActionable: true,
    },
    acceptanceRegistration: {
      status: "confirmed",
      acceptanceExercised: true,
      actionDispatchedAtMs: 100,
      acceptanceRegisteredAtMs: 120,
      witnesses: [{
        witnessType: "cmp_storage_state",
        observedAtMs: 120,
        key: "fixture-consent",
        expectedState: "granted",
        observedStateHash: "a".repeat(64),
        corroboratingOnly: false,
      }],
    },
    observationWindowMs: 8_000,
    timing: {
      dispatchDelayMs: 0,
      navigationMs: 40,
      resolverMs: 10,
      confirmationMs: 20,
      observationMs: 100,
      totalMs: 170,
      readyAtMs: 170,
    },
    network: {
      requests: [],
      postAcceptNonEssentialRequests: [],
      activeRequestIdsAtAcceptanceRegistration: [],
    },
    storage: {
      preAction: [],
      postAction: [],
      writesAfterAccept: [],
      itemsCreatedOrChangedAfterAccept: [],
    },
    observations: [],
    cancellation: { requested: false, outcome: "not_requested" },
    limitations: [],
  });
}

function coordinatorPostRefusalPacket(scanId: string) {
  return postRefusalEvidencePacketSchema.parse({
    artifactVersion: "certscore.post_refusal_evidence.v1",
    artifactOnly: true,
    productionProjectable: true,
    scanId: `${scanId}:reject_observation`,
    parentScanId: scanId,
    targetUrl: "https://example.com/",
    normalizedUrl: "https://example.com/",
    observationBranch: "reject_only",
    phase: "post_action",
    consentAction: "reject",
    startedAt: "2026-09-10T00:00:00.000Z",
    completedAt: "2026-09-10T00:00:02.000Z",
    resolver: {
      found: true,
      method: "local_fixture_recipe",
      confidence: 1,
      recipeId: "fixture-direct-reject-v1",
      cmpId: "fixture",
    },
    actionControlProof: {
      contractVersion: "certscore.consent_action_control_proof.v1",
      action: "reject",
      observedAtMs: 95,
      accessibleLabel: "Reject all",
      labelSource: "visible_text",
      actionSemantics: "direct_label",
      classifierIntent: "reject",
      classifierConfidence: 1,
      matchedLocale: "en",
      matchStrength: "direct",
      classifierReasonCodes: ["exact_reject_label"],
      cmpId: "fixture",
      recipeId: "fixture-direct-reject-v1",
      selectorHint: "#reject-all",
      visible: true,
      enabled: true,
      uniquelyActionable: true,
    },
    refusalRegistration: {
      status: "confirmed",
      refusalExercised: true,
      actionDispatchedAtMs: 100,
      refusalRegisteredAtMs: 120,
      witnesses: [{
        witnessType: "cmp_storage_state",
        observedAtMs: 120,
        observedStateHash: "a".repeat(64),
        corroboratingOnly: false,
      }],
    },
    observationWindowMs: 8_000,
    timing: {
      dispatchDelayMs: 0,
      navigationMs: 40,
      resolverMs: 10,
      confirmationMs: 20,
      observationMs: 100,
      totalMs: 170,
      readyAtMs: 170,
    },
    network: {
      requests: [],
      postRefusalNonEssentialRequests: [],
      activeRequestIdsAtRefusalRegistration: [],
    },
    storage: {
      preActionCapturedAtMs: 95,
      postActionCapturedAtMs: 125,
      preAction: [],
      postAction: [],
      writesAfterRefusal: [],
      nonEssentialItemsPersistingAfterRefusal: [],
    },
    observations: [],
    cancellation: { requested: false, outcome: "not_requested" },
    limitations: [],
  });
}

async function runCoordinatorFixture(input: {
  scanId: string;
  consentBundle: CanonicalEvidenceBundle;
  action: "none" | "hang" | "late" | "completed" | "validation_failed" | "completed_during_finalization" | "completed_after_finalization";
  dispatchDelayMs: number;
  actionLane?: "accept" | "reject";
  gpcPair?: { baseline: CanonicalEvidenceBundle; gpc: CanonicalEvidenceBundle };
  preferences?: "complete" | "partial" | "hang" | "wrong_hash" | "wrong_target";
  explicitPreferences?: boolean;
  presenceOnly?: boolean;
  bothActions?: boolean;
  optOut?: "complete" | "hang" | "wrong_hash" | "wrong_target" | "redirected" | "policy_downgrade" | "bad_redirect";
  routeCase?: "valid" | "downgrade" | "bad_ancestry" | "wrong_parent" | "wrong_hash";
  invalidActionHash?: boolean;
  runtimeBundle?: CanonicalEvidenceBundle;
  onRead?: (key: string) => void;
  onActionAbort?: () => void;
}) {
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "certscore-coordinator-cutoff-"));
  const actionCalls: string[] = [];
  const workerCalls: string[] = [];
  const uploads: string[] = [];
  let finalizationStarted!: () => void;
  const finalizationRead = new Promise<void>(resolve => { finalizationStarted = resolve; });
  const passiveBundles = new Map<string, CanonicalEvidenceBundle>([
    ["consent_proof", input.consentBundle],
    ["runtime_evidence", canonicalBundleFixture(input.scanId, {
      domSnapshots: [runtimeSnapshotFixture()],
      scanLaneRuns: [laneRunFixture("runtime_evidence", "fixture-runtime")],
      runtimeCoverage: {
        coverageStatus: "usable",
        limitationKeys: [],
        fallbackModesUsed: [],
        notes: [],
        observationCounts: {
          networkEvents: 0,
          thirdPartyRequests: 0,
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          normalizedVendors: 0,
          observedJourneys: 0,
        },
        silentEmpty: false,
      },
    })],
    ["policy_evidence", canonicalBundleFixture(input.scanId, {
      scanLaneRuns: [laneRunFixture("policy_evidence", "fixture-policy")],
    })],
  ] as const);
  if (input.runtimeBundle) passiveBundles.set("runtime_evidence",input.runtimeBundle);
  if (input.gpcPair) {
    passiveBundles.set("runtime_evidence", input.gpcPair.baseline);
    passiveBundles.set("gpc_observation", input.gpcPair.gpc);
  }
  const routeOriginal=input.routeCase?"https://readcube.com/":undefined;
  const canaryCampaign=input.routeCase?saleSharingCanaryFixture():undefined;
  if(canaryCampaign)canaryCampaign.slots[1].scanId=input.scanId;
  const canaryAuthorization=canaryCampaign?.slots[1];
  if(routeOriginal)for(const [lane,bundle] of passiveBundles)passiveBundles.set(lane,JSON.parse(JSON.stringify(bundle).replaceAll("https://example.com/",routeOriginal)));
  const pointers = new Map<string, { uri: string; body: Buffer; sha256: string; sizeBytes: number }>();
  for (const [lane, bundle] of passiveBundles) {
    const body = Buffer.from(JSON.stringify(bundle));
    const key = `workers/${input.scanId}/${lane}/CanonicalEvidenceBundle.json`;
    const uri = `s3://test-bucket/${key}`;
    const metadata = { uri, body, sha256: createHash("sha256").update(body).digest("hex"), sizeBytes: body.byteLength };
    pointers.set(uri, metadata);
  }
  const actionLane = input.actionLane ?? "accept";
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({
    orchestrationMode: "sharded",
    scanId: input.scanId,
    callbackCorrelationId: input.scanId,
    ...(input.presenceOnly?{privacyCaptureProfile:PRESENCE_ONLY_CAPTURE_PROFILE}:{}),
    ...(input.bothActions?{postRefusalObservation:coordinatorPostRefusalConfig(500)}:{}),
    ...(routeOriginal?{targetUrl:routeOriginal,hostname:"readcube.com",awsRegion:"us-west-1",functionName:canaryAuthorization!.functionName}:{}),
    ...(input.optOut ? {saleSharingOptOut:routeOriginal?{policyVersion:SALE_SHARING_EXACT_ROUTE_POLICY,enabled:true,scanId:input.scanId,exactTargetUrl:routeOriginal,exactRouteAuthorization:saleSharingExactRouteAuthorization(routeOriginal),canaryAuthorization}:{policyVersion:["redirected","policy_downgrade","bad_redirect"].includes(input.optOut)?"bounded_sale_sharing_opt_out.v2-apex-www":"bounded_sale_sharing_opt_out.v1",enabled:true,scanId:input.scanId,exactTargetUrl:"https://example.com/",
      ...(["redirected","policy_downgrade","bad_redirect"].includes(input.optOut)?{redirectAuthorization:{version:"sale_sharing_apex_www.v1",alternateTargetUrl:"https://www.example.com/"}}:{})}}:{}),
    ...(input.explicitPreferences ? { cmpPreferenceInspection: {
      policyVersion: "bounded_cmp_preferences.v1", enabled: true,
      scanId: input.scanId, exactTargetUrl: "https://example.com/",
    } } : {}),
    ...(input.gpcPair ? { gpcObservation: { contractVersion: "certscore.gpc-observation-dispatch.v1", enabled: true, pairWithLane: "runtime_evidence", protocol: "passive_baseline_with_sec_gpc" } } : {}),
    ...(actionLane === "accept"
      ? { postAcceptObservation: coordinatorPostAcceptConfig(input.dispatchDelayMs) }
      : { postRefusalObservation: coordinatorPostRefusalConfig(input.dispatchDelayMs) }),
  }));
  const packet = ["completed", "completed_during_finalization", "completed_after_finalization"].includes(input.action)
    ? actionLane === "accept"
      ? coordinatorPostAcceptPacket(input.scanId)
      : coordinatorPostRefusalPacket(input.scanId)
    : undefined;
  if (packet) {
    const body = Buffer.from(JSON.stringify(packet));
    const packetFile = actionLane === "accept" ? "PostAcceptEvidencePacket.json" : "PostRefusalEvidencePacket.json";
    const uri = `s3://test-bucket/workers/${input.scanId}/${actionLane === "accept" ? "accept" : "reject"}_observation/${packetFile}`;
    pointers.set(uri, { uri, body, sha256: createHash("sha256").update(body).digest("hex"), sizeBytes: body.byteLength });
  }
  const lambdaClient = {
    async send(command: any, options?: { abortSignal?: AbortSignal }) {
      const workerPayload = JSON.parse(Buffer.from(command.input.Payload ?? []).toString("utf8")) as Record<string, any>;
      const lane = String(workerPayload.workerLane);
      workerCalls.push(lane);
      if(input.presenceOnly)assert.equal(workerPayload.privacyCaptureProfile,PRESENCE_ONLY_CAPTURE_PROFILE);
      if(input.bothActions && lane === "reject_observation") {actionCalls.push(lane);throw new Error("offline fixture: neutral Reject terminal failure");}
      if(input.bothActions && lane === "policy_evidence")await new Promise(resolve=>setTimeout(resolve,700));
      if(lane === "sale_sharing_opt_out") {
        if(input.optOut === "hang")return new Promise<never>((_resolve,reject)=>{options?.abortSignal?.addEventListener("abort",()=>reject(new Error("aborted")),{once:true});});
        const packet={contractVersion:"certscore.sale-sharing-opt-out-evidence.v1",policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:input.scanId,parentDispatchSha256:postRefusalParentDispatchSha256(payload),targetUrl:input.optOut === "wrong_target"?"https://other.example/":payload.targetUrl,documentToken:null,startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),status:"unsupported",recipeVersion:null,provider:null,actionCount:0,submitted:false,registration:"not_attempted",confirmedAt:null,before:null,after:null,observationWindowMs:0,captureComplete:false,truncated:false,requests:[],limitations:["no_unique_registered_recipe"]};
        if(input.optOut==="redirected"||input.optOut==="bad_redirect")Object.assign(packet,{contractVersion:"certscore.sale-sharing-opt-out-evidence.v2",policyVersion:"bounded_sale_sharing_opt_out.v2-apex-www",
          redirectAuthorization:{version:"sale_sharing_apex_www.v1",alternateTargetUrl:"https://www.example.com/"},actionTargetUrl:"https://www.example.com/",tlsValidated:true,
          redirectProof:{version:"sale_sharing_redirect_proof.v1",fromUrl:input.optOut==="bad_redirect"?"https://other.com/":"https://example.com/",toUrl:"https://www.example.com/",status:301,sourceRequestId:"first",targetRequestId:"second",tlsValidated:true}});
        if(routeOriginal&&input.routeCase!=="downgrade"){
          const fixture=exactRouteEvidenceFixture(routeOriginal);
          if(input.routeCase==="bad_ancestry")fixture.exactRouteProof!.hops[1]!.sourceRequestId="unrelated";
          Object.assign(packet,{contractVersion:fixture.contractVersion,policyVersion:fixture.policyVersion,exactRouteAuthorization:fixture.exactRouteAuthorization,exactRouteProof:fixture.exactRouteProof,actionTargetUrl:fixture.actionTargetUrl,tlsValidated:true});
          if(input.routeCase==="wrong_parent")packet.parentDispatchSha256="f".repeat(64);
        }
        const body=Buffer.from(JSON.stringify(packet)),uri=`s3://test-bucket/workers/${input.scanId}/sale_sharing_opt_out/SaleSharingOptOutEvidencePacket.json`;
        const entry={uri,body,sizeBytes:body.byteLength,sha256:createHash("sha256").update(body).digest("hex")};pointers.set(uri,entry);
        return {StatusCode:200,Payload:Buffer.from(JSON.stringify({scanId:input.scanId,workerLane:lane,status:"completed",parentDispatchSha256:postRefusalParentDispatchSha256(payload),artifactPointers:{saleSharingOptOutPacketUri:uri},artifactMetadata:{saleSharingOptOutPacketUri:{sizeBytes:entry.sizeBytes,sha256:input.optOut === "wrong_hash"||input.routeCase==="wrong_hash"?"0".repeat(64):entry.sha256}}}))};
      }
      if (lane === "cmp_preferences") {
        if (input.preferences === "hang") return new Promise<never>((_resolve, reject) => {
          options?.abortSignal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
        if (!input.preferences) throw new Error("unexpected preferences worker");
        const packet = {
          contractVersion: "certscore.cmp-preferences-evidence.v1", policyVersion: "bounded_cmp_preferences.v1",
          scanId: input.scanId, parentDispatchSha256: postRefusalParentDispatchSha256(payload),
          targetUrl: input.preferences === "wrong_target" ? "https://other.example/" : payload.targetUrl,
          finalUrl: payload.targetUrl, documentToken: "fixture-loader", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
          status: "limited", support: { state: "partial", provider: "Borlabs Cookie", recipeVersion: "borlabs_preferences.v1", reason: "bounded_visible_preference_inspection" },
          action: { count: 0, intent: "options", label: null, opened: false }, controls: [], controlInventoryComplete: false,
          privacyLinks: [], declarations: [], declarationInventoryComplete: false, limitations: [],
          ...(input.preferences === "partial" ? { privacyLinks: [{ url: "https://example.com/privacy", hitTargetBeforeAction: true }],
            checkpoints: { version: "cmp_partial_capture.v1", documentToken: "fixture-loader", privacyLinks: true, declarations: false, controls: false, controlsSurface: "first_layer" },
            limitations: ["preference_operation_timed_out"] } : {}),
        };
        const body = Buffer.from(JSON.stringify(packet));
        const uri = `s3://test-bucket/workers/${input.scanId}/cmp_preferences/CmpPreferencesEvidencePacket.json`;
        const entry = { uri, body, sizeBytes: body.byteLength, sha256: createHash("sha256").update(body).digest("hex") };
        pointers.set(uri, entry);
        return { StatusCode: 200, Payload: Buffer.from(JSON.stringify({ scanId: input.scanId, workerLane: lane, status: "completed",
          parentDispatchSha256: postRefusalParentDispatchSha256(payload), artifactPointers: { cmpPreferencesPacketUri: uri },
          artifactMetadata: { cmpPreferencesPacketUri: { sizeBytes: entry.sizeBytes, sha256: input.preferences === "wrong_hash" ? "0".repeat(64) : entry.sha256 } } })) };
      }
      const actionWorkerLane = actionLane === "accept" ? "accept_observation" : "reject_observation";
      if (lane === actionWorkerLane) {
        actionCalls.push(lane);
        if (input.action === "validation_failed") throw new Error("Evidence validation failed: [field].resolver.[field].[7].[field].[0] (too_big)");
        if (input.action === "hang") {
          return await new Promise<never>((_resolve, reject) => {
            options?.abortSignal?.addEventListener("abort", () => {
              input.onActionAbort?.();
              reject(options.abortSignal?.reason ?? new Error("aborted"));
            }, { once: true });
          });
        }
        if (input.action === "late") await new Promise((resolve) => setTimeout(resolve, 25));
        if (input.action === "completed_during_finalization") {
          await new Promise<void>((resolve, reject) => {
            options?.abortSignal?.addEventListener("abort", () => reject(new Error("aborted before required artifact read")), {once: true});
            void finalizationRead.then(resolve);
          });
        }
        // AWS may finish after RequestResponse cancellation. Such a result must
        // never reopen the frozen outcome or gain a second publication.
        if (input.action === "completed_after_finalization") {
          await new Promise<void>(resolve => { options?.abortSignal?.addEventListener("abort", () => resolve(), {once: true}); });
        }
        if (input.action === "none") throw new Error("action should not have dispatched");
        if (!packet) throw new Error("missing action packet fixture");
        const original = [...pointers.values()].find((candidate) => candidate.uri.includes(`${actionLane === "accept" ? "accept" : "reject"}_observation`))!;
        const uri = input.invalidActionHash ? {...original, sha256: "0".repeat(64)} : original;
        const descriptor = actionLane === "accept"
          ? {
              artifactOnly: true,
              contractVersion: "certscore.v2.lambda-post-accept-evidence-descriptor.v1",
              generatedAt: packet.completedAt,
              descriptorKind: "post_accept_evidence_descriptor",
              packetMetadata: { sha256: uri.sha256, sizeBytes: uri.sizeBytes },
              packetPointer: uri.uri,
              parentDispatchSha256: postRefusalParentDispatchSha256(payload),
              parentScanId: payload.scanId,
              processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
              productionFindingIntegration: true,
              acceptanceExercised: true,
              observationCount: 0,
              scanId: payload.scanId,
              status: "confirmed_clean",
              targetEnvironment: "local",
            }
          : {
              artifactOnly: true,
              contractVersion: "certscore.v2.lambda-post-refusal-evidence-descriptor.v1",
              generatedAt: packet.completedAt,
              descriptorKind: "post_refusal_evidence_descriptor",
              packetMetadata: { sha256: uri.sha256, sizeBytes: uri.sizeBytes },
              packetPointer: uri.uri,
              parentDispatchSha256: postRefusalParentDispatchSha256(payload),
              parentScanId: payload.scanId,
              processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
              productionFindingIntegration: true,
              refusalExercised: true,
              observationCount: 0,
              scanId: payload.scanId,
              status: "confirmed_clean",
              targetEnvironment: "local",
            };
        return {
          StatusCode: 200,
          Payload: Buffer.from(JSON.stringify({
            artifactMetadata: actionLane === "accept"
              ? { postAcceptPacketUri: { sha256: uri.sha256, sizeBytes: uri.sizeBytes } }
              : { postRefusalPacketUri: { sha256: uri.sha256, sizeBytes: uri.sizeBytes } },
            artifactPointers: actionLane === "accept"
              ? { postAcceptPacketUri: uri.uri }
              : { postRefusalPacketUri: uri.uri },
            parentDispatchSha256: postRefusalParentDispatchSha256(payload),
            ...(actionLane === "accept" ? { postAcceptEvidence: descriptor } : { postRefusalEvidence: descriptor }),
            scanId: payload.scanId,
            status: "completed",
            workerLane: lane,
          })),
        };
      }
      const bundle = passiveBundles.get(lane);
      if (!bundle) throw new Error(`unexpected worker lane ${lane}`);
      const uri = [...pointers.values()].find((candidate) => candidate.uri.includes(`/${lane}/`))!;
      return {
        StatusCode: 200,
        Payload: Buffer.from(JSON.stringify({
          artifactMetadata: { scanArtifactUri: { sha256: uri.sha256, sizeBytes: uri.sizeBytes } },
          artifactPointers: { scanArtifactUri: uri.uri },
          ...(lane === "gpc_observation" ? { parentDispatchSha256: workerPayload.parentDispatchSha256 } : {}),
          ...(lane === "consent_proof" ? { consentRejectAvailability: deriveConsentActionAvailability(bundle) } : {}),
          completedAt: bundle.completedAt,
          scanId: payload.scanId,
          status: "completed",
          workerLane: lane,
        })),
      };
    },
  };
  const s3GetClient = {
    async send(command: any) {
      const key = String(command.input.Key ?? "");
      input.onRead?.(key);
      const uri = `s3://${String(command.input.Bucket)}/${key}`;
      const entry = pointers.get(uri);
      if (!entry) throw new Error(`missing fixture object ${uri}`);
      if (input.action === "completed_during_finalization" && key.endsWith("/runtime_evidence/CanonicalEvidenceBundle.json")) {
        finalizationStarted();
        // This models the already-required GetObject's I/O turn, not a new
        // coordinator delay or a grace period for the action lane.
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      return { Body: entry.body };
    },
  };
  const s3Client = { async send(command: any) { uploads.push(String(command.input.Key)); return {}; } };
  try {
    const result = await runLocalV2DagLambdaShardedArtifactChain(payload, {
      artifactRoot,
      lambdaClient,
      s3Client,
      s3GetClient,
      ...(canaryCampaign?{canary:{campaign:canaryCampaign,runtime:{buildGitSha:canaryAuthorization!.buildGitSha,functionVersion:"42",region:"us-west-1",memoryMb:3008},ledger:{
        async read(key:string){return key.endsWith("/dispatch.json")?{authorization:canaryAuthorization}:null;},async create(){},
      }}}:{}),
    });
    const bundle = JSON.parse(await readFile(path.join(artifactRoot, "CanonicalEvidenceBundle.json"))) as Record<string, any>;
    return { actionCalls, workerCalls, artifactRoot, bundle, result, uploads };
  } catch (error) {
    await rm(artifactRoot, { recursive: true, force: true });
    throw error;
  }
}

test("ARO coordinator: limited consent cancels an undispatched Accept before the passive barrier", async () => {
  const priorFlag = process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  try {
    const outcome = await runCoordinatorFixture({
      scanId: "aro-coordinator-limited-undispatched",
      consentBundle: coordinatorConsentBundle("aro-coordinator-limited-undispatched", { inspectionCompleted: false, limited: true }),
      action: "none",
      dispatchDelayMs: 1_000,
    });
    assert.equal(outcome.actionCalls.length, 0);
    assert.equal(outcome.bundle.postAcceptLaneOutcome?.status, "failed");
    assert.equal(outcome.bundle.postAcceptLaneOutcome?.limitationCode, "accept_path_incomplete_at_passive_barrier");
    assert.equal(outcome.result.laneTimingSummary.acceptLaneJoin, "failed");
  } finally {
    if (priorFlag === undefined) delete process.env[POST_ACCEPT_WORKER_FEATURE_FLAG]; else process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
  }
});

test("unusable original runtime ends the attempt with verified lane pointers and no additional artifact reads", async () => {
  const priorBucket=process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  const priorAccept=process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET="test-bucket";
  process.env[POST_ACCEPT_WORKER_FEATURE_FLAG]="1";
  const scanId="unusable-original-runtime", reads:string[]=[];
  let aborted=0;
  const runtime=canonicalBundleFixture(scanId,{
    scanLaneRuns:[{...laneRunFixture("runtime_evidence","blocked-runtime"),accessOutcome:"access_denied"}],
    runtimeCoverage:{coverageStatus:"limited_none",silentEmpty:false,limitationKeys:[],fallbackModesUsed:[],notes:[],observationCounts:{}} as CanonicalEvidenceBundle["runtimeCoverage"],
    scanNoGoAssessment:terminalLaneNoGo("access_denied_or_forbidden_page"),
  });
  const consent=coordinatorConsentBundle(scanId,{inspectionCompleted:true,acceptControlObserved:true});
  consent.scanLaneRuns=[laneRunFixture("consent_proof","usable-consent")];
  consent.screenshots=[screenshotArtifact("screenshot_pre_consent_settled","/tmp/consent/screenshot-pre-consent-settled.png")];
  consent.visualCapture={status:"available",captureMethod:"primary_full_page",artifactRefs:[],notes:[]};
  try {
    await assert.rejects(runCoordinatorFixture({scanId,action:"hang",dispatchDelayMs:0,runtimeBundle:runtime,onRead:key=>reads.push(key),onActionAbort:()=>{aborted++;},
      consentBundle:consent}),error=>{
      assert.ok(error instanceof OriginalRuntimeVisitFailure);
      assert.equal(error.code,"original_runtime_visit_unavailable");
      assert.equal(error.message,"The starting page could not be verified, so a report could not be generated.");
      assert.equal(error.terminalLaneEvidence?.lanes.length,3);
      assert.ok(error.terminalLaneEvidence?.lanes.every(lane=>lane.status==="verified_retained" && lane.source));
      return true;
    });
    assert.equal(reads.filter(key=>key.endsWith("/runtime_evidence/CanonicalEvidenceBundle.json")).length,1);
    assert.equal(aborted,1,"unfinished action work must be cancelled when the original runtime visit is unusable");
  } finally {
    if(priorBucket===undefined)delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET=priorBucket;
    if(priorAccept===undefined)delete process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];else process.env[POST_ACCEPT_WORKER_FEATURE_FLAG]=priorAccept;
  }
});

test("runtime metadata retains the final worker document instead of an earlier navigation snapshot", () => {
  const scanId="final-runtime-document";
  const earlier={...runtimeSnapshotFixture(),capturedAtMs:50,url:"https://example.com/old"};
  const latest={...runtimeSnapshotFixture(),capturedAtMs:100,url:"https://example.com/final"};
  const runtime=canonicalBundleFixture(scanId,{domSnapshots:[earlier,latest],
    runtimeCoverage:{coverageStatus:"usable",silentEmpty:false,limitationKeys:[],fallbackModesUsed:[],notes:[],observationCounts:{}} as CanonicalEvidenceBundle["runtimeCoverage"]});
  const merged=mergeLocalV2DagLambdaEvidenceLaneBundles({artifactRoot:"/tmp/final-runtime-document",scanId,
    runtimeEvidence:runtime,consentProof:canonicalBundleFixture(scanId),policyEvidence:canonicalBundleFixture(scanId)});
  assert.equal(merged.runtimeMetadataSnapshots?.[0]?.url,latest.url);
  assert.equal(runtime.domSnapshots[0]?.url,earlier.url,"selection must not mutate original worker observations");
  assert.deepEqual(merged.domSnapshots,[],"runtime metadata cannot become consent evidence");
});

test("ARO coordinator: an invoked unfinished Accept is canceled at the passive barrier", async () => {
  const priorFlag = process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  try {
    const outcome = await runCoordinatorFixture({
      scanId: "aro-coordinator-invoked-incomplete",
      consentBundle: coordinatorConsentBundle("aro-coordinator-invoked-incomplete", { inspectionCompleted: false, limited: true }),
      action: "hang",
      dispatchDelayMs: 0,
    });
    assert.equal(outcome.actionCalls.length, 1);
    assert.equal(outcome.bundle.postAcceptLaneOutcome?.status, "failed");
    assert.equal(outcome.bundle.postAcceptLaneOutcome?.limitationCode, "accept_path_incomplete_at_passive_barrier");
    assert.equal(outcome.result.laneTimingSummary.acceptLaneJoin, "failed");
  } finally {
    if (priorFlag === undefined) delete process.env[POST_ACCEPT_WORKER_FEATURE_FLAG]; else process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
  }
});

test("ARO coordinator: a completed verified Accept remains joined through final publication", async () => {
  const priorFlag = process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  try {
    const outcome = await runCoordinatorFixture({
      scanId: "aro-coordinator-completed",
      consentBundle: coordinatorConsentBundle("aro-coordinator-completed", { inspectionCompleted: true, acceptControlObserved: true }),
      action: "completed",
      dispatchDelayMs: 0,
    });
    assert.equal(outcome.actionCalls.length, 1);
    assert.equal(outcome.bundle.postAcceptLaneOutcome?.status, "joined");
    assert.equal(outcome.bundle.postAcceptEvidence?.acceptanceRegistration?.status, "confirmed");
    assert.equal(outcome.result.artifactPointers.postAcceptPacketUri?.endsWith("PostAcceptEvidencePacket.json"), true);
  } finally {
    if (priorFlag === undefined) delete process.env[POST_ACCEPT_WORKER_FEATURE_FLAG]; else process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
  }
});

test("ARO coordinator: a late Accept completion after cancellation cannot republish evidence", async () => {
  const priorFlag = process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  try {
    const outcome = await runCoordinatorFixture({
      scanId: "aro-coordinator-late-completion",
      consentBundle: coordinatorConsentBundle("aro-coordinator-late-completion", { inspectionCompleted: false, limited: true }),
      action: "late",
      dispatchDelayMs: 0,
    });
    assert.equal(outcome.actionCalls.length, 1);
    assert.equal(outcome.bundle.postAcceptLaneOutcome?.status, "failed");
    assert.equal(outcome.bundle.postAcceptEvidence, undefined);
    assert.equal(outcome.result.artifactPointers.postAcceptPacketUri, undefined);
  } finally {
    if (priorFlag === undefined) delete process.env[POST_ACCEPT_WORKER_FEATURE_FLAG]; else process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
  }
});

test("ARO coordinator: limited consent cancels an undispatched Reject before the passive barrier", async () => {
  const priorFlag = process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  try {
    const outcome = await runCoordinatorFixture({
      scanId: "aro-coordinator-reject-limited-undispatched",
      consentBundle: coordinatorConsentBundle("aro-coordinator-reject-limited-undispatched", { inspectionCompleted: false, limited: true }),
      action: "none",
      dispatchDelayMs: 1_000,
      actionLane: "reject",
    });
    assert.equal(outcome.actionCalls.length, 0);
    assert.equal(outcome.bundle.postRefusalLaneOutcome?.status, "failed");
    assert.equal(outcome.bundle.postRefusalLaneOutcome?.limitationCode, "reject_path_incomplete_at_passive_barrier");
    assert.equal(outcome.result.laneTimingSummary.rejectLaneJoin, "failed");
  } finally {
    if (priorFlag === undefined) delete process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG]; else process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
  }
});

test("ARO coordinator: an invoked unfinished Reject adds no wait after required passive finalization", async () => {
  const priorFlag = process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  try {
    const outcome = await runCoordinatorFixture({
      scanId: "aro-coordinator-reject-invoked-incomplete",
      consentBundle: coordinatorConsentBundle("aro-coordinator-reject-invoked-incomplete", { inspectionCompleted: false, limited: true }),
      action: "hang",
      dispatchDelayMs: 0,
      actionLane: "reject",
    });
    assert.equal(outcome.actionCalls.length, 1);
    assert.equal(outcome.bundle.postRefusalLaneOutcome?.status, "failed");
    assert.equal(outcome.bundle.postRefusalLaneOutcome?.limitationCode, "reject_path_incomplete_at_passive_barrier");
    assert.equal(outcome.result.laneTimingSummary.rejectLaneJoin, "failed");
    assert.ok(!outcome.result.phaseTimings?.some(row => row.label === "post_refusal_barrier_join"));
  } finally {
    if (priorFlag === undefined) delete process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG]; else process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
  }
});

test("ARO coordinator: Accept keeps its original cutoff during required finalization", async () => {
  const priorFlag = process.env[POST_ACCEPT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  let root: string | undefined;
  try {
    const scanId = "accept-original-finalization-cutoff";
    const outcome = await runCoordinatorFixture({scanId,
      consentBundle: coordinatorConsentBundle(scanId, {inspectionCompleted: false, limited: true}),
      action: "completed_during_finalization", actionLane: "accept", dispatchDelayMs: 0});
    root = outcome.artifactRoot;
    assert.equal(outcome.bundle.postAcceptLaneOutcome?.status, "failed");
    assert.equal(outcome.bundle.postAcceptEvidence, undefined);
    assert.equal(outcome.result.artifactPointers.postAcceptPacketUri, undefined);
    assert.ok(!outcome.result.phaseTimings?.some(row => row.label === "post_accept_barrier_join"));
  } finally {
    if (root) await rm(root, {recursive: true, force: true});
    if (priorFlag === undefined) delete process.env[POST_ACCEPT_WORKER_FEATURE_FLAG]; else process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
  }
});

for (const limited of [false, true]) {
  test(`ARO coordinator: Reject returned during required finalization survives passive disagreement (limited=${limited})`, async () => {
    const priorFlag = process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
    const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = "1";
    process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
    let root: string | undefined;
    try {
      const scanId = `reject-existing-finalization-${limited}`;
      const outcome = await runCoordinatorFixture({scanId,
        consentBundle: coordinatorConsentBundle(scanId, {inspectionCompleted: !limited, limited, rejectControlObserved: false}),
        action: "completed_during_finalization", actionLane: "reject", dispatchDelayMs: 0});
      root = outcome.artifactRoot;
      assert.equal(outcome.actionCalls.length, 1);
      assert.equal(outcome.bundle.postRefusalLaneOutcome?.status, "joined");
      assert.equal(outcome.bundle.postRefusalLaneOutcome?.maxTailWaitMs, POST_REFUSAL_REJECT_WORKER_MAX_TAIL_WAIT_MS);
      assert.ok(outcome.bundle.postRefusalEvidence);
      assert.ok(outcome.result.artifactMetadata.postRefusalPacketUri?.sha256);
      assert.ok(!outcome.result.phaseTimings?.some(row => row.label === "post_refusal_barrier_join"), "no await of an unfinished action worker");
      const mainKey = new URL(outcome.result.artifactPointers.scanArtifactUri!).pathname.slice(1);
      assert.equal(outcome.uploads.filter(key => key === mainKey).length, 1);
    } finally {
      if (root) await rm(root, {recursive: true, force: true});
      if (priorFlag === undefined) delete process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG]; else process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = priorFlag;
      if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
    }
  });
}

for (const invalidHash of [false, true]) {
  test(`ARO coordinator: Reject finalization remains closed for ${invalidHash ? "checksum mismatch" : "a reply after the freeze"}`, async () => {
    const priorFlag = process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
    const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = "1";
    process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
    let root: string | undefined;
    try {
      const scanId = `reject-finalization-closed-${invalidHash}`;
      const outcome = await runCoordinatorFixture({scanId,
        consentBundle: coordinatorConsentBundle(scanId, {inspectionCompleted: false, limited: true}),
        action: invalidHash ? "completed_during_finalization" : "completed_after_finalization",
        invalidActionHash: invalidHash, actionLane: "reject", dispatchDelayMs: 0});
      root = outcome.artifactRoot;
      const before = await readFile(path.join(root, "CanonicalEvidenceBundle.json"));
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.deepEqual(await readFile(path.join(root, "CanonicalEvidenceBundle.json")), before);
      assert.equal(outcome.bundle.postRefusalLaneOutcome?.status, "failed");
      assert.equal(outcome.bundle.postRefusalEvidence, undefined);
      assert.equal(outcome.result.artifactPointers.postRefusalPacketUri, undefined);
      assert.ok(!outcome.result.phaseTimings?.some(row => row.label === "post_refusal_barrier_join"));
      const mainKey = new URL(outcome.result.artifactPointers.scanArtifactUri!).pathname.slice(1);
      assert.equal(outcome.uploads.filter(key => key === mainKey).length, 1);
    } finally {
      if (root) await rm(root, {recursive: true, force: true});
      if (priorFlag === undefined) delete process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG]; else process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = priorFlag;
      if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
    }
  });
}

test("ARO coordinator: a completed verified Reject remains joined through final publication", async () => {
  const priorFlag = process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  try {
    const outcome = await runCoordinatorFixture({
      scanId: "aro-coordinator-reject-completed",
      consentBundle: coordinatorConsentBundle("aro-coordinator-reject-completed", { inspectionCompleted: true, rejectControlObserved: true }),
      action: "completed",
      dispatchDelayMs: 0,
      actionLane: "reject",
    });
    assert.equal(outcome.actionCalls.length, 1);
    assert.equal(outcome.bundle.postRefusalLaneOutcome?.status, "joined");
    assert.equal(outcome.bundle.postRefusalEvidence?.refusalRegistration?.status, "confirmed");
    assert.equal(outcome.result.artifactPointers.postRefusalPacketUri?.endsWith("PostRefusalEvidencePacket.json"), true);
  } finally {
    if (priorFlag === undefined) delete process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG]; else process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
  }
});

test("ARO coordinator: Reject validation failure retains typed coverage without publishing action evidence", async () => {
  const priorFlag = process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  try {
    const outcome = await runCoordinatorFixture({
      scanId: "aro-coordinator-reject-invalid",
      consentBundle: coordinatorConsentBundle("aro-coordinator-reject-invalid", { inspectionCompleted: true, rejectControlObserved: true }),
      action: "validation_failed",
      dispatchDelayMs: 0,
      actionLane: "reject",
    });
    assert.equal(outcome.actionCalls.length, 1);
    assert.equal(outcome.bundle.postRefusalLaneOutcome?.status, "failed");
    assert.equal(outcome.bundle.postRefusalLaneOutcome?.failureReason, "evidence_validation_failed");
    assert.equal(outcome.bundle.postRefusalEvidence, undefined);
    assert.equal(outcome.result.artifactPointers.postRefusalPacketUri, undefined);
  } finally {
    if (priorFlag === undefined) delete process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG]; else process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
  }
});

test("ARO coordinator: a late Reject completion after cancellation cannot republish evidence", async () => {
  const priorFlag = process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG];
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  try {
    const outcome = await runCoordinatorFixture({
      scanId: "aro-coordinator-reject-late-completion",
      consentBundle: coordinatorConsentBundle("aro-coordinator-reject-late-completion", { inspectionCompleted: false, limited: true }),
      action: "late",
      dispatchDelayMs: 0,
      actionLane: "reject",
    });
    assert.equal(outcome.actionCalls.length, 1);
    assert.equal(outcome.bundle.postRefusalLaneOutcome?.status, "failed");
    assert.equal(outcome.bundle.postRefusalEvidence, undefined);
    assert.equal(outcome.result.artifactPointers.postRefusalPacketUri, undefined);
  } finally {
    if (priorFlag === undefined) delete process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG]; else process.env[POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG] = priorFlag;
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
  }
});

test("regional FIFO SQS dispatch envelopes contain exactly one typed payload", () => {
  const event = {
    Records: [{
      body: JSON.stringify(validPayload()),
      eventSource: "aws:sqs",
    }],
  };
  const unwrapped = unwrapLocalV2DagLambdaDispatchEvent(event);
  assert.equal(unwrapped.transport, "sqs_fifo");
  assert.equal(parseLocalV2DagLambdaDispatchPayload(unwrapped.payload).scanId, "scan-local-1");
  assert.throws(
    () => unwrapLocalV2DagLambdaDispatchEvent({ Records: [event.Records[0], event.Records[0]] }),
    /exactly one FIFO SQS record/,
  );
});

test("SQS redelivery replays retained completion without rerunning scanner work", async t => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  const previousPrefix = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "certscore-test-artifacts";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX = "v2-dag-lambda/local";
  let artifactRuns = 0;
  const sent: SendMessageCommand[] = [];
  const postRefusalPacketUri = "s3://certscore-test-artifacts/v2-dag-lambda/local/scan-local-1/lanes/reject_observation/PostRefusalEvidencePacket.json";
  try {
    for (const sixLanes of [false, true]) {
      await t.test(sixLanes ? "six lanes" : "historical four lanes", async () => {
      sent.length = 0;
      const laneTimingSummary = {
        contractVersion: "certscore.v2.lambda-lane-timing.v1",
        coordinatorStartedAt: "2026-08-20T19:59:40.000Z",
        generatedAt: "2026-08-20T20:00:00.000Z",
        lanes: ["consent_proof", "runtime_evidence", "policy_evidence", "reject_observation",
          ...(sixLanes ? ["gpc_observation", "accept_observation"] : [])].map((lane) => ({
          coordinatorElapsedMs: 1_000,
          evidenceJoined: true,
          invocationStartedAt: "2026-08-20T19:59:40.000Z",
          lane,
          outcome: "completed",
          terminalOutcomeDeltaFromPassiveBarrierMs: lane === "reject_observation" ? -100 : 0,
          terminalOutcomeObservedAt: "2026-08-20T19:59:59.000Z",
          workerReportedCompletedAt: "2026-08-20T19:59:59.000Z",
          workerReportedHandlerDurationMs: 900,
        })),
        ...(sixLanes ? { maxAcceptTailWaitMs: 6_000, acceptLaneAddedWaitMs: 0,
          acceptLaneJoin: "joined", acceptTailDeltaMs: -100, acceptCompletedBeforeOrAtPassiveBarrier: true } : {}),
        maxRejectTailWaitMs: 6_000,
        passiveLaneBarrierCompletedAt: "2026-08-20T19:59:59.100Z",
        rejectCompletedBeforeOrAtPassiveBarrier: true,
        rejectLaneAddedWaitMs: 0,
        rejectLaneJoin: "joined",
        rejectTailDeltaMs: -100,
      };
      const result = await handler({
        Records: [{ body: JSON.stringify(validPayload()), eventSource: "aws:sqs" }],
      }, {
        runArtifactChain: async () => {
          artifactRuns += 1;
          throw new Error("scanner work must not rerun");
        },
        s3GetClient: {
          async send(command: GetObjectCommand) {
            const key = command.input.Key ?? "";
            const body = key.endsWith("LocalV2DagLambdaManifest.json")
              ? JSON.stringify({
                  artifactMetadata: {
                    postRefusalPacketUri: { sha256: "c".repeat(64), sizeBytes: 1_024 },
                  },
                  generatedAt: "2026-08-20T20:00:00.000Z",
                  laneTimingSummary,
                  phaseTimings: [],
                  pointers: { postRefusalPacketUri },
                })
              : JSON.stringify({ artifactVersion: "fixture" });
            return { Body: Buffer.from(body) };
          },
        },
        sqsClient: {
          async send(command: SendMessageCommand) {
            sent.push(command);
            return { MessageId: "replayed-result" };
          },
        },
      });
      assert.equal(artifactRuns, 0);
      assert.equal(sent.length, 1);
      assert.equal(result.status, "completed");
      assert.equal(result.artifactPointers?.postRefusalPacketUri, postRefusalPacketUri);
      assert.deepEqual(result.artifactMetadata?.postRefusalPacketUri, {
        sha256: "c".repeat(64),
        sizeBytes: 1_024,
      });
      assert.deepEqual(result.laneTimingSummary, laneTimingSummary);
      const replayedMessage = JSON.parse(String(sent[0]?.input.MessageBody));
      assert.equal(replayedMessage.artifactPointers.postRefusalPacketUri, postRefusalPacketUri);
      assert.deepEqual(replayedMessage.laneTimingSummary, laneTimingSummary);
      });
    }
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    if (previousPrefix === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX = previousPrefix;
  }
});

test("handler validates local v2 DAG Lambda dispatch contract", () => {
  const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload());

  assert.equal(parsed.scanId, "scan-local-1");
  assert.equal(parsed.awsRegion, "eu-central-1");
  assert.equal(parsed.artifactOnly, true);
  assert.equal(parsed.productionFindingIntegration, false);
  assert.equal(parsed.processor, LOCAL_V2_DAG_SCAN_PROCESSOR);
  assert.equal(parsed.resultPurpose, "synthetic_verification");
});

test("handler preserves the typed persisted-scan result purpose for UUID-backed product scans", () => {
  const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload({
    callbackCorrelationId: "49037835-190b-4e67-9fe2-426d51d55069",
    resultPurpose: "persisted_scan",
    scanId: "49037835-190b-4e67-9fe2-426d51d55069",
  }));

  assert.equal(parsed.resultPurpose, "persisted_scan");
  assert.equal(parsed.scanId, "49037835-190b-4e67-9fe2-426d51d55069");
});

test("handler bounds and validates policy surface seeds", () => {
  const source = {
    sourceCompletedAt: "2026-08-18T00:00:00.000Z",
    sourceScanId: "prior-scan-1",
  };
  const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload({
    policySurfaceSeeds: [
      { confidence: 4, hintType: "privacy_policy", source: "prior_scan_hint", ...source, url: "https://example.com/legal/privacy#section" },
      { hintType: "unrelated", source: "prior_scan_hint", ...source, url: "https://example.com/about" },
      { hintType: "cookie_policy", source: "unknown", ...source, url: "https://example.com/cookies" },
      { hintType: "privacy_policy", source: "prior_scan_hint", ...source, url: "javascript:alert(1)" }
    ]
  }));

  assert.deepEqual(parsed.policySurfaceSeeds, [{
    confidence: 1,
    hintType: "privacy_policy",
    source: "prior_scan_hint",
    sourceCompletedAt: source.sourceCompletedAt,
    sourceScanId: source.sourceScanId,
    url: "https://example.com/legal/privacy"
  }]);
});

test("lightweight egress probe enforces one hard total deadline", async () => {
  const proxy = createHttpServer();
  let tunnelSocket: { destroy(): void } | undefined;
  let connectTarget: string | undefined;
  proxy.on("connect", (request, socket) => {
    connectTarget = request.url;
    tunnelSocket = socket;
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  assert.ok(address && typeof address === "object");
  const startedAt = Date.now();
  try {
    await assert.rejects(
      fetchEgressProbeThroughProxy(`http://127.0.0.1:${address.port}`, 100),
      /exceeded 100ms total deadline/,
    );
    assert.ok(Date.now() - startedAt < 1_000);
    assert.equal(connectTarget, "checkip.amazonaws.com:443");
  } finally {
    tunnelSocket?.destroy();
    await new Promise<void>((resolve, reject) => proxy.close((error) => error ? reject(error) : resolve()));
  }
});

test("egress probe parser accepts the bounded plain-IP response from AWS CheckIP", () => {
  assert.deepEqual(parseEgressProbeResponse("203.0.113.42\n"), { ip: "203.0.113.42" });
  assert.equal(parseEgressProbeResponse("not an IP"), null);
});

test("browser-fallback handoff preserves the failed lightweight egress attempt", async () => {
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "certscore-egress-attempts-"));
  const priorProxy = process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER;
  process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER = "ftp://127.0.0.1:9";
  try {
    assert.equal(await writeEgressPreflightArtifact(artifactRoot, { allowBrowserFallback: false }), false);
    assert.equal(await writeEgressPreflightArtifact(artifactRoot, {
      allowBrowserFallback: false,
      skipLightweightProbe: true,
    }), false);
    const artifact = JSON.parse(await readFile(path.join(artifactRoot, "EgressPreflight.json"), "utf8")) as {
      attempts?: Array<{ error?: string; mode?: string; probeStatus?: string }>;
    };
    assert.deepEqual(artifact.attempts?.map((attempt) => attempt.mode), ["lightweight_proxy"]);
    assert.equal(artifact.attempts?.[0]?.probeStatus, "failed");
    assert.match(artifact.attempts?.[0]?.error ?? "", /Unsupported lightweight egress proxy protocol/);
  } finally {
    if (priorProxy === undefined) {
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER;
    } else {
      process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER = priorProxy;
    }
    await rm(artifactRoot, { force: true, recursive: true });
  }
});

test("handler accepts the approved regional Lambda dispatch targets", () => {
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({ awsRegion: "eu-central-1" })).awsRegion, "eu-central-1");
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({
    awsRegion: "eu-west-1",
    resultQueueUrl: "https://sqs.eu-west-1.amazonaws.com/123/certscore-v2-dag-ie-results"
  })).awsRegion, "eu-west-1");
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({
    awsRegion: "us-west-1",
    resultQueueUrl: "https://sqs.us-west-1.amazonaws.com/123/certscore-v2-dag-usw-results"
  })).awsRegion, "us-west-1");
});

test("handler exposes bounded Lambda runtime diagnostics for quality A/B runs", () => {
  const diagnostics = buildLocalV2DagLambdaRuntimeDiagnostics({
    AWS_LAMBDA_FUNCTION_MEMORY_SIZE: "4096",
    AWS_LAMBDA_FUNCTION_NAME: "certscore-v2-dag-local-lambda",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_ACCEPT_LANGUAGE: "en-IE,en;q=0.9",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_LOCALE: "en-IE",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_SINGLE_PROCESS: "false",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_TIMEZONE_ID: "Europe/Dublin",
    CERTSCORE_V2_DAG_LAMBDA_PROXY_PASSWORD: "secret",
    CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER: "http://proxy.example:8080",
    CERTSCORE_V2_DAG_LAMBDA_PROXY_USERNAME: "scanner"
  });

  assert.equal(diagnostics.awsLambdaRuntime, true);
  assert.deepEqual(diagnostics.chromiumContextOptions, {
    acceptLanguage: "en-IE,en;q=0.9",
    locale: "en-IE",
    timezoneId: "Europe/Dublin",
    userAgent: null,
    userAgentConfigured: false,
    viewport: { width: 1366, height: 900 }
  });
  assert.equal(diagnostics.chromiumProxyAuthConfigured, true);
  assert.equal(diagnostics.chromiumProxyConfigured, true);
  assert.equal(diagnostics.chromiumSingleProcessEnabled, false);
  assert.equal(diagnostics.memorySizeMb, 4096);
  assert.equal(diagnostics.chromiumLaunchArgs.includes("--single-process"), false);
  assert.equal(Object.hasOwn(diagnostics, "OPENAI_API_KEY"), false);
  assert.equal(JSON.stringify(diagnostics).includes("secret"), false);
  assert.equal(JSON.stringify(diagnostics).includes("proxy.example"), false);
});

test("runtime diagnostics distinguish crawler HTTP identity from native navigator identity", () => {
  const diagnostics = buildLocalV2DagLambdaRuntimeDiagnostics({
    CERTSCORE_V2_DAG_LAMBDA_HTTP_USER_AGENT: "ConsentCheckBot/1.0",
    CERTSCORE_V2_DAG_LAMBDA_CHROMIUM_USER_AGENT: "legacy ConsentCheckBot/1.0",
  });
  assert.equal(diagnostics.chromiumContextOptions.userAgent, null);
  assert.equal(diagnostics.chromiumContextOptions.userAgentConfigured, false);
  assert.equal(diagnostics.chromiumContextOptions.httpUserAgent, "ConsentCheckBot/1.0");
  assert.equal(diagnostics.chromiumContextOptions.browserIdentityMode, "native_navigator_crawler_http.v1");
});

test("regional egress guard fails closed when the proxy public region is wrong", () => {
  assert.equal(egressRegionMatchesExpected("California", "California"), true);
  assert.equal(egressRegionMatchesExpected("california", "California"), true);
  assert.equal(egressRegionMatchesExpected("Oregon", "California"), false);
  assert.equal(egressRegionMatchesExpected(undefined, "California"), false);
  assert.equal(egressRegionMatchesExpected(undefined, undefined), true);
});

test("regional egress guard binds Chrome egress to the configured proxy public IP hash", () => {
  const proxyIpHash = "sha256:" + createHash("sha256").update("34.218.187.36").digest("hex");
  assert.equal(egressIpMatchesExpected("34.218.187.36", proxyIpHash), true);
  assert.equal(egressIpMatchesExpected("35.164.175.41", proxyIpHash), false);
  assert.equal(egressIpMatchesExpected("34.218.187.36", undefined), true);
});

test("plain-IP egress reflector verifies region through the configured exact IP binding", () => {
  const expectedHash = `sha256:${createHash("sha256").update("203.0.113.42").digest("hex")}`;
  const assessment = assessEgressProbeObservation({
    expectedEgressPublicIpHash: expectedHash,
    expectedEgressRegion: "California",
    httpStatus: 200,
    observed: { ip: "203.0.113.42" },
    provider: "checkip.amazonaws.com",
  });
  assert.equal(assessment.probeStatus, "available");
  assert.equal(assessment.regionMatches, true);
  assert.equal(assessment.regionVerificationSource, "configured_exact_ip_binding");
});

test("egress preflight fails closed on provider throttling or an unexpected public IP", () => {
  const expectedHash = `sha256:${createHash("sha256").update("203.0.113.42").digest("hex")}`;
  const throttled = assessEgressProbeObservation({
    expectedEgressPublicIpHash: expectedHash,
    expectedEgressRegion: "California",
    httpStatus: 429,
    observed: null,
    provider: "checkip.amazonaws.com",
  });
  assert.equal(throttled.probeStatus, "failed");
  assert.match(throttled.error ?? "", /HTTP 429/);

  const wrongIp = assessEgressProbeObservation({
    expectedEgressPublicIpHash: expectedHash,
    expectedEgressRegion: "California",
    httpStatus: 200,
    observed: { ip: "198.51.100.10" },
    provider: "certscore.ai",
  });
  assert.equal(wrongIp.probeStatus, "failed");
  assert.match(wrongIp.error ?? "", /did not match/);
});

test("handler exposes bounded Lambda scan tuning for quality and speed A/B runs", () => {
  assert.deepEqual(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_CONSENT_FLOW_SCREENSHOT_MODE: "auto",
      CERTSCORE_V2_DAG_LAMBDA_ACTION_FINAL_SETTLE_MS: "1500",
      CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS: "1500",
      CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_VISUAL_FALLBACK_DEADLINE_MS: "9000",
      CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY: "3"
    }),
    {
      actionFinalSettleMs: 1500,
      consentFlowScreenshotMode: "auto",
      evidenceDiagnosticMode: "off",
      preConsentScreenshotMode: "always",
      preConsentScreenshotTimeoutMs: 1500,
      preConsentVisualFallbackDeadlineMs: 9000,
      scenarioConcurrency: 3,
      scenarioResourceMode: "cmp_safe"
    }
  );
  assert.deepEqual(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_TIMEOUT_MS: "10",
      CERTSCORE_V2_DAG_LAMBDA_SCENARIO_CONCURRENCY: "99"
    }),
    {
      actionFinalSettleMs: 350,
      consentFlowScreenshotMode: "none",
      evidenceDiagnosticMode: "off",
      preConsentScreenshotMode: "always",
      preConsentScreenshotTimeoutMs: 500,
      preConsentVisualFallbackDeadlineMs: 15000,
      scenarioConcurrency: 4,
      scenarioResourceMode: "cmp_safe"
    }
  );
  assert.equal(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE: "normal"
    }).scenarioResourceMode,
    "normal"
  );
  assert.equal(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_SCENARIO_RESOURCE_MODE: "cmp_safe"
    }).scenarioResourceMode,
    "cmp_safe"
  );
  assert.deepEqual(
    buildLocalV2DagLambdaScanTuning({
      CERTSCORE_V2_DAG_LAMBDA_EVIDENCE_DIAGNOSTIC_MODE: "webmd",
      CERTSCORE_V2_DAG_LAMBDA_PRECONSENT_SCREENSHOT_MODE: "selective"
    }),
    {
      actionFinalSettleMs: 350,
      consentFlowScreenshotMode: "none",
      evidenceDiagnosticMode: "webmd",
      preConsentScreenshotMode: "selective",
      preConsentScreenshotTimeoutMs: 15000,
      preConsentVisualFallbackDeadlineMs: 15000,
      scenarioConcurrency: 1,
      scenarioResourceMode: "cmp_safe"
    }
  );
});

test("handler parses bounded per-dispatch Lambda debug overrides", () => {
  const parsed = parseLocalV2DagLambdaDispatchPayload(validPayload({
    debugOverrides: {
      actionFinalSettleMs: 25_000,
      actionSearchDeadlineMs: 12_000,
      consentFlowDeadlineMs: 120_000,
      preActionObservationMs: 5_000,
      privacyControlUrls: [
        "https://example.com/privacy",
        "javascript:alert(1)",
        "https://example.com/privacy",
        "https://example.com/choices",
        "https://example.com/extra",
      ],
      scenarioConcurrency: 9,
      scenarioResourceMode: "cmp_safe",
      strongEvidenceMode: "webmd"
    }
  }));

  assert.deepEqual(parsed.debugOverrides, {
    actionFinalSettleMs: 10_000,
    actionSearchDeadlineMs: 12_000,
    consentFlowDeadlineMs: 90_000,
    preActionObservationMs: 5_000,
    privacyControlUrls: [
      "https://example.com/privacy",
      "https://example.com/choices",
    ],
    scenarioConcurrency: 4,
    scenarioResourceMode: "cmp_safe",
    strongEvidenceMode: "webmd"
  });
  assert.equal(parsed.strongEvidenceMode, "webmd");
});

test("handler keeps Lambda scan modules browser-isolated for runtime stability", async () => {
  const handlerSource = await readFile(new URL("./handler.ts", import.meta.url), "utf8");

  assert.match(handlerSource, /browserReuseMode:\s*"per_module"/);
  assert.doesNotMatch(handlerSource, /browserReuseMode:\s*"single"/);
});

test("handler bundle imports without browser-only PDF globals", async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const tempDir = await mkdtemp(path.join(repoRoot, "apps/v2-dag-lambda/tmp/bundle-import-"));
  const outfile = path.join(tempDir, "handler.cjs");
  await build({
    bundle: true,
    entryPoints: [path.join(repoRoot, "apps/v2-dag-lambda/src/handler.ts")],
    external: ["playwright", "pdf-parse"],
    format: "cjs",
    minify: true,
    outfile,
    platform: "node",
    target: "node22",
    tsconfig: path.join(repoRoot, "tsconfig.base.json")
  });

  const requireFromTest = createRequire(import.meta.url);
  const bundledHandler = requireFromTest(outfile) as { handler?: unknown };
  assert.equal(typeof bundledHandler.handler, "function");
  const bundledSource = await readFile(outfile, "utf8");
  assert.match(bundledSource, /import\(["']pdf-parse["']\)/);
  assert.doesNotMatch(bundledSource, /Cannot polyfill `DOMMatrix`/);
});

test("handler rejects wrong contract, processor, unsupported region, network mode, or production-integration flags", () => {
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ contractVersion: "wrong" })),
    /contract version/
  );
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ processor: "queued-full-scan-v1" })),
    /unexpected processor/
  );
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ awsRegion: "us-east-1" })),
    /eu-central-1, eu-west-1, or us-west-1/
  );
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ vpcMode: "private" })),
    /supported network mode/
  );
  assert.throws(
    () => parseLocalV2DagLambdaDispatchPayload(validPayload({ productionFindingIntegration: true })),
    /artifact-only/
  );
});

test("handler accepts truthful VPC dispatch and emits bounded scanner runtime provenance", () => {
  assert.equal(parseLocalV2DagLambdaDispatchPayload(validPayload({ vpcMode: "vpc" })).vpcMode, "vpc");
  assert.deepEqual(buildScannerRuntimeProvenance(
    { awsRegion: "eu-west-1", vpcMode: "vpc" },
    {
      AWS_LAMBDA_FUNCTION_VERSION: "$LATEST",
      CERTSCORE_V2_DAG_LAMBDA_EGRESS_ID: "aws-nat:eu-west-1:eipalloc-123",
      CERTSCORE_V2_DAG_LAMBDA_EGRESS_PROVIDER: "aws-nat-gateway",
      CERTSCORE_V2_DAG_LAMBDA_EGRESS_PUBLIC_IP_HASH: `sha256:${"b".repeat(64)}`,
      CERTSCORE_V2_DAG_LAMBDA_VPC_MODE: "vpc",
      SCANNER_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
    },
  ), {
    awsRegion: "eu-west-1",
    dispatchVpcMode: "vpc",
    egressId: "aws-nat:eu-west-1:eipalloc-123",
    egressProvider: "aws-nat-gateway",
    functionVersion: "$LATEST",
    imageDigest: `sha256:${"a".repeat(64)}`,
    publicIpHash: `sha256:${"b".repeat(64)}`,
    runtimeVpcMode: "vpc",
  });
});

test("handler projects bounded build identifiers into canonical bundle provenance", () => {
  const previousBuildGitSha = process.env.BUILD_GIT_SHA;
  const previousBuildImageTag = process.env.BUILD_IMAGE_TAG;
  const previousScannerRuntimeVersion = process.env.SCANNER_RUNTIME_VERSION;
  process.env.BUILD_GIT_SHA = "abc123scanner";
  process.env.BUILD_IMAGE_TAG = "scanner-image:abc123scanner";
  process.env.SCANNER_RUNTIME_VERSION = "v2-dag-runtime.1";
  try {
    assert.deepEqual(buildCanonicalBundleScannerBuildProvenance(), {
      contractVersion: "scanner_build_provenance.v1",
      gitSha: "abc123scanner",
      imageTag: "scanner-image:abc123scanner",
      runtimeVersion: "v2-dag-runtime.1",
    });
  } finally {
    if (previousBuildGitSha === undefined) delete process.env.BUILD_GIT_SHA;
    else process.env.BUILD_GIT_SHA = previousBuildGitSha;
    if (previousBuildImageTag === undefined) delete process.env.BUILD_IMAGE_TAG;
    else process.env.BUILD_IMAGE_TAG = previousBuildImageTag;
    if (previousScannerRuntimeVersion === undefined) delete process.env.SCANNER_RUNTIME_VERSION;
    else process.env.SCANNER_RUNTIME_VERSION = previousScannerRuntimeVersion;
  }
});

test("handler emits a validated completed SQS result without production findings", async () => {
  const sentBodies: string[] = [];
  const previousBuildGitSha = process.env.BUILD_GIT_SHA;
  const previousBuildImageTag = process.env.BUILD_IMAGE_TAG;
  const previousScannerRuntimeVersion = process.env.SCANNER_RUNTIME_VERSION;
  process.env.BUILD_GIT_SHA = "abc123scanner";
  process.env.BUILD_IMAGE_TAG = "scanner-image:abc123scanner";
  process.env.SCANNER_RUNTIME_VERSION = "v2-dag-runtime.1";
  const result = await handler(validPayload(), {
    now: () => new Date("2026-06-15T18:00:00.000Z"),
    runArtifactChain: async () => ({
      artifactMetadata: {
        manifestUri: {
          sha256: "a".repeat(64),
          sizeBytes: 10
        }
      },
      artifactPointers: {
        manifestUri: "s3://certscore-dev-artifacts/v2/scan-local-1/manifest.json",
        scanArtifactUri: "s3://certscore-dev-artifacts/v2/scan-local-1/CanonicalEvidenceBundle.json"
      },
      phaseTimings: [{ durationMs: 123, label: "scan", status: "completed" }]
    }),
    sqsClient: {
      async send(command: SendMessageCommand) {
        sentBodies.push(String(command.input.MessageBody));
        assert.equal(command.input.QueueUrl, "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-local-results");
        return { $metadata: {} };
      }
    }
  });
  if (previousBuildGitSha === undefined) {
    delete process.env.BUILD_GIT_SHA;
  } else {
    process.env.BUILD_GIT_SHA = previousBuildGitSha;
  }
  if (previousBuildImageTag === undefined) {
    delete process.env.BUILD_IMAGE_TAG;
  } else {
    process.env.BUILD_IMAGE_TAG = previousBuildImageTag;
  }
  if (previousScannerRuntimeVersion === undefined) {
    delete process.env.SCANNER_RUNTIME_VERSION;
  } else {
    process.env.SCANNER_RUNTIME_VERSION = previousScannerRuntimeVersion;
  }

  assert.equal(result.status, "completed");
  assert.equal(result.productionFindingIntegration, false);
  assert.equal(result.scannerGitSha, "abc123scanner");
  assert.equal(result.scannerImageTag, "scanner-image:abc123scanner");
  assert.equal(result.scannerRuntimeVersion, "v2-dag-runtime.1");
  assert.deepEqual(result.scannerRuntimeProvenance, {
    awsRegion: "eu-central-1",
    dispatchVpcMode: "none",
    runtimeVpcMode: "unknown"
  });
  assert.equal(Object.hasOwn(result, "findings"), false);
  assert.equal(Object.hasOwn(result, "checklistRows"), false);
  assert.equal(Object.hasOwn(result, "score"), false);
  assert.equal(sentBodies.length, 1);

  const parsed = parseLocalV2DagLambdaResultMessage(sentBodies[0], { expectedTargetEnvironment: "local" });
  assert.equal(parsed.status, "completed");
  assert.equal(parsed.artifactOnly, true);
  assert.equal(parsed.productionFindingIntegration, false);
  assert.equal(parsed.artifactPointers?.manifestUri, "s3://certscore-dev-artifacts/v2/scan-local-1/manifest.json");
  assert.equal(parsed.artifactMetadata?.manifestUri?.sizeBytes, 10);
  assert.equal(parsed.scannerGitSha, "abc123scanner");
  assert.equal(parsed.scannerImageTag, "scanner-image:abc123scanner");
  assert.equal(parsed.scannerRuntimeVersion, "v2-dag-runtime.1");
  assert.deepEqual(parsed.phaseTimings, [{ durationMs: 123, label: "scan", status: "completed" }]);
  assert.deepEqual(parsed.handlerTiming, {
    artifactChainCompletedAt: "2026-06-15T18:00:00.000Z",
    artifactChainDurationMs: 0,
    artifactChainStartedAt: "2026-06-15T18:00:00.000Z",
    completedAt: "2026-06-15T18:00:00.000Z",
    handlerDurationMs: 0,
    handlerStartedAt: "2026-06-15T18:00:00.000Z",
    scanPhaseDurationMs: 123,
    scanPhaseLabel: "scan"
  });
});

test("handler publishes a terminal failure before the Lambda hard timeout", async () => {
  const sentBodies: string[] = [];
  let scannerSignal: AbortSignal | undefined;
  const result = await handler(validPayload(), {
    artifactChainTimeoutMs: 20,
    handlerSafetyTimeoutMs: 30,
    scannerWorkTimeoutMs: 10,
    runArtifactChain: async (_payload, options) => {
      scannerSignal = options.signal;
      return await new Promise(() => undefined);
    },
    sqsClient: {
      async send(command: SendMessageCommand) {
        sentBodies.push(String(command.input.MessageBody));
        return { $metadata: {} };
      }
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error?.code, "v2_dag_lambda_safety_timeout");
  assert.match(result.error?.message ?? "", /internal safety deadline/);
  assert.equal(sentBodies.length, 1);
  const parsed = parseLocalV2DagLambdaResultMessage(sentBodies[0], { expectedTargetEnvironment: "local" });
  assert.equal(parsed.status, "failed");
  assert.equal(parsed.error?.code, "v2_dag_lambda_safety_timeout");
  assert.equal(scannerSignal?.aborted, true);
});

test("handler gives the policy lane an absolute deadline before scanner shutdown", async () => {
  const startedAtMs = Date.now();
  let policySurfaceDeadlineAtMs: number | undefined;
  let preConsentModuleDeadlineMs: number | undefined;
  let preConsentVisualFallbackDeadlineMs: number | undefined;
  let preConsentVisualFallbackDeadlineAtMs: number | undefined;

  const result = await handler(validPayload(), {
    artifactChainTimeoutMs: 45_000,
    handlerSafetyTimeoutMs: 60_000,
    scannerWorkTimeoutMs: 40_000,
    runArtifactChain: async (_payload, options) => {
      policySurfaceDeadlineAtMs = options.policySurfaceDeadlineAtMs;
      preConsentModuleDeadlineMs = options.preConsentModuleDeadlineMs;
      preConsentVisualFallbackDeadlineMs = options.preConsentVisualFallbackDeadlineMs;
      preConsentVisualFallbackDeadlineAtMs = options.preConsentVisualFallbackDeadlineAtMs;
      return {
        artifactMetadata: {},
        artifactPointers: {},
        phaseTimings: [],
      };
    },
    sqsClient: {
      async send() {
        return { $metadata: {} };
      },
    },
  });

  assert.equal(result.status, "completed");
  assert.ok(policySurfaceDeadlineAtMs);
  const expectedOffsetMs = 40_000 - LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS;
  assert.ok(policySurfaceDeadlineAtMs >= startedAtMs + expectedOffsetMs);
  assert.ok(policySurfaceDeadlineAtMs <= Date.now() + expectedOffsetMs);
  assert.equal(preConsentModuleDeadlineMs, 30_000);
  assert.equal(preConsentVisualFallbackDeadlineMs, 6_000);
  const expectedVisualFallbackOffsetMs = 40_000 -
    LOCAL_V2_DAG_LAMBDA_POLICY_SHUTDOWN_RESERVE_MS - 4_000;
  assert.ok(preConsentVisualFallbackDeadlineAtMs);
  assert.ok(preConsentVisualFallbackDeadlineAtMs >= startedAtMs + expectedVisualFallbackOffsetMs);
  assert.ok(preConsentVisualFallbackDeadlineAtMs <= Date.now() + expectedVisualFallbackOffsetMs);
});

test("a late partial scan can use artifact handoff reserve after scanner cancellation", async () => {
  let scannerSignal: AbortSignal | undefined;
  let artifactSignal: AbortSignal | undefined;
  const result = await handler(validPayload(), {
    artifactChainTimeoutMs: 1_000,
    handlerSafetyTimeoutMs: 20_000,
    resultPublishTimeoutMs: 100,
    scannerWorkTimeoutMs: 10,
    runArtifactChain: async (_payload, options) => {
      scannerSignal = options.signal;
      artifactSignal = options.artifactSignal;
      await new Promise((resolve) => setTimeout(resolve, 25));
      assert.equal(options.signal?.aborted, true);
      options.onScanCoreComplete?.();
      if (options.artifactSignal?.aborted) {
        throw options.artifactSignal.reason;
      }
      return {
        artifactMetadata: {},
        artifactPointers: {},
        phaseTimings: [{ durationMs: 25, label: "artifact_handoff", status: "completed" }],
      };
    },
    sqsClient: {
      async send() {
        return { $metadata: {} };
      },
    },
  });

  assert.equal(result.status, "completed");
  assert.equal(scannerSignal?.aborted, true);
  assert.equal(artifactSignal?.aborted, false);
});

test("handler uploads a bounded artifact-only failure diagnostic on scanner timeout", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
  const uploads: Array<{ body: string; key: string }> = [];
  try {
    const result = await handler(validPayload(), {
      artifactChainTimeoutMs: 30,
      handlerSafetyTimeoutMs: 10_000,
      resultPublishTimeoutMs: 100,
      scannerWorkTimeoutMs: 10,
      runArtifactChain: async () => await new Promise(() => undefined),
      s3Client: {
        async send(command: PutObjectCommand) {
          uploads.push({
            body: Buffer.from(command.input.Body as Uint8Array).toString("utf8"),
            key: String(command.input.Key),
          });
          return { $metadata: {} };
        },
      },
      sqsClient: {
        async send() {
          return { $metadata: {} };
        },
      },
    });
    assert.equal(result.status, "failed");
    assert.match(result.artifactPointers?.failureDiagnosticUri ?? "", /FailureDiagnostic\.json$/);
    assert.equal(uploads.length, 1);
    assert.ok(uploads[0]?.body.length && uploads[0].body.length < 20_000);
    assert.match(uploads[0]?.body ?? "", /certscore\.v2_lambda_failure_diagnostic\.2/);
    assert.match(uploads[0]?.body ?? "", /cancellationRequestedAt/);
    assert.match(uploads[0]?.body ?? "", /terminalPublicationReserveMs/);
    assert.doesNotMatch(uploads[0]?.body ?? "", /cookieValue|documentText|requestBody|nanoReasoning/i);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("handler retains bounded egress diagnostics for an immediate preflight failure", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
  const uploads: Array<{ body: string; key: string }> = [];
  try {
    const result = await handler(validPayload(), {
      handlerSafetyTimeoutMs: 10_000,
      resultPublishTimeoutMs: 100,
      runArtifactChain: async (_payload, options) => {
        await mkdir(options.artifactRoot, { recursive: true });
        await writeFile(path.join(options.artifactRoot, "EgressPreflight.json"), JSON.stringify({
          artifactVersion: "certscore.v2.lambda-egress-preflight.v1",
          attempts: [{
            durationMs: 42,
            error: "Egress probe provider checkip.amazonaws.com returned HTTP 503.",
            mode: "lightweight_proxy",
            observed: { ip: "203.0.113.42" },
            probeStatus: "failed",
            provider: "checkip.amazonaws.com",
            regionVerificationSource: "provider_observation",
          }],
          error: "Egress probe provider checkip.amazonaws.com returned HTTP 503.",
          expectedEgressPublicIpHash: "sha256:expected",
          expectedEgressRegion: "California",
          probeStatus: "failed",
          provider: "checkip.amazonaws.com",
          proxyModeEnabled: true,
          regionVerificationSource: "provider_observation",
        }));
        throw new Error("Required regional scanner egress preflight did not verify configured proxy and expected public region.");
      },
      s3Client: {
        async send(command: PutObjectCommand) {
          uploads.push({
            body: Buffer.from(command.input.Body as Uint8Array).toString("utf8"),
            key: String(command.input.Key),
          });
          return { $metadata: {} };
        },
      },
      sqsClient: {
        async send() {
          return { $metadata: {} };
        },
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(uploads.length, 1);
    const diagnostic = JSON.parse(uploads[0]!.body);
    assert.equal(diagnostic.artifactVersion, "certscore.v2_lambda_failure_diagnostic.2");
    assert.equal(diagnostic.egressPreflight.probeStatus, "failed");
    assert.equal(diagnostic.egressPreflight.attempts[0].provider, "checkip.amazonaws.com");
    assert.match(diagnostic.egressPreflight.attempts[0].observedPublicIpHash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(diagnostic).includes("203.0.113.42"), false);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("runtime worker retains a bounded failure diagnostic when no canonical partial bundle can be finalized", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
  const uploads: Array<{ body: string; key: string }> = [];
  try {
    const result = await handler(validPayload({
      orchestrationMode: "worker",
      workerLane: "runtime_evidence",
    }), {
      artifactChainTimeoutMs: 30,
      handlerSafetyTimeoutMs: 10_000,
      resultPublishTimeoutMs: 100,
      scannerWorkTimeoutMs: 10,
      runArtifactChain: async () => await new Promise(() => undefined),
      s3Client: {
        async send(command: PutObjectCommand) {
          uploads.push({
            body: Buffer.from(command.input.Body as Uint8Array).toString("utf8"),
            key: String(command.input.Key),
          });
          return { $metadata: {} };
        },
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.workerLane, "runtime_evidence");
    assert.equal(result.error?.code, "v2_dag_lambda_safety_timeout");
    assert.match(result.artifactPointers?.failureDiagnosticUri ?? "", /lanes\/runtime_evidence\/failure\/FailureDiagnostic\.json$/);
    assert.equal(uploads.length, 1);
    assert.match(uploads[0]?.body ?? "", /certscore\.v2_lambda_failure_diagnostic\.2/);
    assert.doesNotMatch(uploads[0]?.body ?? "", /cookieValue|documentText|requestBody|nanoReasoning/i);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

for (const workerLane of ["accept_observation", "reject_observation"] as const) {
  test(`${workerLane}: evidence validation failures return bounded terminal diagnostics without publishing a second report`, async () => {
    const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
    const uploads: string[] = [];
    let publications = 0;
    const failure = Object.assign(new Error("private-cookie-value in raw validation error"), {
      name: "ZodError", issues: [{ code: "too_small", path: ["storage", "preAction", 10, "name"], message: "private-cookie-value" }],
    });
    try {
      const result = await handler(validPayload({ orchestrationMode: "worker", workerLane, parentDispatchSha256: "e".repeat(64) }), {
        runArtifactChain: async () => { throw failure; },
        s3Client: { async send(command: PutObjectCommand) {
          uploads.push(Buffer.from(command.input.Body as Uint8Array).toString("utf8"));
          return { $metadata: {} };
        } },
        sqsClient: { async send() { publications++; return { $metadata: {} }; } },
      });
      assert.equal(result.status, "failed");
      assert.equal(result.workerLane, workerLane);
      assert.equal(result.error?.code, "v2_dag_lambda_evidence_invalid");
      assert.match(result.error?.message ?? "", /storage\.preAction\.\[10\]\.name.*too_small/);
      assert.ok((result.error?.message.length ?? 0) <= 500);
      assert.equal(uploads.length, 1);
      assert.equal(publications, 0, "Only the coordinator publishes the canonical report result");
      assert.match(result.artifactPointers?.failureDiagnosticUri ?? "", new RegExp(`lanes/${workerLane}/failure/FailureDiagnostic\\.json$`));
      assert.equal(JSON.stringify([result, uploads]).includes("private-cookie-value"), false);
      assert.equal(result.postAcceptEvidence, undefined);
      assert.equal(result.postRefusalEvidence, undefined);
    } finally {
      if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
      else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    }
  });
}

test("failure diagnostic upload errors do not suppress terminal publication", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
  let publicationCount = 0;
  try {
    const result = await handler(validPayload(), {
      artifactChainTimeoutMs: 30,
      handlerSafetyTimeoutMs: 10_000,
      resultPublishTimeoutMs: 100,
      scannerWorkTimeoutMs: 10,
      runArtifactChain: async () => await new Promise(() => undefined),
      s3Client: {
        async send() {
          throw new Error("simulated diagnostic upload failure");
        },
      },
      sqsClient: {
        async send() {
          publicationCount += 1;
          return { $metadata: {} };
        },
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.artifactPointers?.failureDiagnosticUri, undefined);
    assert.equal(publicationCount, 1);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("a stalled failure diagnostic upload cannot consume the terminal publication window", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "failure-diagnostic-test";
  let publicationCount = 0;
  const startedAtMs = Date.now();
  try {
    const result = await handler(validPayload(), {
      artifactChainTimeoutMs: 30,
      handlerSafetyTimeoutMs: 10_000,
      resultPublishTimeoutMs: 100,
      scannerWorkTimeoutMs: 10,
      runArtifactChain: async () => await new Promise(() => undefined),
      s3Client: {
        async send() {
          return await new Promise(() => undefined);
        },
      },
      sqsClient: {
        async send() {
          publicationCount += 1;
          return { $metadata: {} };
        },
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.artifactPointers?.failureDiagnosticUri, undefined);
    assert.equal(publicationCount, 1);
    assert.ok(Date.now() - startedAtMs < 2_500);
  } finally {
    if (previousBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
  }
});

test("terminal SQS publication is bounded and aborts the SDK call", async () => {
  let observedSignal: AbortSignal | undefined;
  const startedAt = Date.now();

  await assert.rejects(
    sendLocalV2DagLambdaResultMessage({
      message: {
        artifactOnly: true,
        completedAt: "2026-06-15T18:00:00.000Z",
        contractVersion: "certscore.v2.lambda-dag-result.v1",
        processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
        productionFindingIntegration: false,
        resultPurpose: "synthetic_verification",
        scanId: "scan-local-1",
        status: "failed",
        targetEnvironment: "local"
      },
      queueUrl: "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-local-results",
      sqsClient: {
        async send(_command, options) {
          observedSignal = options?.abortSignal;
          return await new Promise(() => undefined);
        }
      },
      timeoutMs: 10
    }),
    /internal safety deadline/
  );

  assert.equal(observedSignal?.aborted, true);
  assert.ok(Date.now() - startedAt < 500);
});

test("terminal SQS publication retries a stalled send within its total deadline", async () => {
  let sends = 0;
  await sendLocalV2DagLambdaResultMessage({
    attemptTimeoutMs: 15,
    maxAttempts: 2,
    message: {
      artifactOnly: true,
      completedAt: "2026-06-15T18:00:00.000Z",
      contractVersion: "certscore.v2.lambda-dag-result.v1",
      processor: LOCAL_V2_DAG_SCAN_PROCESSOR,
      productionFindingIntegration: false,
      resultPurpose: "synthetic_verification",
      scanId: "scan-local-retry",
      status: "completed",
      targetEnvironment: "local"
    },
    queueUrl: "https://sqs.eu-central-1.amazonaws.com/123/certscore-v2-dag-local-results",
    sqsClient: {
      async send() {
        sends += 1;
        if (sends === 1) return await new Promise(() => undefined);
        return { $metadata: {} };
      }
    },
    timeoutMs: 80
  });

  assert.equal(sends, 2);
});

test("handler evidence worker returns verified artifact pointers without publishing a terminal result", async () => {
  let sentMessages = 0;
  const result = await handler(validPayload({
    orchestrationMode: "worker",
    workerLane: "consent_proof"
  }), {
    runArtifactChain: async () => ({
      artifactMetadata: {
        scanArtifactUri: { sha256: "a".repeat(64), sizeBytes: 123 },
      },
      artifactPointers: {
        scanArtifactUri: "s3://certscore-v2-local-artifacts/v2/scan-local-1/lanes/consent_proof/CanonicalEvidenceBundle.json",
      },
      phaseTimings: [],
    }),
    sqsClient: {
      async send() {
        sentMessages += 1;
        return { $metadata: {} };
      }
    }
  });

  assert.equal(result.status, "completed");
  assert.equal(result.workerLane, "consent_proof");
  assert.equal(result.artifactPointers?.scanArtifactUri?.includes("consent_proof"), true);
  assert.equal(sentMessages, 0);
});

test("handler GPC worker returns the exact parent dispatch checksum", async () => {
  const parent = parseLocalV2DagLambdaDispatchPayload(validPayload({
    gpcObservation: {
      contractVersion: "certscore.gpc-observation-dispatch.v1",
      enabled: true,
      pairWithLane: "runtime_evidence",
      protocol: "passive_baseline_with_sec_gpc",
    },
    orchestrationMode: "sharded",
  }));
  const parentDispatchSha256 = postRefusalParentDispatchSha256(parent);
  const result = await handler(validPayload({
    gpcObservation: parent.gpcObservation,
    orchestrationMode: "worker",
    parentDispatchSha256,
    workerLane: "gpc_observation",
  }), {
    runArtifactChain: async () => ({
      artifactMetadata: {
        scanArtifactUri: { sha256: "a".repeat(64), sizeBytes: 123 },
      },
      artifactPointers: {
        scanArtifactUri: "s3://certscore-v2-local-artifacts/v2/scan-local-1/lanes/gpc_observation/CanonicalEvidenceBundle.json",
      },
      phaseTimings: [],
    }),
  });

  assert.equal(result.status, "completed");
  assert.equal(result.workerLane, "gpc_observation");
  assert.equal(result.parentDispatchSha256, parentDispatchSha256);
});

test("policy evidence worker completes the verified early handoff without publishing a terminal result", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "certscore-test-artifacts";
  const sentMessages: string[] = [];
  let uploadedObjects = 0;
  try {
    const result = await handler(validPayload({
      orchestrationMode: "worker",
      workerLane: "policy_evidence",
    }), {
      runArtifactChain: async (_payload, runOptions) => {
        runOptions.onPolicySurfaceComplete?.({
          artifactRefs: [],
          moduleRun: {
            moduleName: "policySurfaceScanner",
            status: "completed",
            startedAt: "2026-08-04T20:00:00.000Z",
            completedAt: "2026-08-04T20:00:01.000Z",
            durationMs: 1_000,
            evidenceRefs: [],
            errors: [],
          },
          policySurfaceObservations: [],
        });
        return {
          artifactMetadata: {
            scanArtifactUri: { sha256: "a".repeat(64), sizeBytes: 123 },
          },
          artifactPointers: {
            scanArtifactUri: "s3://certscore-test-artifacts/v2/scan-local-1/lanes/policy_evidence/CanonicalEvidenceBundle.json",
          },
          phaseTimings: [],
        };
      },
      s3Client: {
        async send() {
          uploadedObjects += 1;
          return { $metadata: {} };
        },
      },
      sqsClient: {
        async send(command: SendMessageCommand) {
          sentMessages.push(String(command.input.MessageBody));
          return { $metadata: {} };
        },
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(result.workerLane, "policy_evidence");
    assert.equal(uploadedObjects, 1);
    assert.equal(sentMessages.length, 1);
    const message = JSON.parse(sentMessages[0] ?? "{}") as Record<string, unknown>;
    assert.equal(message.messageKind, "policy_evidence_ready");
    assert.equal(String(message.artifactPointer).includes("/lanes/policy_evidence/"), true);
  } finally {
    if (previousBucket === undefined) {
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    } else {
      process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    }
  }
});

test("runtime evidence worker completes the six-second preview handoff without waiting for its terminal bundle", async () => {
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "certscore-test-artifacts";
  const sentMessages: string[] = [];
  let uploadedObjects = 0;
  try {
    const preview = buildPreConsentRuntimePreview(canonicalBundleFixture("scan-local-1"));
    let previewCallbackReturnedBeforeArtifactChain = false;
    const result = await handler(validPayload({
      orchestrationMode: "worker",
      workerLane: "runtime_evidence",
    }), {
      runArtifactChain: async (_payload, runOptions) => {
        runOptions.onRuntimePreviewComplete?.(preview);
        previewCallbackReturnedBeforeArtifactChain = true;
        return {
          artifactMetadata: {
            scanArtifactUri: { sha256: "a".repeat(64), sizeBytes: 123 },
          },
          artifactPointers: {
            scanArtifactUri: "s3://certscore-test-artifacts/v2/scan-local-1/lanes/runtime_evidence/CanonicalEvidenceBundle.json",
          },
          phaseTimings: [],
        };
      },
      s3Client: {
        async send() {
          uploadedObjects += 1;
          return { $metadata: {} };
        },
      },
      sqsClient: {
        async send(command: SendMessageCommand) {
          sentMessages.push(String(command.input.MessageBody));
          return { $metadata: {} };
        },
      },
    });

    assert.equal(previewCallbackReturnedBeforeArtifactChain, true);
    assert.equal(result.status, "completed");
    assert.equal(result.workerLane, "runtime_evidence");
    assert.equal(uploadedObjects, 1);
    assert.equal(sentMessages.length, 1);
    const message = JSON.parse(sentMessages[0] ?? "{}") as Record<string, unknown>;
    assert.equal(message.messageKind, "runtime_preview_ready");
    assert.equal(String(message.artifactPointer).includes("/lanes/runtime_evidence/"), true);
  } finally {
    if (previousBucket === undefined) {
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    } else {
      process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    }
  }
});

test("sharded bundle merge preserves existing consent comparisons without synthesizing new ones", () => {
  const existingComparison = {
    comparisonId: "consent_comparison_existing",
    comparedScenarios: "after_reject_vs_after_accept",
    comparableMeasurement: {
      comparable: false,
      reason: "worker_comparison_retained",
      preActionWindow: {
        completedAtMs: 1,
        consentStateAtEnd: "post_reject",
        cookieEventCount: 0,
        networkEventCount: 0,
        scenario: "reject_all_flow",
        startedAtMs: 0
      },
      postActionWindow: {
        completedAtMs: 1,
        consentStateAtEnd: "post_accept",
        cookieEventCount: 0,
        networkEventCount: 0,
        scenario: "accept_all_flow",
        startedAtMs: 0
      }
    },
    confidence: 0.25,
    sourceModulesPresent: ["consentFlowRuntimeScanner"],
    sourceModulesRequired: ["consentFlowRuntimeScanner"]
  } as const;
  const merged = mergeLocalV2DagLambdaShardBundles({
    base: canonicalBundleFixture("scan-local-1"),
    scanId: "scan-local-1",
    workerBundles: [
      canonicalBundleFixture("scan-local-1_accept_gpc", {
        consentActionAttempts: [actionAttempt("accept_all_flow", "accept_all", false)],
        consentFlowObservations: [consentObservation("accept_all_flow")],
        consentFlowComparisons: [existingComparison]
      }),
      canonicalBundleFixture("scan-local-1_reject_manage", {
        consentActionAttempts: [actionAttempt("reject_all_flow", "reject_all", false)],
        consentFlowObservations: [consentObservation("reject_all_flow")]
      })
    ]
  });

  const comparison = merged.consentFlowComparisons.find((candidate) =>
    candidate.comparedScenarios === "after_reject_vs_after_accept"
  );
  assert.ok(comparison);
  assert.equal(comparison.comparisonId, "consent_comparison_existing");
  assert.equal(comparison.comparableMeasurement?.comparable, false);
  assert.equal(comparison.comparableMeasurement?.reason, "worker_comparison_retained");
});

test("three-lane merge keeps consent visuals, runtime coverage, and policy evidence in their canonical domains", () => {
  const artifactRoot = "/tmp/certscore-three-lane-test";
  const runtimeCoverage = {
    coverageStatus: "usable" as const,
    fallbackModesUsed: [],
    limitationKeys: [],
    notes: [],
    observationCounts: {
      cookieEvents: 0,
      cookiesBeforeConsent: 0,
      networkEvents: 0,
      normalizedVendors: 0,
      observedJourneys: 0,
      thirdPartyRequests: 0,
    },
    silentEmpty: false,
  };
  const policyObservation = {
    observationId: "policy_surface_privacy",
    surfaceType: "privacy_policy" as const,
    url: "https://example.com/privacy",
    normalizedUrl: "https://example.com/privacy",
    status: "observed" as const,
    documentFetchState: "not_attempted" as const,
    confidence: 0.95,
    directVsInferred: "direct" as const,
  };
  const merged = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot,
    scanId: "scan-local-1",
    consentProof: canonicalBundleFixture("scan-local-1", {
      collectionSurfaceInventory: collectionSurfaceInventoryFixture("consent-lane-form"),
      siteIntegrityObservation: { ...siteIntegrityObservationFixture, documentToken: "consent-document" },
      automatedAccessObservation: {
        status: "available",
        version: "automated-access-observation-v1",
        productionProjectable: false,
        webBotAuth: {
          enabled: true,
          signingOutcome: "applied",
          signedHttpsRequestCount: 3,
          signedNavigationRequestCount: 1,
        },
        targetInfrastructure: {
          cloudflareObserved: false,
          providerCandidates: ["akamai"],
          signalCodes: ["main_document_provider:akamai"],
        },
      },
      scanLaneRuns: [laneRunFixture("consent_proof", "invoke-consent")],
      screenshots: [screenshotArtifact(
        "screenshot_pre_consent_settled",
        "/tmp/worker-consent/screenshot-pre-consent-settled.png",
      )],
      derivedRuntimeSignals: {
        preConsentTrackingObserved: false,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: false,
        consentBannerLikelyPresent: true,
      },
    }),
    runtimeEvidence: canonicalBundleFixture("scan-local-1", {
      collectionSurfaceInventory: collectionSurfaceInventoryFixture("runtime-lane-form"),
      siteIntegrityObservation: { ...siteIntegrityObservationFixture, documentToken: "runtime-document" },
      automatedAccessObservation: {
        status: "available",
        version: "automated-access-observation-v1",
        productionProjectable: false,
        webBotAuth: {
          enabled: true,
          signingOutcome: "applied",
          signedHttpsRequestCount: 24,
          signedNavigationRequestCount: 2,
        },
        targetInfrastructure: {
          cloudflareObserved: true,
          providerCandidates: ["cloudflare"],
          signalCodes: ["cloudflare_cf_ray_header", "main_document_provider:cloudflare"],
        },
      },
      scanLaneRuns: [laneRunFixture("runtime_evidence", "invoke-runtime")],
      artifactRefs: [{
        artifactId: "runtime_debug",
        artifactType: "json",
        path: "/tmp/worker-runtime/runtime-evidence.json",
        redactionStatus: "not_needed",
        relatedEventIds: [],
        sensitivity: "safe",
      }],
      networkEvents: [{
        eventId: "network_onetrust_stub",
        eventType: "network_request",
        timestampMs: 10,
        sourceScanner: "pre_consent_runtime",
        scenario: "fresh_pre_consent",
        consentStateAtTime: "pre_consent",
        pagePhase: "initial_navigation",
        evidenceRefs: [],
        confidence: 0.95,
        directVsInferred: "direct",
        requestId: "request_onetrust_stub",
        method: "GET",
        requestUrl: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
        path: "/scripttemplates/otSDKStub.js",
      }] as CanonicalEvidenceBundle["networkEvents"],
      runtimeCoverage,
      derivedRuntimeSignals: {
        preConsentTrackingObserved: true,
        sessionReplayOrBehavioralAnalyticsObserved: false,
        thirdPartyCookiesPreConsentObserved: false,
        thirdPartyVendorsObserved: true,
      },
    }),
    policyEvidence: canonicalBundleFixture("scan-local-1", {
      collectionSurfaceInventory: collectionSurfaceInventoryFixture("policy-lane-form"),
      policySurfaceInspection: derivePolicySurfaceInspectionOutcome({californiaReviewPolicy:"california-privacy-review.v10",californiaDisclosureChoicePolicy:"california.disclosure-choice.v1"}),
      siteIntegrityObservation: { ...siteIntegrityObservationFixture, documentToken: "policy-document" },
      scanLaneRuns: [laneRunFixture("policy_evidence", "invoke-policy")],
      artifactRefs: [{
        artifactId: "policy_surface_text_privacy",
        artifactType: "other",
        path: "/tmp/worker-policy/policy_surface_text_privacy.txt",
        redactionStatus: "not_needed",
        relatedEventIds: [],
        sensitivity: "safe",
      }],
      policySurfaceObservations: [policyObservation],
    }),
  });

  assert.equal(merged.scanProfile.label, "Three-lane consent, runtime, and policy scan");
  assert.deepEqual(
    merged.scanLaneRuns.map((lane) => [lane.laneId, lane.physicalInvocationId]),
    [
      ["consent_proof", "invoke-consent"],
      ["runtime_evidence", "invoke-runtime"],
      ["policy_evidence", "invoke-policy"],
    ],
  );
  assert.equal(merged.screenshots[0]?.path, path.join(artifactRoot, "screenshot-pre-consent-settled.png"));
  assert.equal(merged.derivedRuntimeSignals.consentBannerLikelyPresent, true);
  assert.equal(merged.derivedRuntimeSignals.preConsentTrackingObserved, true);
  assert.equal(merged.runtimeCoverage?.coverageStatus, "usable");
  assert.equal(merged.collectionSurfaceInventory?.forms[0]?.title, "runtime-lane-form");
  assert.equal(merged.siteIntegrityObservation?.documentToken, "runtime-document");
  assert.deepEqual(merged.automatedAccessObservation, {
    status: "available",
    version: "automated-access-observation-v1",
    productionProjectable: false,
    webBotAuth: {
      enabled: true,
      signingOutcome: "applied",
      signedHttpsRequestCount: 24,
      signedNavigationRequestCount: 2,
    },
    targetInfrastructure: {
      cloudflareObserved: true,
      providerCandidates: ["cloudflare"],
      signalCodes: ["cloudflare_cf_ray_header", "main_document_provider:cloudflare"],
    },
  });
  assert.equal(merged.networkEvents[0]?.path, "/scripttemplates/otSDKStub.js");
  assert.equal(merged.policySurfaceObservations[0]?.observationId, "policy_surface_privacy");
  assert.equal(merged.policySurfaceInspection?.californiaDisclosureChoicePolicy,"california.disclosure-choice.v1");
  assert.equal(merged.scanEvidenceLaneAssessment?.lanes.homepageRuntime, "usable");
  assert.equal(merged.scanEvidenceLaneAssessment?.lanes.consent, "limited");
  assert.deepEqual(
    merged.scanEvidenceLaneAssessment?.limitationKeys.filter((key) => key.startsWith("consent_")),
    ["consent_control_inventory_incomplete"],
  );
  assert.equal(
    merged.artifactRefs.find((reference) => reference.artifactId === "runtime_debug")?.path,
    path.join(artifactRoot, "worker-runtime_evidence-runtime-evidence.json"),
  );
  assert.equal(
    merged.artifactRefs.find((reference) => reference.artifactId === "policy_surface_text_privacy")?.path,
    path.join(artifactRoot, "policy_surface_text_privacy.txt"),
  );
});

test("three-lane merge marks an empty consent-proof lane not testable", () => {
  const runtimeCoverage = {
    coverageStatus: "usable" as const,
    fallbackModesUsed: [],
    limitationKeys: [],
    notes: [],
    observationCounts: {
      cookieEvents: 0,
      cookiesBeforeConsent: 0,
      networkEvents: 1,
      normalizedVendors: 0,
      observedJourneys: 0,
      thirdPartyRequests: 0,
    },
    silentEmpty: false,
  };
  const merged = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/certscore-three-lane-empty-consent",
    scanId: "scan-empty-consent",
    consentProof: canonicalBundleFixture("scan-empty-consent", {
      visualCapture: {
        status: "unavailable",
        failureReason: "unknown",
        artifactRefs: [],
        notes: ["Consent lane reached its deadline."],
      },
    }),
    runtimeEvidence: canonicalBundleFixture("scan-empty-consent", {
      consentUiObservations: [{
        observationId: "runtime-lane-must-not-fill-consent-proof",
        observedAtMs: 1_000,
        likelyPresent: true,
        basis: ["runtime_lane_only"],
        textExcerpt: "Aceitar todos Rejeitar todos Preferências",
        layerInspected: "first_layer",
        visibleChoiceLabels: ["Aceitar todos", "Rejeitar todos", "Preferências"],
        acceptControlObserved: true,
        rejectControlObserved: true,
        managePreferencesControlObserved: true,
        controls: [],
        evidenceRefs: [],
        confidence: 0.95,
      }],
      runtimeCoverage,
    }),
    policyEvidence: canonicalBundleFixture("scan-empty-consent"),
  });

  assert.equal(merged.scanEvidenceLaneAssessment?.lanes.consent, "not_testable");
  assert.ok(merged.scanEvidenceLaneAssessment?.limitationKeys.includes(
    "representative_pre_consent_screenshot_unavailable",
  ));
  assert.ok(merged.scanEvidenceLaneAssessment?.limitationKeys.includes(
    "consent_control_inventory_incomplete",
  ));
  assert.deepEqual(
    merged.consentUiObservations,
    [],
    "runtime-lane consent-like observations must not fill an empty consent-proof lane",
  );
});

test("three-lane merge treats unretained moderated imagery as unavailable consent proof", () => {
  const withheldScreenshot: ScreenshotArtifact = {
    ...screenshotArtifact(
      "screenshot_pre_consent_settled",
      "/tmp/worker-consent/screenshot-pre-consent-settled.png",
    ),
    displayStatus: "withheld",
    displayWithheldReason: "safety_check_unavailable",
    retentionStatus: "withheld",
    safetyFailureCode: "finalization_deadline_exceeded",
    withheldReason: "safety_check_unavailable",
  };
  const merged = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/certscore-three-lane-withheld-consent",
    scanId: "scan-withheld-consent",
    consentProof: canonicalBundleFixture("scan-withheld-consent", {
      homepageScreenshot: {
        status: "withheld",
        reason: "safety_check_unavailable",
        failureCode: "finalization_deadline_exceeded",
      },
      scanLaneRuns: [laneRunFixture("consent_proof", "invoke-consent-withheld")],
      screenshots: [withheldScreenshot],
      visualCapture: {
        status: "available",
        captureMethod: "primary_full_page",
        artifactRefs: [],
        notes: [],
      },
    }),
    runtimeEvidence: canonicalBundleFixture("scan-withheld-consent", {
      scanLaneRuns: [laneRunFixture("runtime_evidence", "invoke-runtime-success")],
      runtimeCoverage: {
        coverageStatus: "usable",
        fallbackModesUsed: [],
        limitationKeys: [],
        notes: [],
        observationCounts: {
          cookieEvents: 0,
          cookiesBeforeConsent: 0,
          networkEvents: 1,
          normalizedVendors: 0,
          observedJourneys: 0,
          thirdPartyRequests: 0,
        },
        silentEmpty: false,
      },
    }),
    policyEvidence: canonicalBundleFixture("scan-withheld-consent"),
  });

  assert.equal(merged.scanEvidenceLaneAssessment?.lanes.consent, "limited");
  assert.equal(merged.scanEvidenceLaneAssessment?.limitationKeys.includes(
    "representative_pre_consent_screenshot_unavailable",
  ), true);
  assert.deepEqual(merged.homepageScreenshot, {
    status: "withheld",
    reason: "safety_check_unavailable",
    failureCode: "finalization_deadline_exceeded",
  });
});

test("three-lane merge keeps lane-local access failures limited when the independent required lane reached a representative page", () => {
  const usableRuntimeCoverage = {
    coverageStatus: "usable" as const,
    fallbackModesUsed: [],
    limitationKeys: [],
    notes: [],
    observationCounts: {
      cookieEvents: 0,
      cookiesBeforeConsent: 0,
      networkEvents: 4,
      normalizedVendors: 0,
      observedJourneys: 0,
      thirdPartyRequests: 0,
    },
    silentEmpty: false,
  };
  const unavailableRuntimeCoverage = {
    ...usableRuntimeCoverage,
    coverageStatus: "limited_none" as const,
    limitationKeys: ["navigation_transport_failure"],
  };
  const runtimeNoGo = terminalLaneNoGo("navigation_transport_failure");
  const runtimeVisualNoGo = terminalLaneVisualNoGo("navigation_transport_failure", "capture_failed");
  const consentScreenshot = screenshotArtifact(
    "screenshot_pre_consent_settled",
    "/tmp/worker-consent/screenshot-pre-consent-settled.png",
  );
  const runtimeFailed = {
    ...laneRunFixture("runtime_evidence", "invoke-runtime-failed"),
    firstHttpStatus: null,
    executionOutcome: "failed" as const,
    accessOutcome: "navigation_failed" as const,
  };

  const runtimeLimited = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/certscore-three-lane-runtime-disagreement",
    scanId: "scan-runtime-disagreement",
    consentProof: canonicalBundleFixture("scan-runtime-disagreement", {
      scanLaneRuns: [laneRunFixture("consent_proof", "invoke-consent-success")],
      screenshots: [consentScreenshot],
      visualCapture: {
        status: "available",
        captureMethod: "primary_full_page",
        artifactRefs: [],
        notes: [],
      },
    }),
    runtimeEvidence: canonicalBundleFixture("scan-runtime-disagreement", {
      scanLaneRuns: [runtimeFailed],
      runtimeCoverage: unavailableRuntimeCoverage,
      scanNoGoAssessment: runtimeNoGo,
      scan_no_go_assessment: runtimeNoGo,
      visualAccessReview: runtimeVisualNoGo,
      visual_access_review: runtimeVisualNoGo,
    }),
    policyEvidence: canonicalBundleFixture("scan-runtime-disagreement"),
  });

  assert.equal(runtimeLimited.scanNoGoAssessment?.decision, "continue_with_diagnostics");
  assert.ok(runtimeLimited.scanNoGoAssessment?.contradictorCodes.includes(
    "independent_consent_proof_representative_page",
  ));
  assert.equal(runtimeLimited.visualAccessReview?.go_no_go, "NO_GO");
  assert.equal(runtimeLimited.scanEvidenceLaneAssessment?.outcome, "partial_with_diagnostics");
  assert.equal(runtimeLimited.scanEvidenceLaneAssessment?.lanes.homepageRuntime, "unusable");
  assert.ok(runtimeLimited.scanEvidenceLaneAssessment?.limitationKeys.includes(
    "evidence_lane_access_disagreement",
  ));

  const consentNoGo = terminalLaneNoGo("blank_or_unusable_page");
  const consentVisualNoGo = terminalLaneVisualNoGo("blank_or_unusable_page", "blank_or_unusable");
  const consentBlocked = {
    ...laneRunFixture("consent_proof", "invoke-consent-blank"),
    accessOutcome: "blank_or_unusable" as const,
  };
  const consentLimited = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/certscore-three-lane-consent-disagreement",
    scanId: "scan-consent-disagreement",
    consentProof: canonicalBundleFixture("scan-consent-disagreement", {
      scanLaneRuns: [consentBlocked],
      screenshots: [consentScreenshot],
      visualCapture: {
        status: "available",
        captureMethod: "primary_full_page",
        artifactRefs: [],
        notes: [],
      },
      scanNoGoAssessment: consentNoGo,
      scan_no_go_assessment: consentNoGo,
      visualAccessReview: consentVisualNoGo,
      visual_access_review: consentVisualNoGo,
    }),
    runtimeEvidence: canonicalBundleFixture("scan-consent-disagreement", {
      scanLaneRuns: [laneRunFixture("runtime_evidence", "invoke-runtime-success")],
      runtimeCoverage: usableRuntimeCoverage,
      domSnapshots: [runtimeSnapshotFixture()],
    }),
    policyEvidence: canonicalBundleFixture("scan-consent-disagreement"),
  });

  assert.equal(consentLimited.scanNoGoAssessment?.decision, "continue_with_diagnostics");
  assert.ok(consentLimited.scanNoGoAssessment?.contradictorCodes.includes(
    "independent_runtime_evidence_representative_page",
  ));
  assert.equal(consentLimited.scanEvidenceLaneAssessment?.outcome, "partial_with_diagnostics");
  assert.equal(consentLimited.scanEvidenceLaneAssessment?.lanes.homepageRuntime, "usable");
  assert.equal(consentLimited.scanEvidenceLaneAssessment?.lanes.consent, "limited");
  assert.deepEqual(
    consentLimited.consentUiObservations,
    [],
    "runtime success must not synthesize consent controls for the limited consent-proof lane",
  );

  for (const snapshots of [[], [{...runtimeSnapshotFixture(),textExcerpt:""}],
    [{...runtimeSnapshotFixture(),documentIdentity:undefined}],
    [runtimeSnapshotFixture(),{...runtimeSnapshotFixture(),capturedAtMs:200,textExcerpt:""}]]) {
    const unresolved = mergeLocalV2DagLambdaEvidenceLaneBundles({
      artifactRoot:"/tmp/u1-regression",scanId:"u1-regression",
      consentProof:canonicalBundleFixture("u1-regression",{scanNoGoAssessment:consentNoGo,scan_no_go_assessment:consentNoGo}),
      runtimeEvidence:canonicalBundleFixture("u1-regression",{runtimeCoverage:usableRuntimeCoverage,
        scanLaneRuns:[laneRunFixture("runtime_evidence","old-producer-http-success")],domSnapshots:snapshots}),
      policyEvidence:canonicalBundleFixture("u1-regression"),
    });
    assert.equal(unresolved.scanNoGoAssessment?.decision,"no_go","bare/stale runtime label cannot override positive consent no-go");
    assert.equal(unresolved.scanEvidenceLaneAssessment?.outcome,"no_go");
    assert.ok(!unresolved.scanNoGoAssessment?.contradictorCodes.includes("independent_runtime_evidence_representative_page"));
  }

  const bothLanesNoGo = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/certscore-three-lane-both-no-go",
    scanId: "scan-both-no-go",
    consentProof: canonicalBundleFixture("scan-both-no-go", {
      scanLaneRuns: [consentBlocked],
      screenshots: [consentScreenshot],
      visualCapture: {
        status: "available",
        captureMethod: "primary_full_page",
        artifactRefs: [],
        notes: [],
      },
      scanNoGoAssessment: consentNoGo,
      scan_no_go_assessment: consentNoGo,
      visualAccessReview: consentVisualNoGo,
      visual_access_review: consentVisualNoGo,
    }),
    runtimeEvidence: canonicalBundleFixture("scan-both-no-go", {
      scanLaneRuns: [laneRunFixture("runtime_evidence", "invoke-runtime-no-go")],
      runtimeCoverage: usableRuntimeCoverage,
      scanNoGoAssessment: runtimeNoGo,
      scan_no_go_assessment: runtimeNoGo,
      visualAccessReview: runtimeVisualNoGo,
      visual_access_review: runtimeVisualNoGo,
    }),
    policyEvidence: canonicalBundleFixture("scan-both-no-go"),
  });

  assert.equal(bothLanesNoGo.scanNoGoAssessment?.decision, "no_go");
  assert.notEqual(bothLanesNoGo.scanEvidenceLaneAssessment?.outcome, "partial_with_diagnostics");
});

test("sharded bundle merge retains exactly one diagnostic screenshot", () => {
  const merged = mergeLocalV2DagLambdaShardBundles({
    base: canonicalBundleFixture("scan-local-1", {
      screenshots: [
        screenshotArtifact("screenshot_pre_consent", "scan-local-1/screenshot-pre-consent.png"),
        screenshotArtifact("screenshot_pre_consent_settled", "scan-local-1/screenshot-pre-consent-settled.png")
      ]
    }),
    scanId: "scan-local-1",
    workerBundles: [
      canonicalBundleFixture("scan-local-1_accept_gpc", {
        screenshots: [screenshotArtifact("screenshot_accept_all_flow_after_action", "scan-local-1_accept_gpc/screenshot-after.png")]
      }),
      canonicalBundleFixture("scan-local-1_reject_manage", {
        screenshots: [screenshotArtifact("screenshot_reject_all_flow_after_action", "scan-local-1_reject_manage/screenshot-after.png")]
      })
    ]
  });

  assert.equal(merged.screenshots.length, 1);
  assert.equal(merged.screenshots[0]?.artifactId, "screenshot_pre_consent_settled");
});

test("sharded bundle merge keeps the fetched policy observation over its earlier link candidate", () => {
  const candidate = {
    observationId: "policy_surface_privacy",
    surfaceType: "privacy_policy" as const,
    url: "https://example.com/privacy",
    normalizedUrl: "https://example.com/privacy",
    status: "observed" as const,
    documentFetchState: "not_attempted" as const,
    confidence: 0.95,
    directVsInferred: "direct" as const,
  };
  const fetched = {
    ...candidate,
    status: "fetched" as const,
    documentFetchState: "fetched" as const,
    documentEvaluationState: "usable" as const,
    documentRole: "policy_document" as const,
    targetRelationship: "target_controller" as const,
    contentCoverage: {
      status: "complete" as const,
      sourceTextChars: 1_200,
      extractedSectionCount: 3,
      retainedSectionCount: 3,
      retainedTableRowCount: 0,
      limitationKeys: [],
    },
    documentTextCoverage: {
      status: "complete" as const,
      sourceTextChars: 1_200,
      retainedTextChars: 1_200,
      limitationKeys: [],
    },
    textExcerpt: "This privacy policy explains how we process and retain personal information.",
    artifactRefs: [{
      artifactId: "policy_surface_text_privacy",
      artifactType: "other" as const,
      path: "policy_surface_text_privacy.txt",
    }],
  };
  const merged = mergeLocalV2DagLambdaShardBundles({
    base: canonicalBundleFixture("scan-local-1", { policySurfaceObservations: [candidate] }),
    scanId: "scan-local-1",
    workerBundles: [
      canonicalBundleFixture("scan-local-1_policy", { policySurfaceObservations: [fetched] }),
    ],
  });

  assert.equal(merged.policySurfaceObservations.length, 1);
  assert.equal(merged.policySurfaceObservations[0]?.status, "fetched");
  assert.equal(merged.policySurfaceObservations[0]?.documentEvaluationState, "usable");
  assert.equal(merged.policySurfaceObservations[0]?.artifactRefs.length, 1);
  assert.equal(merged.policySurfaceObservations[0]?.targetRelationship, "target_controller");
  assert.equal(
    merged.policySurfaceObservations[0]?.governingPolicySelection?.state,
    "primary",
  );
});

test("artifact uploader returns durable metadata for all v2 JSON artifacts", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-test-"));
  const files = {
    manifestPath: path.join(tmp, "LocalV2DagLambdaManifest.json"),
    scanArtifactPath: path.join(tmp, "CanonicalEvidenceBundle.json")
  };
  await Promise.all(Object.entries(files).map(([name, filePath]) => writeFile(filePath, JSON.stringify({ name }), "utf8")));
  const pointers = artifactPointersFromS3Keys({
    bucket: "certscore-v2-local-artifacts",
    keyPrefix: "v2-dag-lambda/local/scan-local-1",
    manifestFileName: "LocalV2DagLambdaManifest.json",
    scanArtifactFileName: "CanonicalEvidenceBundle.json"
  });
  const puts: Array<{ bucket: string | undefined; key: string | undefined }> = [];

  const metadata = await uploadArtifactFiles({
    ...files,
    payload: validPayload(),
    pointers,
    s3Client: {
      async send(command: PutObjectCommand) {
        puts.push({
          bucket: command.input.Bucket,
          key: command.input.Key
        });
        return { $metadata: {} };
      }
    }
  });

  assert.equal(puts.length, 2);
  assert.ok(puts.every((put) => put.bucket === "certscore-v2-local-artifacts"));
  assert.ok(puts.some((put) => put.key?.endsWith("/CanonicalEvidenceBundle.json")));
  assert.ok(puts.some((put) => put.key?.endsWith("/LocalV2DagLambdaManifest.json")));
  assert.equal(typeof metadata.scanArtifactUri?.sha256, "string");
  assert.ok((metadata.scanArtifactUri?.sizeBytes ?? 0) > 0);
  assert.equal(metadata.reviewArtifactUri, undefined);
  assert.equal(metadata.reportAdapterArtifactUri, undefined);
});

test("artifact uploader retries a stalled canonical upload", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-upload-retry-test-"));
  const files = {
    manifestPath: path.join(tmp, "LocalV2DagLambdaManifest.json"),
    scanArtifactPath: path.join(tmp, "CanonicalEvidenceBundle.json")
  };
  await Promise.all(Object.values(files).map((filePath) => writeFile(filePath, "{}", "utf8")));
  const pointers = artifactPointersFromS3Keys({
    bucket: "certscore-v2-local-artifacts",
    keyPrefix: "v2-dag-lambda/local/scan-local-retry",
    manifestFileName: "LocalV2DagLambdaManifest.json",
    scanArtifactFileName: "CanonicalEvidenceBundle.json"
  });
  let sends = 0;

  const metadata = await uploadArtifactFiles({
    ...files,
    attemptTimeoutMs: 15,
    fields: ["scanArtifactUri"],
    maxAttempts: 2,
    payload: validPayload(),
    pointers,
    s3Client: {
      async send() {
        sends += 1;
        if (sends === 1) return await new Promise(() => undefined);
        return { $metadata: {} };
      }
    }
  });

  assert.equal(sends, 2);
  assert.ok(metadata.scanArtifactUri);
});

test("artifact uploader can upload scan and manifest JSON independently for overlapped handoff", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-split-upload-test-"));
  const files = {
    manifestPath: path.join(tmp, "LocalV2DagLambdaManifest.json"),
    scanArtifactPath: path.join(tmp, "CanonicalEvidenceBundle.json")
  };
  await Promise.all(Object.entries(files).map(([name, filePath]) => writeFile(filePath, JSON.stringify({ name }), "utf8")));
  const pointers = artifactPointersFromS3Keys({
    bucket: "certscore-v2-local-artifacts",
    keyPrefix: "v2-dag-lambda/local/scan-local-split",
    manifestFileName: "LocalV2DagLambdaManifest.json",
    scanArtifactFileName: "CanonicalEvidenceBundle.json"
  });
  const puts: string[] = [];
  const s3Client = {
    async send(command: PutObjectCommand) {
      puts.push(command.input.Key ?? "");
      return { $metadata: {} };
    }
  };

  const scanMetadata = await uploadArtifactFiles({
    ...files,
    fields: ["scanArtifactUri"],
    payload: validPayload(),
    pointers,
    s3Client
  });
  const manifestMetadata = await uploadArtifactFiles({
    ...files,
    fields: ["manifestUri"],
    payload: validPayload(),
    pointers,
    s3Client
  });

  assert.deepEqual(puts.map((key) => path.basename(key)), [
    "CanonicalEvidenceBundle.json",
    "LocalV2DagLambdaManifest.json"
  ]);
  assert.ok(scanMetadata.scanArtifactUri);
  assert.equal(scanMetadata.manifestUri, undefined);
  assert.ok(manifestMetadata.manifestUri);
  assert.equal(manifestMetadata.scanArtifactUri, undefined);
});

test("auxiliary uploader returns durable metadata for bounded internal JSON artifacts", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-aux-test-"));
  await writeFile(path.join(tmp, "CanonicalEvidenceBundle.json"), JSON.stringify({ core: true }), "utf8");
  await writeFile(path.join(tmp, "ConsentControlGeometryEvidence.json"), JSON.stringify({ artifactOnly: true }), "utf8");
  await writeFile(path.join(tmp, "consent_scenario_plan.json"), JSON.stringify({ plan: true }), "utf8");
  await writeFile(path.join(tmp, "consent_scenario_execution.json"), JSON.stringify({ execution: true }), "utf8");
  await writeFile(path.join(tmp, "policy_surface_text_fixture.txt"), "bounded retained privacy policy text", "utf8");
  await writeFile(path.join(tmp, "screenshot-pre-consent.png"), "not-json", "utf8");
  await writeFile(path.join(tmp, "screenshot-pre-consent-geometry-proof.png"), "not-json", "utf8");
  await writeFile(path.join(tmp, "screenshot-pre-consent-full-page.jpg"), "not-a-real-jpeg", "utf8");
  const puts: Array<{ bucket: string | undefined; contentType: string | undefined; key: string | undefined }> = [];
  const previousBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  const previousPrefix = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "certscore-v2-local-artifacts";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX = "v2-dag-lambda/local";
  try {
    const artifacts = await uploadAuxiliaryArtifactFiles({
      artifactRoot: tmp,
      payload: validPayload(),
      s3Client: {
        async send(command: PutObjectCommand) {
          puts.push({
            bucket: command.input.Bucket,
            contentType: command.input.ContentType,
            key: command.input.Key
          });
          return { $metadata: {} };
        }
      }
    });

    assert.equal(artifacts.length, 7);
    assert.deepEqual(artifacts.map((artifact) => artifact.fileName), [
      "ConsentControlGeometryEvidence.json",
      "consent_scenario_execution.json",
      "consent_scenario_plan.json",
      "policy_surface_text_fixture.txt",
      "screenshot-pre-consent-full-page.jpg",
      "screenshot-pre-consent-geometry-proof.png",
      "screenshot-pre-consent.png"
    ]);
    assert.ok(puts.every((put) => put.bucket === "certscore-v2-local-artifacts"));
    assert.ok(puts.every((put) => put.key?.includes("/auxiliary/")));
    assert.equal(
      puts.find((put) => put.key?.endsWith("/screenshot-pre-consent-full-page.jpg"))?.contentType,
      "image/jpeg"
    );
    assert.equal(
      puts.find((put) => put.key?.endsWith("/screenshot-pre-consent-geometry-proof.png"))?.contentType,
      "image/png"
    );
    assert.equal(
      puts.find((put) => put.key?.endsWith("/policy_surface_text_fixture.txt"))?.contentType,
      "text/plain; charset=utf-8"
    );
    assert.ok(artifacts.every((artifact) => artifact.uri.startsWith("s3://certscore-v2-local-artifacts/")));
  } finally {
    if (previousBucket === undefined) {
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    } else {
      process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = previousBucket;
    }
    if (previousPrefix === undefined) {
      delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX;
    } else {
      process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_PREFIX = previousPrefix;
    }
  }
});

test("coordinator mirrors worker auxiliary diagnostics into final artifact root", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "certscore-v2-lambda-worker-aux-test-"));
  const diagnosticsBody = Buffer.from(JSON.stringify({ artifactVersion: "test.diagnostics.v1" }));
  const diagnosticsSha256 = createHash("sha256").update(diagnosticsBody).digest("hex");
  const manifestBody = Buffer.from(JSON.stringify({
    auxiliaryArtifacts: [{
      fileName: "consent-runtime-diagnostics-accept_all_flow.json",
      sha256: diagnosticsSha256,
      sizeBytes: diagnosticsBody.byteLength,
      uri: "s3://certscore-v2-local-artifacts/v2/worker/auxiliary/consent-runtime-diagnostics-accept_all_flow.json"
    }]
  }));
  const bodies = new Map<string, Buffer>([
    ["v2/worker/LocalV2DagLambdaManifest.json", manifestBody],
    ["v2/worker/auxiliary/consent-runtime-diagnostics-accept_all_flow.json", diagnosticsBody]
  ]);
  const mirrored = await mirrorWorkerArtifactsIntoFinalArtifactRoot({
    artifactRoot: tmp,
    workerResults: [{
      artifactPointers: {
        manifestUri: "s3://certscore-v2-local-artifacts/v2/worker/LocalV2DagLambdaManifest.json",
        scanArtifactUri: "s3://certscore-v2-local-artifacts/v2/worker/CanonicalEvidenceBundle.json"
      },
      scanId: "scan-local-1_accept_gpc",
      status: "completed",
      workerLane: "accept_gpc"
    }],
    s3GetClient: {
      async send(command: GetObjectCommand) {
        const key = String(command.input.Key);
        const body = bodies.get(key);
        if (!body) {
          throw new Error(`unexpected key ${key}`);
        }
        return { Body: body, $metadata: {} };
      }
    }
  });

  assert.equal(mirrored, undefined);
  assert.deepEqual(JSON.parse(await readFile(path.join(tmp, "worker-accept_gpc-LocalV2DagLambdaManifest.json"), "utf8")), {
    auxiliaryArtifacts: [{
      fileName: "consent-runtime-diagnostics-accept_all_flow.json",
      sha256: diagnosticsSha256,
      sizeBytes: diagnosticsBody.byteLength,
      uri: "s3://certscore-v2-local-artifacts/v2/worker/auxiliary/consent-runtime-diagnostics-accept_all_flow.json"
    }]
  });
  assert.deepEqual(
    JSON.parse(await readFile(path.join(tmp, "worker-accept_gpc-consent-runtime-diagnostics-accept_all_flow.json"), "utf8")),
    { artifactVersion: "test.diagnostics.v1" }
  );
});

test("handler emits a bounded failed result when the artifact chain fails", async () => {
  const sentBodies: string[] = [];
  const result = await handler(validPayload(), {
    now: () => new Date("2026-06-15T18:00:00.000Z"),
    runArtifactChain: async () => {
      throw new Error(`scan failed ${"x".repeat(1000)}`);
    },
    sqsClient: {
      async send(command: SendMessageCommand) {
        sentBodies.push(String(command.input.MessageBody));
        return { $metadata: {} };
      }
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(result.error?.code, "v2_dag_lambda_failed");
  assert.ok((result.error?.message.length ?? 0) <= 500);
  assert.equal(sentBodies.length, 1);

  const parsed = parseLocalV2DagLambdaResultMessage(sentBodies[0], { expectedTargetEnvironment: "local" });
  assert.equal(parsed.status, "failed");
  assert.equal(parsed.error?.code, "v2_dag_lambda_failed");
  assert.equal(parsed.productionFindingIntegration, false);
});

test("handler does not emit SQS for invalid dispatch payloads", async () => {
  let sendCount = 0;
  await assert.rejects(
    handler(validPayload({ contractVersion: "wrong" }), {
      sqsClient: {
        async send() {
          sendCount += 1;
          return { $metadata: {} };
        }
      }
    }),
    /contract version/
  );
  assert.equal(sendCount, 0);
});

test("accessibility evidence belongs exclusively to the runtime lane during canonical merge", () => {
  const runtimeAudit = accessibilityAuditFixture({ scanId: "lane-fixture" });
  const otherAudit = accessibilityAuditFixture({ scanId: "lane-fixture", documentToken: "wrong-session" });
  const merged = mergeLocalV2DagLambdaEvidenceLaneBundles({ scanId: "lane-fixture", artifactRoot: "/tmp/lane-fixture",
    consentProof: canonicalBundleFixture("lane-fixture", { accessibilityAudit: otherAudit, scanLaneRuns: [laneRunFixture("consent_proof", "consent")] }),
    runtimeEvidence: canonicalBundleFixture("lane-fixture", { accessibilityAudit: runtimeAudit, scanLaneRuns: [laneRunFixture("runtime_evidence", "runtime")],
      runtimeCoverage: { coverageStatus: "usable", fallbackModesUsed: [], limitationKeys: [], notes: [], silentEmpty: false,
        observationCounts: { cookieEvents: 0, cookiesBeforeConsent: 0, networkEvents: 0, normalizedVendors: 0, observedJourneys: 0, thirdPartyRequests: 0 } },
    }),
    policyEvidence: canonicalBundleFixture("lane-fixture", { accessibilityAudit: otherAudit, scanLaneRuns: [laneRunFixture("policy_evidence", "policy")] }),
  });
  assert.deepEqual(merged.accessibilityAudit, runtimeAudit);
});

test("a captured WCAG audit survives worker path rewriting and canonical serialization", async () => {
  const server = createHttpServer((_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(`<!doctype html><html lang="en"><head><title>Accessibility fixture</title></head>
      <body><main><h1>Contact our team</h1><p>This local fixture provides ordinary public website content
      for a deterministic accessibility capture. Review our services and contact information below.</p>
      <input><button></button><img src="data:image/png;base64,AA=="></main></body></html>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const root = await mkdtemp(path.join(os.tmpdir(), "wcag-worker-handoff-"));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/`;
    const scanId = "wcag-worker-handoff";
    const runtimeEvidence = await runScan({ scanId, url, profile: "tiny", evidenceLane: "runtime_evidence",
      outDir: path.join(root, "runtime"), scenarioResourceMode: "lean", preConsentModuleDeadlineMs: 6000 });
    assert.ok(runtimeEvidence.accessibilityAudit?.violations.some(rule => rule.ruleId === "label"));
    const merged = mergeLocalV2DagLambdaEvidenceLaneBundles({ scanId, artifactRoot: root, runtimeEvidence,
      consentProof: canonicalBundleFixture(scanId, { url, normalizedUrl: url }),
      policyEvidence: canonicalBundleFixture(scanId, { url, normalizedUrl: url }),
    });
    const retained = JSON.parse(serializeCanonicalEvidenceBundle(merged));
    assert.deepEqual(retained.accessibilityAudit, runtimeEvidence.accessibilityAudit);
    assert.equal(retained.modulesRun.find((module: { moduleName: string }) => module.moduleName === "accessibilityAudit").status, "completed");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

function runtimeSnapshotFixture(): CanonicalEvidenceBundle["domSnapshots"][number] {
  return {artifactId:"runtime-dom",path:"/tmp/runtime-dom.txt",url:"https://example.com/",
    capturedAtMs:100,documentIdentity:{source:"cdp_loader_id",token:"runtime-loader"},
    textExcerpt:"This is retained content from the original starting page. Visitors can read information about our products and services, learn about the organization and explore its useful resources and public documentation.",
    pagePhase:"network_idle",consentStateAtTime:"pre_consent"};
}

function canonicalBundleFixture(
  scanId: string,
  overrides: Partial<CanonicalEvidenceBundle> = {}
): CanonicalEvidenceBundle {
  return {
    artifactRefs: [],
    cmpRuntimeObservations: [],
    completedAt: "2026-06-15T18:00:01.000Z",
    consentActionAttempts: [],
    consentActionCandidates: [],
    consentFlowComparisons: [],
    consentFlowObservations: [],
    consentInteractionEvents: [],
    consentUiObservations: [],
    cookieEvents: [],
    cookieSnapshots: [],
    derivedRuntimeSignals: {
      preConsentTrackingObserved: false,
      sessionReplayOrBehavioralAnalyticsObserved: false,
      thirdPartyCookiesPreConsentObserved: false,
      thirdPartyVendorsObserved: false
    },
    domSnapshots: [],
    iframeEvents: [],
    modulesRun: [],
    scanLaneRuns: [],
    networkEvents: [],
    networkResponseEvents: [],
    normalizedUrl: "https://example.com/",
    normalizedVendorObservations: [],
    observedJourneys: [],
    policySurfaceObservations: [],
    runtimeTimeline: [],
    scanId,
    scanProfile: {
      enabledModules: [],
      internalBudgetMs: 1_000,
      label: "tiny",
      profileId: "tiny",
      targetDurationMs: 1_000
    },
    scannerVersion: "test",
    schemaVersion: "certscore.v2.canonical_evidence_bundle.v1",
    screenshots: [],
    scriptEvents: [],
    startedAt: "2026-06-15T18:00:00.000Z",
    storageSnapshots: [],
    url: "https://example.com/",
    ...overrides
  };
}

function collectionSurfaceInventoryFixture(title: string): NonNullable<CanonicalEvidenceBundle["collectionSurfaceInventory"]> {
  return {
    contractVersion: "certscore.collection-surface-inventory.v1",
    inventoryId: `inventory-${title}`,
    sourceLane: "runtime_evidence",
    sourceScanner: "pre_consent_runtime",
    scenario: "fresh_pre_consent",
    observedAtMs: 100,
    consentStateAtTime: "pre_consent",
    pageUrl: "https://example.com/",
    coverage: {
      status: "complete",
      documentScope: "main_document",
      interactionMode: "none",
      candidateFormCount: 1,
      retainedFormCount: 1,
      candidateFieldCount: 1,
      retainedFieldCount: 1,
      inspectedFormCandidateCount: 1,
      inspectedFieldCandidateCount: 1,
      candidateScanTruncated: false,
      retentionTruncated: false,
      reasonCodes: [],
    },
    forms: [{
      formRef: "form-0",
      structure: "native_form",
      surfaceType: "contact",
      title,
      pageUrl: "https://example.com/",
      method: "post",
      actionRelationship: "self",
      candidateFieldCount: 1,
      retainedFieldCount: 1,
      fieldsTruncated: false,
      fields: [{
        fieldRef: "field-0",
        elementType: "input",
        inputType: "email",
        semanticCategory: "email",
        label: "Email",
        required: true,
        disabled: false,
        readOnly: false,
        evidenceRefs: [],
        confidence: 0.9,
        directVsInferred: "direct",
      }],
      evidenceRefs: [],
      confidence: 0.9,
      directVsInferred: "direct",
    }],
    evidenceRefs: [],
    confidence: 0.9,
    directVsInferred: "direct",
  };
}

function laneRunFixture(
  laneId: CanonicalEvidenceBundle["scanLaneRuns"][number]["laneId"],
  physicalInvocationId: string,
): CanonicalEvidenceBundle["scanLaneRuns"][number] {
  const policyLane = laneId === "policy_evidence";
  return {
    laneId,
    physicalInvocationId,
    region: "eu-west-1",
    phaseName: policyLane ? "policySurfaceScanner" : "preConsentRuntimeScanner",
    startedAt: "2026-06-15T18:00:00.000Z",
    firstResponseAt: "2026-06-15T18:00:00.100Z",
    firstResponseOffsetMs: 100,
    firstHttpStatus: 200,
    firstEffectiveUrl: "https://example.com/",
    navigationCount: 1,
    navigationAttempts: [],
    challengeDetected: false,
    challengeType: null,
    executionOutcome: "success",
    accessOutcome: "representative_page",
    completedAt: "2026-06-15T18:00:01.000Z",
    durationMs: 1_000,
  };
}

function terminalLaneNoGo(
  reasonCode: string,
): NonNullable<CanonicalEvidenceBundle["scanNoGoAssessment"]> {
  return {
    status: "available",
    version: "scan-no-go-assessment-v1",
    decision: "no_go",
    scanNoGoConfidence: 0.92,
    reasonCodes: [reasonCode, "scan_no_go_corroborated"],
    corroboratorCodes: ["lane_local_terminal_evidence"],
    contradictorCodes: [],
    supportingSignals: {
      retainedVisualArtifactAvailable: reasonCode !== "navigation_transport_failure",
    },
    evidenceRefs: ["scan_runtime_artifacts.scan_no_go_assessment"],
  };
}

function terminalLaneVisualNoGo(
  reasonCode: string,
  pageState: NonNullable<CanonicalEvidenceBundle["visualAccessReview"]>["page_state"],
): NonNullable<CanonicalEvidenceBundle["visualAccessReview"]> {
  return {
    artifact_ref: null,
    confidence: 0.92,
    go_no_go: "NO_GO",
    key_visual_evidence: ["Lane-local evidence did not retain a representative public page."],
    page_state: pageState,
    reason_code: reasonCode,
    short_explanation: "Lane-local evidence did not retain a representative public page.",
    status: "missing_visual_artifact",
    version: "visual-access-review-v1",
  };
}

function actionAttempt(
  scenario: ConsentActionAttempt["scenario"],
  actionType: ConsentActionAttempt["actionType"],
  succeeded: boolean,
): ConsentActionAttempt {
  return {
    actionType,
    attempted: true,
    attemptId: `attempt_${scenario}_${actionType}`,
    evidenceRefs: [],
    failureReason: succeeded ? undefined : "candidate_not_observed",
    scenario,
    succeeded,
    timestampMs: 10,
  };
}

function screenshotArtifact(artifactId: string, filePath: string): ScreenshotArtifact {
  return {
    artifactId,
    capturedAtMs: 10,
    consentStateAtTime: "pre_consent",
    pagePhase: "initial_navigation",
    path: filePath,
    retentionStatus: "available",
    url: "https://example.com/"
  };
}

function consentObservation(scenario: ConsentFlowObservation["scenario"]): ConsentFlowObservation {
  return {
    actionAttempts: [],
    actionCandidates: [],
    artifactRefs: [],
    bannerLikelyPresent: true,
    confidence: 0.7,
    consentStateAtTime: "pre_consent",
    directVsInferred: "direct",
    evidenceRefs: [],
    observationId: `consent_flow_${scenario}`,
    scenario,
    sourceScanner: "consent_flow_runtime",
  };
}

test("runtime site metadata survives lane merge without entering consent DOM evidence", () => {
  const id = "metadata-lane-test";
  const snapshot = {
    artifactId: "runtime-metadata", capturedAtMs: 100, path: "/tmp/runtime-dom.txt", url: "https://example.com/",
    documentIdentity: { source: "cdp_loader_id" as const, token: "runtime-document" },
    pagePhase: "network_idle" as const, consentStateAtTime: "pre_consent" as const,
    siteMetadata: { contractVersion: "certscore.site-metadata.v1" as const, title: "Example", language: "en", generators: ["WordPress 6.8.2"], wordpressAssetObserved: true },
  };
  const merged = mergeLocalV2DagLambdaEvidenceLaneBundles({
    artifactRoot: "/tmp/metadata-lanes", scanId: id,
    consentProof: canonicalBundleFixture(id), policyEvidence: canonicalBundleFixture(id),
    runtimeEvidence: canonicalBundleFixture(id, {
      domSnapshots: [snapshot],
      runtimeCoverage: { coverageStatus: "usable", fallbackModesUsed: [], limitationKeys: [], notes: [], silentEmpty: false,
        observationCounts: { cookieEvents: 0, cookiesBeforeConsent: 0, networkEvents: 1, normalizedVendors: 0, observedJourneys: 0, thirdPartyRequests: 0 } },
    }),
  });
  assert.equal(merged.runtimeMetadataSnapshots?.[0]?.siteMetadata?.generators[0], "WordPress 6.8.2");
  assert.deepEqual(merged.domSnapshots, []);
  assert.deepEqual(merged.consentUiObservations, []);
});

test("GPC coordinator publishes bounded comparison from the original verified worker pair", async () => {
  const { createGpcImpactCapture } = await import("../../../packages/certscore-scan-core/src/gpc-impact-capture");
  const scanId = "bounded-gpc-coordinator";
  const pair = [false, true].map(enabled => {
    const bundle = gpcRuntimeFixture({ enabled, url: "https://example.com/" }); bundle.scanId = scanId;
    if (!enabled) bundle.domSnapshots=[{...runtimeSnapshotFixture(),url:bundle.url}];
    let now = 0;
    const capture = createGpcImpactCapture({ expectedEnabled: enabled, now: () => now });
    capture.documentRequested({ type: "Document", frameId: "main", loaderId: "loader", request: { url: bundle.url, headers: enabled ? { "Sec-GPC": "1" } : {} } }, "main");
    capture.recordRequest(bundle.networkEvents[0]!);
    now = 1; capture.documentCommitted({ loaderId: "loader", url: bundle.url });
    for (const event of bundle.networkEvents.slice(1)) capture.recordRequest(event);
    now = 1500;
    bundle.gpcSignalObservation!.capturedAtMs = now;
    capture.bindReadback("loader");
    bundle.gpcImpactCapture = capture.finish(bundle.gpcSignalObservation);
    bundle.completedAt = "2026-09-05T12:00:02.000Z";
    bundle.modulesRun[0]!.timingBreakdown![0]!.outcome = "timed_out";
    return bundle;
  });
  const priorBucket = process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  let artifactRoot: string | undefined;
  try {
    const outcome = await runCoordinatorFixture({ scanId, action: "none", dispatchDelayMs: 1000,
      consentBundle: coordinatorConsentBundle(scanId, { inspectionCompleted: true, acceptControlObserved: false }),
      gpcPair: { baseline: pair[0]!, gpc: pair[1]! } });
    artifactRoot = outcome.artifactRoot;
    const comparison = outcome.bundle.gpcActivityComparison;
    assert.equal(comparison?.status, "measured");
    assert.equal(comparison.durationMs, 1000);
    assert.equal(comparison.scanId, scanId);
    assert.equal(comparison.scoreEffect, "none");
    assert.equal(comparison.sourceHashes.baseline, createHash("sha256").update(JSON.stringify(pair[0])).digest("hex"));
    assert.equal(comparison.sourceHashes.gpc, outcome.bundle.gpcResponseAssessment.comparison.gpcArtifact.sha256);
    assert.equal(outcome.bundle.gpcResponseAssessment.status, "indeterminate");
    assert.equal(outcome.actionCalls.length, 0);
  } finally {
    if (priorBucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = priorBucket;
    if (artifactRoot) await rm(artifactRoot, { recursive: true, force: true });
  }
});


test("policy-lane negative-search proof survives the hash-bound early handoff", () => {
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload());
  const requestedUrl = new URL(payload.targetUrl).toString();
  const packet = buildVerifiedPolicyEvidencePacket({ payload, result: {
    artifactRefs: [], policySurfaceObservations: [],
    moduleRun: { moduleName: "policySurfaceScanner", status: "completed", evidenceRefs: [],
      startedAt: "2026-10-11T00:00:00Z", durationMs: 1000, errors: [] },
    privacyChoiceInspection:{contractVersion:"certscore.privacy-choice-inspection.v4",homepageAccessPolicy:"representative_homepage.v1",
      documentUrl:requestedUrl,capturedAt:new Date().toISOString(),sourceHash:"c".repeat(64),scope:"rendered_named_links_and_buttons",coverage:"complete",
      namedChoiceCandidateCount:0,unnamedControlCount:0,hiddenUnnamedControlCount:0,candidateEnumerationTruncated:false,uninspectedFrameCount:0,uninspectedShadowRootCount:0,
      supportedDocumentLanguage:true,representativeDocument:true,documentStable:true,frameCount:0,inspectedSameOriginFrameCount:0,hiddenUninspectedFrameCount:0,
      inaccessibleFrameCount:0,unreadyFrameCount:0,unprojectableFrameCount:0,frameBudgetLimitedCount:0,namedFrameChoiceCandidateCount:0,frameInspectionWorkMs:0,frameProofWorkMs:0},
    negativeSearchEvidence: {
      contractVersion: "certscore.policy-negative-search.v1", requestedUrl,
      staticDocumentUrl: requestedUrl, renderedDocumentUrl: requestedUrl,
      staticDocumentHash: "a".repeat(64), renderedInspectionHash: "b".repeat(64),
      staticInspectionComplete: true, renderedInspectionComplete: true, representativeDocuments: true,
      observedPrivacyCandidateCount: 0, uninspectedFrameCount: 0, uninspectedShadowRootCount: 0,
      candidateEnumerationTruncated: false,
    },
  } });
  assert.equal(packet.policySurfaceInspection.outcome, "no_privacy_policy_observed_complete_coverage");
  assert.equal(packet.policySurfaceInspection.californiaReviewPolicy,"california-privacy-review.v10");
  assert.equal(packet.policySurfaceInspection.californiaDisclosureChoicePolicy,"california.disclosure-choice.v2-runtime");
  assert.equal(packet.policySurfaceInspection.privacyChoiceInspection?.contractVersion,"certscore.privacy-choice-inspection.v4");
  assert.ok(packet.policySurfaceInspection.negativeSearchEvidence);
  const { sourceHash, ...unsigned } = packet;
  assert.equal(sourceHash, createHash("sha256").update(JSON.stringify(unsigned)).digest("hex"));
  assert.equal(packet.productionFindingIntegration, false);
});

for (const flag of [undefined, "0"] as const) {
  for (const explicitPreferences of [false, true]) {
    test(`disabled CMP preference lane never dispatches: flag=${flag ?? "unset"}, explicit=${explicitPreferences}`, async () => {
      const saved = { preference: process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED,
        bucket: process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET };
      if (flag === undefined) delete process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED;
      else process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED = flag;
      process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
      let artifactRoot: string | undefined;
      try {
        const scanId = `cmp-disabled-${flag ?? "unset"}-${explicitPreferences}`;
        const result = await runCoordinatorFixture({ scanId, explicitPreferences,
          action: "none", dispatchDelayMs: 1000,
          consentBundle: coordinatorConsentBundle(scanId, { inspectionCompleted: true, acceptControlObserved: false }) });
        artifactRoot = result.artifactRoot;
        assert.equal(result.workerCalls.includes("cmp_preferences"), false);
        assert.equal(result.bundle.cmpPreferencesEvidence, undefined);
        assert.equal(result.bundle.cmpPreferenceLaneOutcome, undefined);
        assert.equal(result.result.laneTimingSummary.cmpPreferenceInspection, undefined);
        for (const lane of ["consent_proof", "runtime_evidence", "policy_evidence"]) {
          assert.ok(result.workerCalls.includes(lane));
        }
        assert.equal(result.bundle.runtimeCoverage.coverageStatus, "usable");
      } finally {
        for (const [key, value] of [["CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED", saved.preference],
          ["CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET", saved.bucket]]) {
          if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
        }
        if (artifactRoot) await rm(artifactRoot, { recursive: true, force: true });
      }
    });
  }
}

test("CMP preference authorization stays exact and has its own worker packet", async () => {
  const config = { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "scan-local-1", exactTargetUrl: "https://example.com/" };
  assert.throws(() => parseLocalV2DagLambdaDispatchPayload(validPayload({ orchestrationMode: "sharded", cmpPreferenceInspection: { ...config, scanId: "other-scan" } })));
  assert.throws(() => parseLocalV2DagLambdaDispatchPayload(validPayload({ orchestrationMode: "sharded", cmpPreferenceInspection: { ...config, exactTargetUrl: "https://example.com/other" } })));
  assert.throws(() => parseLocalV2DagLambdaDispatchPayload(validPayload({ orchestrationMode: "single", cmpPreferenceInspection: config })));
  const parent = parseLocalV2DagLambdaDispatchPayload(validPayload({ orchestrationMode: "sharded", cmpPreferenceInspection: config }));
  let sent: Record<string, unknown> | undefined;
  const result = await invokeLocalV2DagLambdaWorker({ parentPayload: parent, parentScanId: parent.scanId, workerLane: "cmp_preferences", lambdaClient: { async send(command) {
    sent = JSON.parse(Buffer.from(command.input.Payload ?? []).toString("utf8"));
    return { StatusCode: 200, Payload: Buffer.from(JSON.stringify({ scanId: parent.scanId, workerLane: "cmp_preferences", status: "completed", parentDispatchSha256: postRefusalParentDispatchSha256(parent), artifactPointers: { cmpPreferencesPacketUri: "s3://test-bucket/CmpPreferencesEvidencePacket.json" }, artifactMetadata: { cmpPreferencesPacketUri: { sha256: "a".repeat(64), sizeBytes: 123 } } })) };
  } } });
  assert.equal(sent?.parentDispatchSha256, postRefusalParentDispatchSha256(parent));
  assert.deepEqual(sent?.cmpPreferenceInspection, config);
  assert.equal(result.artifactPointers?.cmpPreferencesPacketUri, "s3://test-bucket/CmpPreferencesEvidencePacket.json");
});

for (const preferences of ["complete", "partial", "hang", "wrong_hash", "wrong_target"] as const) {
  test(`CMP coordinator joins only verified evidence without a tail wait: ${preferences}`, async () => {
    const saved = { preference: process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED,
      accept: process.env[POST_ACCEPT_WORKER_FEATURE_FLAG], bucket: process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET };
    process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED = "1";
    process.env[POST_ACCEPT_WORKER_FEATURE_FLAG] = "1";
    process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
    let artifactRoot: string | undefined;
    try {
      const scanId = `cmp-coordinator-${preferences}`;
      const start = Date.now();
      const result = await runCoordinatorFixture({ scanId, preferences, action: "none", dispatchDelayMs: 1000,
        consentBundle: coordinatorConsentBundle(scanId, { inspectionCompleted: true, acceptControlObserved: false }) });
      artifactRoot = result.artifactRoot;
      assert.ok(Date.now() - start < 1500, "CMP worker must not wait its 19-second budget at report publication");
      const joined = preferences === "complete" || preferences === "partial";
      assert.equal(result.bundle.cmpPreferenceLaneOutcome.status, joined ? "joined" : "limited");
      if (preferences === "wrong_hash") assert.equal(result.bundle.cmpPreferenceLaneOutcome.diagnostic?.code, "checksum_mismatch");
      if (preferences === "wrong_target") assert.equal(result.bundle.cmpPreferenceLaneOutcome.diagnostic?.phase, "artifact_binding");
      assert.equal(Boolean(result.bundle.cmpPreferencesEvidence), joined);
      if (preferences === "partial") {
        assert.equal(result.bundle.cmpPreferencesEvidence.status, "limited");
        assert.equal(result.bundle.cmpPreferencesEvidence.checkpoints.privacyLinks, true);
        assert.equal(result.bundle.cmpPreferencesEvidence.controlInventoryComplete, false);
        assert.equal(result.bundle.cmpPreferencesEvidence.action.opened, false);
      }
      assert.equal(result.bundle.scanId, scanId);
      assert.equal(result.bundle.runtimeCoverage.coverageStatus, "usable", "verified passive evidence is preserved");
      assert.ok(result.bundle.scanLaneRuns.some((lane: { laneId: string }) => lane.laneId === "policy_evidence"));
    } finally {
      for (const [key, value] of [["CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED", saved.preference], [POST_ACCEPT_WORKER_FEATURE_FLAG, saved.accept], ["CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET", saved.bucket]]) {
        if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
      }
      if (artifactRoot) await rm(artifactRoot, { recursive: true, force: true });
    }
  });
}


test("CMP worker bounds a stalled artifact chain and cannot publish a second report", async () => {
  let scannerSignal: AbortSignal | undefined;
  let publications = 0;
  const started = Date.now();
  const result = await handler(validPayload({ orchestrationMode: "worker", workerLane: "cmp_preferences", parentDispatchSha256: "e".repeat(64),
    cmpPreferenceInspection: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "scan-local-1", exactTargetUrl: "https://example.com/" } }), {
    artifactChainTimeoutMs: 20, handlerSafetyTimeoutMs: 30, scannerWorkTimeoutMs: 10,
    runArtifactChain: async (_payload, options) => { scannerSignal = options.signal; return new Promise(() => undefined); },
    sqsClient: { async send() { publications++; return { $metadata: {} }; } },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.workerLane, "cmp_preferences");
  assert.equal(result.error?.code, "v2_dag_lambda_safety_timeout");
  assert.equal(scannerSignal?.aborted, true);
  assert.equal(publications, 0);
  assert.ok(Date.now() - started < 1000);
});

test("passive CMP basics belong exclusively to the consent-proof lane", () => {
  const basic = {contractVersion:"certscore.cmp-basic-evidence.v1" as const,sourceLane:"consent_proof" as const,scanId:"lane-fixture",
    targetUrl:"https://example.com/",documentUrl:"https://example.com/",documentToken:"consent-loader",capturedAtMs:100,provider:"OneTrust",
    controls:[],privacyLinks:[],declarations:[],serviceNames:[],limitations:["passive_first_layer_only"]};
  const runtime=canonicalBundleFixture("lane-fixture",{cmpBasicEvidence:{...basic,documentToken:"runtime-loader"},scanLaneRuns:[laneRunFixture("runtime_evidence","runtime")]});
  runtime.runtimeCoverage = {coverageStatus:"usable",fallbackModesUsed:[],limitationKeys:[],notes:[],silentEmpty:false,
    observationCounts:{cookieEvents:0,cookiesBeforeConsent:0,networkEvents:0,normalizedVendors:0,observedJourneys:0,thirdPartyRequests:0}};
  const policy=canonicalBundleFixture("lane-fixture",{cmpBasicEvidence:{...basic,documentToken:"policy-loader"},scanLaneRuns:[laneRunFixture("policy_evidence","policy")]});
  const consent=canonicalBundleFixture("lane-fixture",{cmpBasicEvidence:basic,scanLaneRuns:[laneRunFixture("consent_proof","consent")]});
  assert.deepEqual(mergeLocalV2DagLambdaEvidenceLaneBundles({scanId:"lane-fixture",artifactRoot:"/tmp/lane-fixture",consentProof:consent,runtimeEvidence:runtime,policyEvidence:policy}).cmpBasicEvidence,basic);
  delete consent.cmpBasicEvidence;
  assert.equal(mergeLocalV2DagLambdaEvidenceLaneBundles({scanId:"lane-fixture",artifactRoot:"/tmp/lane-fixture",consentProof:consent,runtimeEvidence:runtime,policyEvidence:policy}).cmpBasicEvidence,undefined);
});

test("cookie snapshot coverage and its document metadata remain owned by the runtime lane",()=>{
  const runtime=canonicalBundleFixture("lane-fixture",{scanLaneRuns:[laneRunFixture("runtime_evidence","runtime")]});
  runtime.runtimeCoverage={coverageStatus:"usable",fallbackModesUsed:[],limitationKeys:[],notes:[],silentEmpty:false,
    observationCounts:{cookieEvents:0,cookiesBeforeConsent:0,networkEvents:0,normalizedVendors:0,observedJourneys:0,thirdPartyRequests:0}};
  const snapshot={artifactId:"cookie_snapshot_pre_consent",capturedAtMs:100,consentStateAtTime:"pre_consent" as const,cookies:[],cookieNames:[],evidenceRefs:[],
    captureCoverage:{version:"bound_cookie_snapshot.v1" as const,scope:"browser_context_point_in_time" as const,targetUrl:runtime.url,documentUrl:runtime.url,documentToken:"runtime-loader",startedAtMs:90,completedAtMs:100,status:"completed" as const}};
  runtime.cookieSnapshots=[snapshot];
  const consent=canonicalBundleFixture("lane-fixture",{cookieSnapshots:[{...snapshot,captureCoverage:{...snapshot.captureCoverage,documentToken:"wrong-lane"}}],scanLaneRuns:[laneRunFixture("consent_proof","consent")]});
  const policy=canonicalBundleFixture("lane-fixture",{scanLaneRuns:[laneRunFixture("policy_evidence","policy")]});
  const merged=mergeLocalV2DagLambdaEvidenceLaneBundles({scanId:"lane-fixture",artifactRoot:"/tmp/lane-fixture",consentProof:consent,runtimeEvidence:runtime,policyEvidence:policy});
  assert.equal(merged.cookieSnapshots[0]!.captureCoverage?.documentToken,"runtime-loader");
  runtime.cookieSnapshots=[];
  assert.deepEqual(mergeLocalV2DagLambdaEvidenceLaneBundles({scanId:"lane-fixture",artifactRoot:"/tmp/lane-fixture",consentProof:consent,runtimeEvidence:runtime,policyEvidence:policy}).cookieSnapshots,[]);
});


test("CMP observation cancellation retains its bounded packet with the independent artifact signal", async () => {
  const saved = { flag: process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED, bucket: process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET };
  process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED = "1";
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = "test-bucket";
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), "cmp-cancel-retention-"));
  const observation = new AbortController(), artifacts = new AbortController();
  observation.abort();
  let uploads = 0, coreCompleted = false;
  const payload = parseLocalV2DagLambdaDispatchPayload(validPayload({ orchestrationMode: "worker", workerLane: "cmp_preferences", parentDispatchSha256: "a".repeat(64),
    cmpPreferenceInspection: { policyVersion: "bounded_cmp_preferences.v1", enabled: true, scanId: "scan-local-1", exactTargetUrl: "https://example.com/" } }));
  const s3Client = { async send(command: PutObjectCommand, options?: { abortSignal?: AbortSignal }) {
    assert.equal(options?.abortSignal?.aborted, false); assert.equal(coreCompleted, true);
    uploads++; const bytes = Buffer.from(command.input.Body as Uint8Array);
    assert.equal(command.input.Metadata?.sha256, createHash("sha256").update(bytes).digest("hex"));
    return { $metadata: {} };
  } };
  try {
    const result = await runCmpPreferencesArtifactChain(payload, { artifactRoot, s3Client, signal: observation.signal, artifactSignal: artifacts.signal,
      onScanCoreComplete: () => { coreCompleted = true; } });
    assert.equal(uploads, 1); assert.ok(result.artifactPointers.cmpPreferencesPacketUri);
    const packet = JSON.parse(await readFile(path.join(artifactRoot, "CmpPreferencesEvidencePacket.json"), "utf8"));
    assert.equal(packet.support.reason, "preference_inspection_cancelled"); assert.equal(packet.status, "limited");
    assert.equal(packet.documentToken, null); assert.deepEqual(packet.controls, []);
    packet.finalUrl = payload.targetUrl; packet.documentToken = "bound-loader";
    packet.privacyLinks = [{url: "https://example.com/privacy", hitTargetBeforeAction: true}];
    packet.checkpoints = {version: "cmp_partial_capture.v1", documentToken: "bound-loader", privacyLinks: true, declarations: false, controls: false, controlsSurface: "first_layer"};
    await retainCmpPreferencesPacket(payload, packet, { artifactRoot, s3Client, artifactSignal: artifacts.signal });
    assert.equal(uploads, 2);
    const retained = JSON.parse(await readFile(path.join(artifactRoot, "CmpPreferencesEvidencePacket.json"), "utf8"));
    assert.equal(retained.checkpoints.privacyLinks, true); assert.equal(retained.controlInventoryComplete, false);
    await assert.rejects(retainCmpPreferencesPacket(payload, {...packet, targetUrl: "https://other.example/", finalUrl: "https://other.example/"}, {artifactRoot, s3Client, artifactSignal: artifacts.signal}), /cmp_packet_binding_mismatch/);
    artifacts.abort();
    await assert.rejects(retainCmpPreferencesPacket(payload, packet, {artifactRoot, s3Client, artifactSignal: artifacts.signal}), /abort/i);
    assert.equal(uploads, 2, "Overall cancellation and invalid binding cannot upload a packet");
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
    if (saved.flag === undefined) delete process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED; else process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED = saved.flag;
    if (saved.bucket === undefined) delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET; else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET = saved.bucket;
  }
});

test("handler retains the bounded network guard reason in internal failure diagnostics only", async () => {
  const {PublicNetworkGuardError} = await import('@certscore/scan-core/public-network-guard');
  const previousBucket=process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET='failure-diagnostic-test';
  const uploads:string[]=[];
  const workspaceRoot=await mkdtemp(path.join(os.tmpdir(),'network-guard-diagnostic-'));
  try {
    const result=await handler(validPayload(), {
      workspaceRoot,handlerSafetyTimeoutMs:10_000,resultPublishTimeoutMs:100,
      runArtifactChain:async()=>{throw new PublicNetworkGuardError('dns_resolution_failed','EAI_AGAIN');},
      s3Client:{async send(command:PutObjectCommand){uploads.push(Buffer.from(command.input.Body as Uint8Array).toString('utf8'));return {$metadata:{}};}},
      sqsClient:{async send(){return {$metadata:{}};}},
    });
    assert.equal(result.status,'failed');
    assert.equal(result.error?.message,'This target is not eligible for public website scanning.');
    assert.equal(uploads.length,1);
    assert.deepEqual(JSON.parse(uploads[0]!).publicNetworkGuard,{version:'public_network_guard_failure.v1',reason:'dns_resolution_failed',resolverCode:'EAI_AGAIN'});
    assert.doesNotMatch(JSON.stringify(result.error),/dns_resolution_failed|EAI_AGAIN/);
  } finally {
    if(previousBucket===undefined)delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET=previousBucket;
    await rm(workspaceRoot,{recursive:true,force:true});
  }
});


test("sale/sharing opt-out authorization cannot reuse a different scan, target, or unsharded run",()=>{
  const config={policyVersion:"bounded_sale_sharing_opt_out.v1",enabled:true,scanId:"scan-local-1",exactTargetUrl:"https://example.com/"};
  for(const patch of [{scanId:"different"},{exactTargetUrl:"https://example.com/other"}])assert.throws(()=>parseLocalV2DagLambdaDispatchPayload(validPayload({orchestrationMode:"sharded",saleSharingOptOut:{...config,...patch}})));
  assert.throws(()=>parseLocalV2DagLambdaDispatchPayload(validPayload({orchestrationMode:"single",saleSharingOptOut:config})));
  const parent=parseLocalV2DagLambdaDispatchPayload(validPayload({orchestrationMode:"sharded",saleSharingOptOut:config}));
  assert.deepEqual(parent.saleSharingOptOut,config);
});
for(const optOut of ["complete","hang","wrong_hash","wrong_target","redirected","policy_downgrade","bad_redirect"] as const) for(const enabled of [true,false]) {
  test(`sale/sharing opt-out barrier verifies original bytes without tail wait: ${optOut}, enabled=${enabled}`,async()=>{
    const oldFlag=process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED,oldBucket=process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
    process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED=enabled?"1":"0";process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET="test-bucket";
    let root:string|undefined;
    try {
      const scanId=`opt-out-${optOut}-${enabled}`,start=Date.now();
      if(["redirected","policy_downgrade","bad_redirect"].includes(optOut)){
        await assert.rejects(runCoordinatorFixture({scanId,optOut,action:"none",dispatchDelayMs:1000,consentBundle:coordinatorConsentBundle(scanId,{inspectionCompleted:true,acceptControlObserved:false})}));
        return; // Unscoped v2 now stops at authorization, before any lane dispatch.
      }
      const result=await runCoordinatorFixture({scanId,optOut,action:"none",dispatchDelayMs:1000,consentBundle:coordinatorConsentBundle(scanId,{inspectionCompleted:true,acceptControlObserved:false})});root=result.artifactRoot;
      assert.ok(Date.now()-start<1500,"No extra action tail wait");
      assert.equal(result.workerCalls.includes("sale_sharing_opt_out"),enabled);
      const joined=optOut==="complete"||optOut==="redirected";
      assert.equal(Boolean(result.bundle.saleSharingOptOut),enabled&&joined);
      assert.equal(result.bundle.saleSharingOptOutLaneOutcome?.status,!enabled?undefined:joined?"joined":"limited");
      if(enabled&&optOut==="redirected")assert.equal(result.bundle.saleSharingOptOut?.evidence.actionTargetUrl,"https://www.example.com/");
      assert.equal(result.bundle.runtimeCoverage.coverageStatus,"usable");
    } finally {
      if(oldFlag===undefined)delete process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED;else process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED=oldFlag;
      if(oldBucket===undefined)delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET=oldBucket;
      if(root)await rm(root,{recursive:true,force:true});
    }
  });
}

test("sale/sharing retention rejects an oversized valid v2 packet before filesystem or S3 writes",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"optout-size-cap-"));
  const artifactRoot=path.join(root,"must-not-be-created");let uploads=0;
  try{
    const policyVersion="bounded_sale_sharing_opt_out.v2-apex-www",redirectAuthorization={version:"sale_sharing_apex_www.v1",alternateTargetUrl:"https://www.example.com/"};
    const payload=parseLocalV2DagLambdaDispatchPayload(validPayload({orchestrationMode:"worker",workerLane:"sale_sharing_opt_out",parentDispatchSha256:"e".repeat(64),
      saleSharingOptOut:{policyVersion,enabled:true,scanId:"scan-local-1",exactTargetUrl:"https://example.com/",redirectAuthorization}}));
    const packet={contractVersion:"certscore.sale-sharing-opt-out-evidence.v2",policyVersion,scanId:payload.scanId,parentDispatchSha256:payload.parentDispatchSha256,targetUrl:payload.targetUrl,
      redirectAuthorization,actionTargetUrl:payload.targetUrl,tlsValidated:true,redirectProof:null,documentToken:"loader",
      startedAt:"2026-10-23T00:00:00Z",confirmedAt:"2026-10-23T00:00:01Z",completedAt:"2026-10-23T00:00:02Z",status:"complete",recipeVersion:"test",provider:"OneTrust",
      actionCount:1,submitted:true,registration:"confirmed",before:{sectionId:8,sale:2,sharing:2},after:{sectionId:8,sale:1,sharing:1},observationWindowMs:500,captureComplete:true,truncated:false,limitations:[],
      requests:Array.from({length:32},()=>({hostname:"ads.example.com",vendor:"Example",purpose:"advertising",httpStatus:204,msAfterConfirmation:300,
        collectionEvidence:{contractVersion:"canonical_advertising_collection.v1",endpointSha256:"a".repeat(64),registryVersion:"test",ruleIds:Array.from({length:16},(_,i)=>`${i}-${"r".repeat(190)}`)}}))};
    await assert.rejects(retainSaleSharingOptOutPacket(payload,packet,{artifactRoot,s3Client:{async send(){uploads++;return {$metadata:{}};}}}),/sale_sharing_packet_metadata_invalid/);
    assert.equal(uploads,0);
    await assert.rejects(readFile(path.join(artifactRoot,"SaleSharingOptOutEvidencePacket.json")),{code:"ENOENT"});
  }finally{await rm(root,{recursive:true,force:true});}
});

test("sale/sharing worker retains a terminal packet through cleanup within its existing five-second cap",{timeout:7000},async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"optout-artifact-reserve-"));
  let publications=0;
  try {
    const result=await handler(validPayload({orchestrationMode:"worker",workerLane:"sale_sharing_opt_out",parentDispatchSha256:"e".repeat(64),
      saleSharingOptOut:{policyVersion:"bounded_sale_sharing_opt_out.v1",enabled:true,scanId:"scan-local-1",exactTargetUrl:"https://example.com/"}}),{
      workspaceRoot:root,
      runArtifactChain:async(_payload,options)=>{
        await new Promise(resolve=>setTimeout(resolve,2800));
        options.onScanCoreComplete?.();
        // A terminal capture's cleanup/upload previously raced the four-second
        // artifact deadline even though the worker still had approved reserve.
        await new Promise(resolve=>setTimeout(resolve,1350));
        options.artifactSignal?.throwIfAborted();
        return {artifactPointers:{saleSharingOptOutPacketUri:"s3://test-bucket/verified.json"},artifactMetadata:{saleSharingOptOutPacketUri:{sha256:"a".repeat(64),sizeBytes:100}},phaseTimings:[]};
      },sqsClient:{async send(){publications++;return {$metadata:{}};}},
    });
    assert.equal(result.status,"completed");
    assert.equal(result.workerLane,"sale_sharing_opt_out");
    assert.equal(result.artifactPointers?.saleSharingOptOutPacketUri,"s3://test-bucket/verified.json");
    assert.equal(publications,0,"Worker never independently publishes a customer report");
  } finally {await rm(root,{recursive:true,force:true});}
});


for(const routeCase of ["valid","downgrade","bad_ancestry","wrong_parent","wrong_hash"] as const)for(const enabled of [true,false])test(`sale/sharing exact-route coordinator binding: ${routeCase}, enabled=${enabled}`,async()=>{
  const oldFlag=process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED,oldBucket=process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED=enabled?"1":"0";process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET="test-bucket";
  let root:string|undefined;
  try{
    const scanId=`route-${routeCase}-${enabled}`,started=Date.now();
    const result=await runCoordinatorFixture({scanId,optOut:"complete",routeCase,action:"none",dispatchDelayMs:1000,consentBundle:coordinatorConsentBundle(scanId,{inspectionCompleted:true,acceptControlObserved:false})});root=result.artifactRoot;
    assert.ok(Date.now()-started<1500);assert.equal(result.workerCalls.includes("sale_sharing_opt_out"),enabled);
    assert.equal(Boolean(result.bundle.saleSharingOptOut),enabled&&routeCase==="valid");
    assert.equal(result.bundle.saleSharingOptOutLaneOutcome?.status,!enabled?undefined:routeCase==="valid"?"joined":"limited");
    if(enabled&&routeCase==="valid"){
      assert.equal(result.bundle.saleSharingOptOut?.evidence.targetUrl,"https://readcube.com/");
      assert.equal(result.bundle.saleSharingOptOut?.evidence.exactRouteProof?.hops.length,2);
      assert.equal(result.bundle.saleSharingOptOut?.evidence.actionTargetUrl,"https://about.readcube.com/");
    }
  }finally{
    if(oldFlag===undefined)delete process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED;else process.env.CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED=oldFlag;
    if(oldBucket===undefined)delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET=oldBucket;
    if(root)await rm(root,{recursive:true,force:true});
  }
});

test("sale/sharing exact-route retention preserves hashed bytes and rejects a mismatched parent before writes",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"exact-route-retention-")),oldBucket=process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;
  process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET="test-bucket";let uploads=0;
  try{
    const packet=exactRouteEvidenceFixture();
    const payload=parseLocalV2DagLambdaDispatchPayload(validPayload({scanId:packet.scanId,callbackCorrelationId:packet.scanId,targetUrl:packet.targetUrl,hostname:"jaguar.com",orchestrationMode:"worker",workerLane:"sale_sharing_opt_out",parentDispatchSha256:packet.parentDispatchSha256,
      saleSharingOptOut:{policyVersion:SALE_SHARING_EXACT_ROUTE_POLICY,enabled:true,scanId:packet.scanId,exactTargetUrl:packet.targetUrl,exactRouteAuthorization:packet.exactRouteAuthorization}}));
    const s3Client={async send(command:any){uploads++;const bytes=Buffer.from(command.input.Body);assert.deepEqual(JSON.parse(bytes.toString()).exactRouteProof,packet.exactRouteProof);assert.equal(command.input.Metadata.sha256,createHash("sha256").update(bytes).digest("hex"));return {$metadata:{}};}};
    const result=await retainSaleSharingOptOutPacket(payload,packet,{artifactRoot:root,s3Client});
    const saved=await readFile(path.join(root,"SaleSharingOptOutEvidencePacket.json"));
    assert.equal(result.artifactMetadata?.saleSharingOptOutPacketUri?.sizeBytes,saved.length);
    assert.equal(result.artifactMetadata?.saleSharingOptOutPacketUri?.sha256,createHash("sha256").update(saved).digest("hex"));
    assert.notEqual(postRefusalParentDispatchSha256(payload),postRefusalParentDispatchSha256({...payload,saleSharingOptOut:undefined}),"grant is included in parent hash");
    await assert.rejects(retainSaleSharingOptOutPacket(payload,{...packet,parentDispatchSha256:"f".repeat(64)},{artifactRoot:path.join(root,"rejected"),s3Client}),/sale_sharing_packet_binding_mismatch/);
    assert.equal(uploads,1);
  }finally{if(oldBucket===undefined)delete process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET;else process.env.CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET=oldBucket;await rm(root,{recursive:true,force:true});}
});

test("presence-only profile blocks optional injection and preserves independent GPC and parent binding", async () => {
  const previous=process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED;
  process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED="1";
  try {
    const raw=validPayload({orchestrationMode:"sharded",privacyCaptureProfile:PRESENCE_ONLY_CAPTURE_PROFILE,
      gpcObservation:{contractVersion:"certscore.gpc-observation-dispatch.v1",enabled:true,pairWithLane:"runtime_evidence",protocol:"passive_baseline_with_sec_gpc"}});
    const parsed=parseLocalV2DagLambdaDispatchPayload(raw);
    assert.equal(parsed.cmpPreferenceInspection,undefined);assert.equal(parsed.saleSharingOptOut,undefined);
    assert.equal(parsed.privacyCaptureProfile,PRESENCE_ONLY_CAPTURE_PROFILE);
    const legacy={...parsed};delete legacy.privacyCaptureProfile;
    assert.notEqual(postRefusalParentDispatchSha256(parsed),postRefusalParentDispatchSha256(legacy));
    for(const patch of [{privacyCaptureProfile:"future"},{gpcObservation:undefined},{workerLane:"cmp_preferences"},
      {cmpPreferenceInspection:{}},{saleSharingOptOut:{}},{orchestrationMode:"single"}])
      assert.throws(()=>parseLocalV2DagLambdaDispatchPayload({...raw,...patch}),/capture|profile/);
    let calls=0;const client={async send(){calls++;throw Error("must not invoke");}};
    for(const workerLane of ["cmp_preferences","sale_sharing_opt_out"] as const)
      await assert.rejects(invokeLocalV2DagLambdaWorker({parentPayload:parsed,parentScanId:parsed.scanId,workerLane,lambdaClient:client}),/excludes/);
    assert.equal(calls,0);
  } finally {if(previous===undefined)delete process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED;else process.env.CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED=previous;}
});

test("presence-only coordinator invokes at most the six core workers with both optional flags enabled", async () => {
  const keys=["CERTSCORE_CMP_PREFERENCE_INSPECTION_ENABLED","CERTSCORE_SALE_SHARING_OPT_OUT_ENABLED",POST_ACCEPT_WORKER_FEATURE_FLAG,POST_REFUSAL_REJECT_WORKER_FEATURE_FLAG,"CERTSCORE_V2_DAG_LAMBDA_ARTIFACT_BUCKET"];
  const previous=keys.map(key=>process.env[key]); keys.forEach(key=>{process.env[key]=key.endsWith("ARTIFACT_BUCKET")?"test-bucket":"1";});
  let artifactRoot:string|undefined;
  try {
    const scanId="presence-six-workers", baseline=gpcRuntimeFixture({enabled:false,url:"https://example.com/"}),gpc=gpcRuntimeFixture({enabled:true,url:"https://example.com/"});
    baseline.scanId=scanId;gpc.scanId=scanId;
    baseline.domSnapshots=[{...runtimeSnapshotFixture(),url:baseline.url}];
    const outcome=await runCoordinatorFixture({scanId,presenceOnly:true,bothActions:true,action:"completed",dispatchDelayMs:0,
      consentBundle:coordinatorConsentBundle(scanId,{inspectionCompleted:true,acceptControlObserved:true,rejectControlObserved:true}),gpcPair:{baseline,gpc}});
    artifactRoot=outcome.artifactRoot;
    assert.deepEqual([...outcome.workerCalls].sort(),[...PRESENCE_ONLY_WORKER_LANES].sort());
    assert.equal(outcome.bundle.cmpPreferencesEvidence,undefined);assert.equal(outcome.bundle.cmpPreferenceLaneOutcome,undefined);
    assert.equal(outcome.bundle.saleSharingOptOut,undefined);
    assert.ok(outcome.bundle.postAcceptEvidence);assert.ok(outcome.bundle.gpcResponseAssessment);
    assert.equal(outcome.bundle.postRefusalLaneOutcome.status,"failed");
    const manifest=JSON.parse(await readFile(path.join(artifactRoot!,"LocalV2DagLambdaManifest.json"),"utf8"));
    assert.equal(manifest.privacyCaptureProfile,PRESENCE_ONLY_CAPTURE_PROFILE);
  } finally {
    keys.forEach((key,index)=>{if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];});
    if(artifactRoot)await rm(artifactRoot,{recursive:true,force:true});
  }
});
