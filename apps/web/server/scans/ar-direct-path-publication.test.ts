import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {createHash, randomUUID} from "node:crypto";
import {cp, writeFile} from "node:fs/promises";
import path from "node:path";
import {canonicalEvidenceBundleSchema} from "@certscore/contracts";
import {runScan} from "../../../../packages/certscore-scan-core/src/index";
import {runPostAcceptObserver} from "../../../../packages/certscore-scan-core/src/post-accept-observer";
import {runPostRefusalObserver} from "../../../../packages/certscore-scan-core/src/post-refusal-observer";
import {CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE} from "../../../../packages/certscore-scan-core/src/post-accept-cmp-recipes";
import {CERTSCORE_OWNED_ANALYTICS_REJECT_RECIPE} from "../../../../packages/certscore-scan-core/src/post-refusal-cmp-recipes";
import {redirectPublicationHarness} from "./redirect-publication.fixture";

// Uses the existing genuine node:test loopback fixture mode. No guard flag,
// production handler, external target, real AWS client or real DB is changed.
test("localhost runtime retains bound A/R evidence and preserves canonical publication safeguards", async () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  const h = await redirectPublicationHarness();
  const clicks = {accept: 0, reject: 0};
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/clicked/")) {
      const action = request.url.split("/").pop();if (action === "accept" || action === "reject") clicks[action]++;
      response.end("ok");return;
    }
    if (request.url !== "/") {response.statusCode = 404;response.end("missing fixture");return;}
    response.setHeader("content-type", "text/html");response.end(`<!doctype html><html lang="en"><head><title>CertScore.ai local A/R fixture</title></head><body>
      <main><h1>Local consent fixture</h1><p>Optional analytics consent can be accepted or rejected.</p></main>
      <section aria-label="Cookie and analytics preferences" role="dialog"><p>Choose optional analytics cookies.</p>
      <button type="button" data-certscore-consent-action="accept">Accept all</button>
      <button type="button" data-certscore-consent-action="reject">Reject all</button></section><script>
      for(const [action,decision] of [['accept','granted'],['reject','denied']])document.querySelector('[data-certscore-consent-action="'+action+'"]').onclick=()=>{
        localStorage.setItem('certscore:analytics-consent:v1',decision);fetch('/clicked/'+action);
      };</script></body></html>`);
  });
  await new Promise<void>((resolve, reject) => {server.once("error", reject);server.listen(3000, "localhost", resolve);});
  const started = Date.now(), scanId = `local-ar-publication-${randomUUID()}`, url = "http://localhost:3000/";
  try {
    const passive = await runScan({scanId, url, profile: "standard", outDir: h.directory,
      localPolicyNanoAssistProvider: {async classifyLinks(input) {
        return {assistId: input.assistId, rankedCandidates: []};
      }}});
    const common = {url, parentScanId: scanId, boundControlDispatch: true,
      interactionAuthorization: {kind: "loopback" as const, authorizationId: "loopback_local_lab" as const}, productionProjectable: true};
    const accept = await runPostAcceptObserver({...common, scanId: `${scanId}:accept`, recipe: CERTSCORE_OWNED_ANALYTICS_ACCEPT_RECIPE,
      actionSearchTimeoutMs: 14000, confirmationTimeoutMs: 2000, observationWindowMs: 3000, requireFullConfiguredWindow: true});
    const reject = await runPostRefusalObserver({...common, scanId: `${scanId}:reject`, recipe: CERTSCORE_OWNED_ANALYTICS_REJECT_RECIPE,
      actionSearchTimeoutMs: 1500, confirmationTimeoutMs: 1500, observationWindowMs: 8000});
    assert.deepEqual(clicks, {accept: 1, reject: 1});
    assert.equal(accept.acceptanceRegistration.status, "confirmed");assert.equal(reject.refusalRegistration.status, "confirmed");
    const bundle = canonicalEvidenceBundleSchema.parse({...passive, completedAt: new Date().toISOString(), postAcceptEvidence: accept, postRefusalEvidence: reject});
    const bodies = {scanArtifactUri: JSON.stringify(bundle), manifestUri: JSON.stringify({auxiliaryArtifacts: []}),
      postAcceptPacketUri: JSON.stringify(bundle.postAcceptEvidence), postRefusalPacketUri: JSON.stringify(bundle.postRefusalEvidence)};
    const names = {scanArtifactUri: "CanonicalEvidenceBundle.json", manifestUri: "LocalV2DagLambdaManifest.json",
      postAcceptPacketUri: "PostAcceptEvidencePacket.json", postRefusalPacketUri: "PostRefusalEvidencePacket.json"};
    const artifactPointers: Record<string, string> = {}, artifactMetadata: Record<string, unknown> = {};
    for (const field of Object.keys(names) as Array<keyof typeof names>) {
      await writeFile(path.join(h.directory, names[field]), bodies[field]);
      artifactPointers[field] = `s3://offline-fixture/${scanId}/${names[field]}`;
      artifactMetadata[field] = {sha256: createHash("sha256").update(bodies[field]).digest("hex"), sizeBytes: Buffer.byteLength(bodies[field])};
    }
    const processor = "local-certscore-v2-dag-parallel-v1";
    const record = {scan: {id: scanId, domainHostname: "localhost", status: "completed", scanType: "full", scanFromValue: "california",
      createdAt: bundle.startedAt, startedAt: bundle.startedAt, completedAt: bundle.completedAt, pagesRequested: 1, pagesScanned: 1,
      scanConfigJson: {processor, hostname: "localhost", normalizedUrl: url, execution: {v2DagParallel: {localOnly: true, artifactOnly: true, profile: "standard"}, localV2Dag: {outDir: h.directory}}}},
      signalEnrichmentWorkflow: {findingsReady: true, mergedSignalsReady: true},
      events: [{id: "local-ar-result", eventType: "v2_lambda_result.received", createdAt: bundle.completedAt,
        metadataJson: {artifactOnly: true, productionFindingIntegration: false, processor, artifactPointers, artifactMetadata}}],
      pageEvidence: [], policyEnrichment: [], policyReviewQueue: [], preconsentViolations: [], primaryPolicyEnrichment: null,
      runtimeArtifacts: {}, signals: [], snapshot: {}, trackerVendors: [], validationFindings: []};
    h.state.record = record;
    // This HTTP-only loopback fixture cannot establish reportable production
    // posture scores. Preserve the canonical guard instead of manufacturing
    // scores or relaxing the publication invariant to force a ready report.
    await assert.rejects(() => h.pipeline.publishCanonicalScanReportProjection({organizationId: null, scanId, publicationTrigger: "authorized_worker"}),
      /posture_scores_unavailable/);
    assert.equal(h.state.writes.some((row: {sql: string}) => row.sql.includes("insert into public.scan_snapshots")), false);
    await writeFile(path.join(h.directory, "LocalArPublicationCheck.json"), JSON.stringify({runtime: "local-node-test-core-and-publisher", productionCoordinatorExercised: false,
      databaseAndAws: "repository-I/O-doubles", policyProvider: "loopback-only-empty-deterministic", profile: "standard", elapsedMs: Date.now() - started, clicks,
      acceptRegistration: accept.acceptanceRegistration.status, rejectRegistration: reject.refusalRegistration.status,
      reportReady: false, publicationBlocker: "posture_scores_unavailable"}, null, 2));
    await cp(h.directory, "/tmp/certscore-ar-local-publication-evidence", {recursive: true, errorOnExist: true});
  } finally {
    await cp(h.directory, `/tmp/certscore-ar-local-publication-attempt-${scanId}`, {recursive: true, errorOnExist: true});
    if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    await new Promise<void>(resolve => server.close(()=>resolve()));await h.close();
  }
});
