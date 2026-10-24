import {withOriginalRuntimeForPublication} from "./consent-canary-accuracy.fixture";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { consentControlAssessmentSchema, CALIFORNIA_CHOICE_ABSENCE_ID, CALIFORNIA_PRIVACY_REVIEW_IDS } from "@certscore/contracts";
import { redirectPublicationHarness } from "./redirect-publication.fixture";
import { projectCanonicalSurfaceSummary } from "../../lib/scans/canonical-surface-summary";
import { classifyScoreMaterializationFailure } from "./score-materialization-failure";
import { build } from "esbuild";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const webRequire = createRequire(path.resolve("apps/web/package.json"));

test("publication skips stale loaded/materialized generations before expensive projection and preserves the final guard", async () => {
  await mkdir(path.resolve("tmp"), { recursive: true });
  const directory = await mkdtemp(path.resolve("tmp/publisher-speed-"));
  const fixture = path.join(directory, "fixture.cjs");
  const output = path.join(directory, "publisher.cjs");
  try {
    await writeFile(fixture, `
      const state = {loads:0,materializations:0,projections:0,latest:1,changeOnLoad:true,changeOnMaterialize:true};
      class StaleScanReportProjectionSourceError extends Error {}
      class ScanReportProjectionNotReadyError extends Error {}
      async function load() {
        state.loads++;
        const record = {scan:{id:'scan',status:'completed'},snapshot:{},events:[{id:String(state.latest),createdAt:'2026-10-08T12:00:00.000Z',eventType:'v2_lambda_result.received'}],signalEnrichmentWorkflow:{findingsReady:true,mergedSignalsReady:true}};
        if (state.changeOnLoad) {state.changeOnLoad=false;state.latest++;}
        return record;
      }
      module.exports = {state,StaleScanReportProjectionSourceError,ScanReportProjectionNotReadyError,
        queryOne: async sql => sql.includes('worker_reserved')
          ? {scan_status:'completed',projection_required:true,merged_signals_ready:true,findings_ready:true,worker_reserved:false}
          : {event_count:1,latest_event_id:String(state.latest)},
        withNonBlockingDatabaseLock: async (key,run) => ({acquired:true,value:await run()}),
        getScanById:load,getAnonymousScanById:load,
        getLocalV2DagReportInput:() => ({}),
        materializeLocalV2DagScanDetail:async record => {state.materializations++;if(state.changeOnMaterialize){state.changeOnMaterialize=false;state.latest++;}return record},
        persistScanReportProjection: async record => {state.projections++;if(record.events[0].id!==String(state.latest))throw new StaleScanReportProjectionSourceError('stale')},
        getPersistedScanReportProjection:()=>null,isCurrentScanReportProjectionReady:()=>false,
        SCAN_REPORT_PROJECTION_VERSION:'test',getPublicScanStatusProjection:()=>null};
    `);
    await build({ entryPoints: [path.resolve("apps/web/server/scans/canonical-scan-report-publisher.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "publisher-fixture", setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
        builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
        builder.onResolve({ filter: /(?:@website-signal-risk-scanner\/db|\.\/get-scan-by-id|\.\/local-v2-dag-report|\.\/scan-report-projection|\.\/scan-report-projection-contract|\.\/scan-status-projection)$/ },
          () => ({ path: fixture, external: true }));
        builder.onResolve({ filter: /^@(?:certscore|website-signal-risk-scanner)\// }, args => ({ path: webRequire.resolve(args.path), external: true }));
      } }] });
    const require = createRequire(import.meta.url);
    const { state } = require(fixture);
    const { publishCanonicalScanReportProjection } = require(output);
    const result = await publishCanonicalScanReportProjection({ organizationId: null, scanId: "scan" });
    assert.equal(result.status, "ready");
    assert.equal(result.latestEventId, "3");
    assert.equal(state.loads, 3);
    assert.equal(state.materializations, 2, "stale load must not start materialization");
    assert.equal(state.projections, 1, "stale materialization must not start projection");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("read recovery cannot steal worker publication or coalesce away its artifact transfer", async () => {
  await mkdir(path.resolve("tmp"), { recursive: true });
  const directory = await mkdtemp(path.resolve("tmp/publisher-ownership-"));
  const fixture = path.join(directory, "fixture.cjs");
  const output = path.join(directory, "publisher.cjs");
  try {
    await writeFile(fixture, `
      let release;
      const ownershipRead = new Promise(resolve => {release=resolve});
      const state = {locks:0,loads:0,materializations:0,projections:0,transfer:null,ownershipReads:0,release};
      const record = {scan:{id:'scan',status:'completed'},snapshot:{},events:[{id:'1',createdAt:'2026-10-08T12:00:00.000Z',eventType:'v2_lambda_result.received'}],signalEnrichmentWorkflow:{findingsReady:true,mergedSignalsReady:true}};
      module.exports = {state,
        StaleScanReportProjectionSourceError:class extends Error {},ScanReportProjectionNotReadyError:class extends Error {},
        queryOne:async sql => {
          if(sql.includes('worker_reserved')){state.ownershipReads++;await ownershipRead;return {scan_status:'completed',projection_required:true,merged_signals_ready:true,findings_ready:true,worker_reserved:true}}
          return {event_count:1,latest_event_id:'1'};
        },
        withNonBlockingDatabaseLock:async(key,run)=>{state.locks++;return {acquired:true,value:await run()}},
        getScanById:async()=>{state.loads++;return record},getAnonymousScanById:async()=>{state.loads++;return record},
        getLocalV2DagReportInput:()=>({}),
        materializeLocalV2DagScanDetail:async(record,options)=>{state.materializations++;state.transfer=options.artifactTransfer;return record},
        persistScanReportProjection:async()=>{state.projections++},
        getPersistedScanReportProjection:()=>null,isCurrentScanReportProjectionReady:()=>false,
        SCAN_REPORT_PROJECTION_VERSION:'test',getPublicScanStatusProjection:()=>null};
    `);
    await build({ entryPoints: [path.resolve("apps/web/server/scans/canonical-scan-report-publisher.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "ownership-fixture", setup(builder) {
        builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
        builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
        builder.onResolve({ filter: /(?:@website-signal-risk-scanner\/db|\.\/get-scan-by-id|\.\/local-v2-dag-report|\.\/scan-report-projection|\.\/scan-report-projection-contract|\.\/scan-status-projection)$/ },
          () => ({ path: fixture, external: true }));
        builder.onResolve({ filter: /^@(?:certscore|website-signal-risk-scanner)\// }, args => ({ path: webRequire.resolve(args.path), external: true }));
      } }] });
    const require = createRequire(import.meta.url);
    const { state } = require(fixture);
    const { publishCanonicalScanReportProjection: publish } = require(output);
    const read = publish({ organizationId: null, scanId: "scan", artifactTransfer: { untrusted: true } });
    const duplicate = publish({ organizationId: null, scanId: "scan" });
    assert.equal(read, duplicate, "read callers still coalesce");
    const forceRead = publish({ organizationId: null, scanId: "scan", forceRebuild: true });
    const transfer = { worker: "original retained bytes" };
    const worker = publish({ organizationId: null, scanId: "scan", publicationTrigger: "authorized_worker", artifactTransfer: transfer });
    // A pending read-side query must not block or replace the authorized worker promise.
    assert.notEqual(read, worker);
    const result = await Promise.race([worker, new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("worker coalesced with pending read")), 1000);
      timer.unref();
    })]);
    assert.equal(result.status, "ready");
    assert.equal(state.transfer, transfer);
    state.release();
    for (const pending of [read, forceRead]) {
      assert.equal((await pending).reason, "durable_worker_publication_pending");
    }
    assert.deepEqual({locks:state.locks,loads:state.loads,materializations:state.materializations,projections:state.projections},
      {locks:1,loads:1,materializations:1,projections:1});
    assert.equal(state.ownershipReads, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

const digest = (bytes: string) => ({ sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: Buffer.byteLength(bytes) });

test("redirected retained evidence publishes once through assessment, concerns, persisted report, API and PDF", async () => {
  const harness = await redirectPublicationHarness();
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  try {
    const { pipeline, state } = harness;
    // Proen and Varify URL shapes, plus unchanged root/non-slash controls.
    for (const [index, pathname] of ["/web/", "/en/", "/", "/en"].entries()) {
      const scanId = `00000000-0000-4000-8000-00000000000${index}`;
      const requestedUrl = "https://redirect-fixture.test/";
      const finalUrl = `https://redirect-fixture.test${pathname}`;
      const outDir = path.join(harness.directory, String(index));
      await mkdir(outDir);
      const bundle = {
        schemaVersion: "certscore.v2.canonical-evidence-bundle.v1", scanId, url: requestedUrl, normalizedUrl: requestedUrl,
        startedAt: "2026-10-19T10:00:00.000Z", completedAt: "2026-10-19T10:00:10.000Z",
        domSnapshots: [{artifactId:"dom",capturedAtMs:6500,url:finalUrl,consentStateAtTime:"pre_consent",textExcerpt:"Public services, product documentation, support contacts, useful resources, company information and customer announcements.",documentIdentity:{source:"cdp_loader_id",token:"document"}}],
        transportSecurityObservations: [{finalUrl}],
        runtimeCoverage: {coverageStatus:"usable",limitationKeys:[],fallbackModesUsed:[],notes:[],silentEmpty:false,
          observationCounts:{networkEvents:0,thirdPartyRequests:0,cookieEvents:0,cookiesBeforeConsent:0,normalizedVendors:0,observedJourneys:0}},
        consentUiObservations: [], policySurfaceObservations: [], networkEvents: [], cookieEvents: [], iframeEvents: [], modulesRun: [], screenshots: [], runtimeTimeline: [],
        policySurfaceInspection: {privacyChoiceInspection:{
          contractVersion:"certscore.privacy-choice-inspection.v1",documentUrl:finalUrl,capturedAt:"2026-10-19T10:00:06.500Z",sourceHash:"b".repeat(64),
          scope:"rendered_named_links_and_buttons",coverage:"complete",namedChoiceCandidateCount:0,unnamedControlCount:0,
          candidateEnumerationTruncated:false,uninspectedFrameCount:0,uninspectedShadowRootCount:0,
          supportedDocumentLanguage:true,representativeDocument:true,documentStable:true,
        }},
      };
      const bundleBytes = JSON.stringify(bundle);
      const manifestBytes = JSON.stringify({auxiliaryArtifacts:[]});
      await writeFile(path.join(outDir,"CanonicalEvidenceBundle.json"),bundleBytes);
      await writeFile(path.join(outDir,"LocalV2DagLambdaManifest.json"),manifestBytes);
      const metadata = {artifactOnly:true,productionFindingIntegration:false,processor:"local-certscore-v2-dag-parallel-v1",artifactPointers:{scanArtifactUri:`s3://offline-fixture/${scanId}/CanonicalEvidenceBundle.json`,manifestUri:`s3://offline-fixture/${scanId}/LocalV2DagLambdaManifest.json`},
        artifactMetadata:{scanArtifactUri:digest(bundleBytes),manifestUri:digest(manifestBytes)}};
      const record = {
        scan:{id:scanId,domainHostname:"redirect-fixture.test",status:"completed",scanType:"full",scanFromValue:"california",createdAt:bundle.startedAt,startedAt:bundle.startedAt,completedAt:bundle.completedAt,pagesRequested:1,pagesScanned:1,
          scanConfigJson:{processor:"local-certscore-v2-dag-parallel-v1",hostname:"redirect-fixture.test",normalizedUrl:requestedUrl,execution:{v2DagParallel:{localOnly:true,artifactOnly:true,profile:"standard"},localV2Dag:{outDir}}}},
        signalEnrichmentWorkflow:{findingsReady:true,mergedSignalsReady:true},
        events:[{id:"1",eventType:"v2_lambda_result.received",createdAt:bundle.completedAt,metadataJson:metadata}],
        pageEvidence:[],policyEnrichment:[],policyReviewQueue:[],preconsentViolations:[],primaryPolicyEnrichment:null,runtimeArtifacts:{},signals:[],snapshot:{},trackerVendors:[],validationFindings:[],
      };
      state.record = record; state.writes.length = 0;
      const materialized = await pipeline.materializeLocalV2DagScanDetail(record);
      const validation = consentControlAssessmentSchema.safeParse(materialized.runtimeArtifacts.consentControlAssessment);
      assert.ok(validation.success, JSON.stringify(validation.success ? null : validation.error.issues));
      const publication = await pipeline.publishCanonicalScanReportProjection({organizationId:null,scanId,publicationTrigger:"authorized_worker"});
      assert.equal(publication.status,"ready",pathname);
      assert.equal(publication.reason,"published");
      const writes = state.writes.filter((row: {sql:string}) => row.sql.includes("insert into public.scan_snapshots"));
      assert.equal(writes.length,1,"one atomic canonical publication");
      const params = writes[0].params;
      const persistedAssessment = consentControlAssessmentSchema.parse(JSON.parse(params[30]));
      assert.equal(persistedAssessment.scan.finalUrl,finalUrl);
      assert.equal(persistedAssessment.californiaPrivacyReview?.documentUrl,finalUrl);
      assert.equal(persistedAssessment.californiaPrivacyReview?.verificationStatus,"verified");
      assert.equal(persistedAssessment.californiaPrivacyReview?.sourceHash,metadata.artifactMetadata.scanArtifactUri.sha256);
      const snapshot = {report_projection_version:params[28],report_projection_status:"ready",report_projection_computed_at:bundle.completedAt,
        report_projection_payload:JSON.parse(params[37]),report_projection_payload_sha256:params[38],report_projection_payload_size_bytes:params[39]};
      const readback = pipeline.readPersistedScanReportProjection({scan:record.scan,snapshot});
      assert.ok(readback,"checksum-verified persisted readback");
      const projection = readback.canonicalReportProjection;
      assert.ok(projection.normalizedConcerns.some((row: {id:string}) => JSON.stringify(row).includes(CALIFORNIA_CHOICE_ABSENCE_ID)));
      assert.ok(projection.globalUnifiedFindings.some((row: {unifiedFindingId:string}) => row.unifiedFindingId===CALIFORNIA_CHOICE_ABSENCE_ID));
      const api = pipeline.buildApiV2ScanResource(readback);
      assert.equal(api.status,"completed"); assert.equal(api.scoreStatus,"final");
      assert.equal(api.postureScores.ccpaCpra.score,94);
      assert.equal(pipeline.buildApiV2ScanStatus(readback,{canonicalScan:api}).status,"completed");
      const report = pipeline.buildCanonicalReportExport(readback,undefined,"ccpa_cpra");
      assert.ok(report);
      assert.equal(report.californiaScore.score,94);
      assert.match(pipeline.renderCanonicalReportPdf(report).toString("latin1"),/CCPA\/CPRA evidence report/);
      // Integrity failures stay terminal; optional child failures preserve verified parent results.
      assert.equal(pipeline.readPersistedScanReportProjection({scan:record.scan,snapshot:{...snapshot,report_projection_payload_sha256:"0".repeat(64)}}),null);
      for (const patch of [{documentUrl:`${finalUrl}other`},{scanId:"other-scan"},{contractVersion:"malformed-child"}]) {
        const invalid = structuredClone(materialized);
        invalid.runtimeArtifacts.consentControlAssessment.californiaPrivacyReview = {...persistedAssessment.californiaPrivacyReview,...patch};
        invalid.runtimeArtifacts.consent_control_assessment = invalid.runtimeArtifacts.consentControlAssessment;
        invalid.runtimeArtifacts.hybridRuntimeEvidence.consentControlAssessment = invalid.runtimeArtifacts.consentControlAssessment;
        assert.equal(consentControlAssessmentSchema.safeParse(invalid.runtimeArtifacts.consentControlAssessment).success,false,"strict contract remains strict");
        const parentProvenance=structuredClone(invalid.runtimeArtifacts.consentControlAssessment.provenance);
        state.writes.length=0;
        await assert.rejects(pipeline.persistScanReportProjection(invalid,{enforceDualPostureScores:true}),
          (error:unknown)=>classifyScoreMaterializationFailure(error).diagnostic === "publication_invariant_failed:posture_scores_unavailable");
        assert.equal(state.writes.filter((row:{sql:string})=>row.sql.includes("insert into public.scan_snapshots")).length,0,"new publication cannot persist a one-score report");
        await pipeline.persistScanReportProjection(invalid);
        const partialWrites=state.writes.filter((row:{sql:string})=>row.sql.includes("insert into public.scan_snapshots"));
        assert.equal(partialWrites.length,1,"publish the verified remainder once");
        const partialParams=partialWrites[0].params;
        const parent=consentControlAssessmentSchema.parse(JSON.parse(partialParams[30]));
        assert.equal(parent.californiaPrivacyReview,undefined);
        assert.deepEqual(parent.provenance,parentProvenance,"preserve original parent evidence provenance");
        assert.deepEqual(parent.controls,persistedAssessment.controls);
        const partial=pipeline.readPersistedScanReportProjection({scan:record.scan,snapshot:{...snapshot,
          report_projection_payload:JSON.parse(partialParams[37]),report_projection_payload_sha256:partialParams[38],report_projection_payload_size_bytes:partialParams[39]}});
        assert.ok(partial);
        assert.equal(partial.canonicalReportProjection.globalUnifiedFindings.some((row:{unifiedFindingId:string})=>row.unifiedFindingId===CALIFORNIA_CHOICE_ABSENCE_ID),false);
        const independentIds=(findings:{unifiedFindingId:string}[])=>findings.map(row=>row.unifiedFindingId).filter(id=>!(CALIFORNIA_PRIVACY_REVIEW_IDS as readonly string[]).includes(id)).sort();
        assert.deepEqual(independentIds(partial.canonicalReportProjection.globalUnifiedFindings),independentIds(projection.globalUnifiedFindings),"independent findings survive child isolation");
        assert.equal(consentControlAssessmentSchema.safeParse(invalid.runtimeArtifacts.consentControlAssessment).success,false,"original evidence input remains unchanged");
        assert.equal(JSON.stringify(partial).includes('"californiaPrivacyReview"'),false,"invalid child cannot survive in any persisted alias or concern");
        const partialApi=pipeline.buildApiV2ScanResource(partial);
        assert.equal(partialApi.status,"completed");assert.equal(partialApi.scoreStatus,"final");
        assert.equal(partialApi.score,api.score,"independent overall score preserved");
        assert.equal(partialApi.postureScores.ccpaCpra.score,null,"excluded evidence cannot produce an invented California score");
        for(const focus of ["gdpr_eprivacy","ccpa_cpra"]){
          const partialReport=pipeline.buildCanonicalReportExport(partial,undefined,focus);
          assert.ok(partialReport);
          assert.equal(partialReport.californiaScore.score,null);
          assert.match(pipeline.renderCanonicalReportPdf(partialReport).toString("latin1"),/evidence report/);
        }
      }
      const invalidParent=structuredClone(materialized);
      for(const assessment of [invalidParent.runtimeArtifacts.consentControlAssessment,invalidParent.runtimeArtifacts.consent_control_assessment,
        invalidParent.runtimeArtifacts.hybridRuntimeEvidence.consentControlAssessment,invalidParent.runtimeArtifacts.hybrid_runtime_evidence.consentControlAssessment,
        invalidParent.snapshot?.consent_control_assessment].filter(Boolean)){
        assessment.provenance.contractVersion="2.0";
        assessment.californiaPrivacyReview={...persistedAssessment.californiaPrivacyReview,scanId:"other-scan"};
      }
      state.writes.length=0;
      await assert.rejects(pipeline.persistScanReportProjection(invalidParent),(error:unknown)=>{
        const failure=classifyScoreMaterializationFailure(error);
        assert.equal(failure.code,"publication_invariant_failed");assert.equal(failure.retryable,false);return true;
      });
      assert.equal(state.writes.length,0,"an invalid parent cannot be rescued by dropping its child");

    }
  } finally {
    if(previousAppUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previousAppUrl;
    await harness.close();
  }
});

test("seven retained canary shapes preserve consent eligibility through canonical publication and all report projections",async()=>{
  const {consentCanaryVisits,consentCanaryAccuracyFixture}=await import("./consent-canary-accuracy.fixture");
  const harness=await redirectPublicationHarness();
  const previousAppUrl=process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL="http://localhost:3000";
  try{
    for(let i=0;i<consentCanaryVisits.length;i++){
      const f=consentCanaryAccuracyFixture(i);withOriginalRuntimeForPublication(f.bundle);const outDir=path.join(harness.directory,`canary-${i}`);
      await mkdir(outDir);
      const bytes=JSON.stringify(f.bundle),geometryBytes=JSON.stringify(f.geometry);
      const manifestBytes=JSON.stringify({auxiliaryArtifacts:[{fileName:"ConsentControlGeometryEvidence.json",uri:`s3://offline-fixture/${f.scanId}/ConsentControlGeometryEvidence.json`,...digest(geometryBytes)}]});
      await writeFile(path.join(outDir,"CanonicalEvidenceBundle.json"),bytes);
      await writeFile(path.join(outDir,"ConsentControlGeometryEvidence.json"),geometryBytes);
      await writeFile(path.join(outDir,"LocalV2DagLambdaManifest.json"),manifestBytes);
      const metadata={processor:"local-certscore-v2-dag-parallel-v1",artifactOnly:true,productionFindingIntegration:false,
        artifactPointers:{scanArtifactUri:`s3://offline-fixture/${f.scanId}/CanonicalEvidenceBundle.json`,manifestUri:`s3://offline-fixture/${f.scanId}/LocalV2DagLambdaManifest.json`},
        artifactMetadata:{scanArtifactUri:digest(bytes),manifestUri:digest(manifestBytes)}};
      const record={scan:{id:f.scanId,domainHostname:"consent-fixture.test",status:"completed",scanType:"full",scanFromValue:"california",
        createdAt:f.bundle.startedAt,startedAt:f.bundle.startedAt,completedAt:f.bundle.completedAt,pagesRequested:1,pagesScanned:1,
        scanConfigJson:{processor:metadata.processor,hostname:"consent-fixture.test",normalizedUrl:f.url,execution:{v2DagParallel:{localOnly:true,artifactOnly:true,profile:"standard"},localV2Dag:{outDir}}}},
        signalEnrichmentWorkflow:{findingsReady:true,mergedSignalsReady:true},events:[{id:"1",eventType:"v2_lambda_result.received",createdAt:f.bundle.completedAt,metadataJson:metadata}],
        pageEvidence:[],policyEnrichment:[],policyReviewQueue:[],preconsentViolations:[],primaryPolicyEnrichment:null,runtimeArtifacts:{},signals:[],snapshot:{},trackerVendors:[],validationFindings:[]};
      harness.state.record=record;harness.state.writes.length=0;
      const publication=await harness.pipeline.publishCanonicalScanReportProjection({organizationId:null,scanId:f.scanId,publicationTrigger:"authorized_worker"});
      assert.equal(publication.status,"ready",f.visit.sourceScanId);
      const writes=harness.state.writes.filter((row:{sql:string})=>row.sql.includes("insert into public.scan_snapshots"));
      assert.equal(writes.length,1);
      const params=writes[0].params;
      const assessment=consentControlAssessmentSchema.parse(JSON.parse(params[30]));
      assert.equal(assessment.controls.accept.state,f.baseline?"observed":"not_observed",JSON.stringify({source:f.visit.sourceScanId,coverage:assessment.coverage,limitations:assessment.limitations,document:assessment.document}));
      assert.equal(assessment.controls.options.state,f.baseline?"observed":"not_observed");
      assert.equal(assessment.controls.privacyOptOut.state,"not_observed");
      assert.ok(!assessment.evidence.some(row=>row.label==="Privacy choices"));
      const snapshot={report_projection_status:"ready",report_projection_version:params[28],report_projection_computed_at:f.bundle.completedAt,
        report_projection_payload:JSON.parse(params[37]),report_projection_payload_sha256:params[38],report_projection_payload_size_bytes:params[39]};
      const readback=harness.pipeline.readPersistedScanReportProjection({scan:record.scan,snapshot});assert.ok(readback);
      const canonical=readback.canonicalReportProjection;
      assert.equal(canonical.globalUnifiedFindings.some((row:{unifiedFindingId:string})=>row.unifiedFindingId==="reject_button_missing"),f.baseline);
      assert.equal(canonical.normalizedConcerns.some((row:unknown)=>JSON.stringify(row).includes("reject_button_missing")),f.baseline);
      const api=harness.pipeline.buildApiV2ScanResource(readback);
      assert.equal(api.status,"completed");assert.equal(api.scoreStatus,"final");
      assert.equal(harness.pipeline.buildApiV2ScanStatus(readback,{canonicalScan:api}).status,"completed");
      const report=harness.pipeline.buildCanonicalReportExport(readback,undefined,"gdpr_eprivacy");assert.ok(report);
      assert.equal(report.consentControlAssessment.controls.privacyOptOut.state,"not_observed");
      assert.equal(report.consentControlAssessment.controls.accept.state,assessment.controls.accept.state);
      assert.equal(api.score,f.baseline?88:100,"only the supported consent finding may affect this isolated fixture's score");
      // Aggregate surfaces read the snapshot columns written by the publisher;
      // the report's serialized payload is a separate persisted read model.
      const summary=projectCanonicalSurfaceSummary({noGo:false,snapshot:{...readback.snapshot,
        certscore_overall:params[1],consent_accept_observed:params[21],consent_reject_observed:params[22],
        consent_options_observed:params[23],consent_evidence_status:params[24],consent_surface_status:params[36]}});
      assert.equal(summary.score,api.score,"Overview, Admin Scans and API Activity use the same persisted score");
      assert.deepEqual(summary.consentAro,f.baseline?{accept:true,reject:false,options:true}:null,
        "shared compact summaries cannot resurrect diagnostic controls");
      assert.match(harness.pipeline.renderCanonicalReportPdf(report).toString("latin1"),/evidence report/);
    }
  }finally{
    if(previousAppUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previousAppUrl;
    await harness.close();
  }
});

test("unknown cookie names and a compatibility flag cannot publish tracking; classified cookie proof still can",async()=>{
  const {consentCanaryAccuracyFixture}=await import("./consent-canary-accuracy.fixture");
  const {buildRuntimeCookieInventory}=await import("../../lib/scans/runtime-cookie-evidence");
  const harness=await redirectPublicationHarness();const previousAppUrl=process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL="http://localhost:3000";
  try{
    const scores:number[]=[];
    for(const [index,mode] of ["unknown_stale_flag","unknown_no_flag","classified"].entries()){
      const classified=mode==="classified",f=consentCanaryAccuracyFixture(0);withOriginalRuntimeForPublication(f.bundle);
      const scanId=`20000000-0000-4000-8000-00000000000${index}`,outDir=path.join(harness.directory,`tracking-${index}`);
      f.bundle.scanId=scanId;
      f.bundle.cookieEvents=(classified?[{cookieName:"_fbp",cookieDomain:".facebook.com",cookieParty:"third_party",category:"advertising",essentiality:"non_essential"}]:
        ["mixpanel_anon_id","split_segment_v2_nov24"].map(cookieName=>({cookieName,cookieDomain:"consent-fixture.test",cookieParty:"first_party",category:"unknown",essentiality:"unknown"})))
        .map((row,i)=>({...row,eventId:`cookie-${i}`,eventType:"cookie_observed",operation:"set_cookie_header",timestampMs:250+i,
          cookiePath:"/",documentUrl:f.url,consentStateAtTime:"pre_consent"})) as never;
      f.bundle.networkEvents=[{eventId:"script",eventType:"network_request",url:"https://tag.a.mts.ru/library.js",requestUrl:"https://tag.a.mts.ru/library.js",
        method:"GET",timestampMs:300,resourceType:"script",thirdParty:true,consentStateAtTime:"pre_consent",documentUrl:f.url,collectionEndpointObserved:false}] as never;
      f.geometry.candidates=[];f.geometry.controlInspection.candidates=[];f.geometry.controlInspection.retainedCandidateCount=0;
      f.geometry.summary.firstLayerAccept=false;f.geometry.summary.firstLayerOptions=false;
      await mkdir(outDir);
      const bytes=JSON.stringify(f.bundle),geometryBytes=JSON.stringify(f.geometry),manifestBytes=JSON.stringify({auxiliaryArtifacts:[{fileName:"ConsentControlGeometryEvidence.json",uri:`s3://offline-fixture/${scanId}/ConsentControlGeometryEvidence.json`,...digest(geometryBytes)}]});
      await writeFile(path.join(outDir,"CanonicalEvidenceBundle.json"),bytes);await writeFile(path.join(outDir,"ConsentControlGeometryEvidence.json"),geometryBytes);await writeFile(path.join(outDir,"LocalV2DagLambdaManifest.json"),manifestBytes);
      const metadata={processor:"local-certscore-v2-dag-parallel-v1",artifactOnly:true,productionFindingIntegration:false,
        artifactPointers:{scanArtifactUri:`s3://offline-fixture/${scanId}/CanonicalEvidenceBundle.json`,manifestUri:`s3://offline-fixture/${scanId}/LocalV2DagLambdaManifest.json`},artifactMetadata:{scanArtifactUri:digest(bytes),manifestUri:digest(manifestBytes)}};
      const record={scan:{id:scanId,domainHostname:"consent-fixture.test",status:"completed",scanType:"full",scanFromValue:"california",createdAt:f.bundle.startedAt,startedAt:f.bundle.startedAt,completedAt:f.bundle.completedAt,pagesRequested:1,pagesScanned:1,
        scanConfigJson:{processor:metadata.processor,hostname:"consent-fixture.test",normalizedUrl:f.url,execution:{v2DagParallel:{localOnly:true,artifactOnly:true,profile:"standard"},localV2Dag:{outDir}}}},
        signalEnrichmentWorkflow:{findingsReady:true,mergedSignalsReady:true},events:[{id:"1",eventType:"v2_lambda_result.received",createdAt:f.bundle.completedAt,metadataJson:metadata}],
        pageEvidence:[],policyEnrichment:[],policyReviewQueue:[],preconsentViolations:[],primaryPolicyEnrichment:null,runtimeArtifacts:{},
        signals:mode==="unknown_stale_flag"?[{key:"privacy.preconsent_tracking_detected",value:true,valueType:"boolean",label:"Pre-consent tracking detected",category:"privacy"}]:[],
        snapshot:{},trackerVendors:[],validationFindings:[]};
      harness.state.record=record;harness.state.writes.length=0;
      assert.equal((await harness.pipeline.publishCanonicalScanReportProjection({organizationId:null,scanId,publicationTrigger:"authorized_worker"})).status,"ready");
      const writes=harness.state.writes.filter((row:{sql:string})=>row.sql.includes("insert into public.scan_snapshots"));assert.equal(writes.length,1);
      const p=writes[0].params;
      const readback=harness.pipeline.readPersistedScanReportProjection({scan:record.scan,snapshot:{report_projection_status:"ready",report_projection_version:p[28],report_projection_computed_at:f.bundle.completedAt,report_projection_payload:JSON.parse(p[37]),report_projection_payload_sha256:p[38],report_projection_payload_size_bytes:p[39]}});assert.ok(readback);
      const findings=readback.canonicalReportProjection.globalUnifiedFindings;
      assert.equal(findings.some((row:{unifiedFindingId:string})=>row.unifiedFindingId==="preconsent_tracking"),classified,mode);
      const concerns=readback.canonicalReportProjection.normalizedConcerns.filter((row:{suggestedUnifiedFindingId:string})=>row.suggestedUnifiedFindingId==="preconsent_tracking");
      if(!classified)assert.ok(concerns.every((row:{promotionEligibility:string})=>row.promotionEligibility!=="eligible"));
      const inventory=buildRuntimeCookieInventory({runtimeArtifacts:readback.runtimeArtifacts});
      assert.equal(inventory.rows.length,classified?1:2,"factual cookie inventory must survive");
      if(!classified)assert.ok(inventory.rows.every(row=>row.category==="unknown"));
      const report=harness.pipeline.buildCanonicalReportExport(readback,undefined,"gdpr_eprivacy"),api=harness.pipeline.buildApiV2ScanResource(readback);assert.ok(report);
      assert.equal(report.projection.unifiedFindings.some((row:{unifiedFindingId:string})=>row.unifiedFindingId==="preconsent_tracking"),classified);
      if(!classified)assert.doesNotMatch(harness.pipeline.renderCanonicalReportPdf(report).toString("latin1"),/Third-party tracking observed before recorded consent/);
      assert.equal(api.scoreStatus,"final");scores.push(api.score);
    }
    assert.equal(scores[0],scores[1],"an unsupported compatibility flag cannot change the canonical score");
  }finally{if(previousAppUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previousAppUrl;await harness.close();}
});

test("rights passage eligibility survives canonical publication, persisted concerns, report, API and PDF", async () => {
  const {consentCanaryAccuracyFixture}=await import("./consent-canary-accuracy.fixture");
  const {policyModelReviewArtifactSchema}=await import("@certscore/contracts");
  const harness=await redirectPublicationHarness();
  const previousAppUrl=process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL="http://localhost:3000";
  const scores:number[]=[];
  const vendorExcerpt="Partner Company answers you if you use your data protection rights against Partner Company.";
  const ownRights="You have the right to access or delete your personal data by contacting us.";
  try {
    for (const valid of [false,true]) {
      const f=consentCanaryAccuracyFixture(0);withOriginalRuntimeForPublication(f.bundle);const scanId=`30000000-0000-4000-8000-00000000000${Number(valid)}`;
      f.bundle.scanId=scanId;
      const outDir=path.join(harness.directory,`rights-${valid}`);
      await mkdir(outDir);
      const bytes=JSON.stringify(f.bundle),geometryBytes=JSON.stringify(f.geometry);
      const manifestBytes=JSON.stringify({auxiliaryArtifacts:[{fileName:"ConsentControlGeometryEvidence.json",uri:`s3://offline-fixture/${scanId}/ConsentControlGeometryEvidence.json`,...digest(geometryBytes)}]});
      await writeFile(path.join(outDir,"CanonicalEvidenceBundle.json"),bytes);
      await writeFile(path.join(outDir,"ConsentControlGeometryEvidence.json"),geometryBytes);
      await writeFile(path.join(outDir,"LocalV2DagLambdaManifest.json"),manifestBytes);
      const metadata={processor:"local-certscore-v2-dag-parallel-v1",artifactOnly:true,productionFindingIntegration:false,
        artifactPointers:{scanArtifactUri:`s3://offline-fixture/${scanId}/CanonicalEvidenceBundle.json`,manifestUri:`s3://offline-fixture/${scanId}/LocalV2DagLambdaManifest.json`},
        artifactMetadata:{scanArtifactUri:digest(bytes),manifestUri:digest(manifestBytes)}};
      const review=policyModelReviewArtifactSchema.parse({contractVersion:"policy_model_review.v2",mode:"enforced",status:"completed",scanId,cacheKey:"a".repeat(64),
        rows:[{topic:"data_subject_rights",status:"observed",confidence:0.96,sourceDocumentIds:["policy-1"],sourceUrls:["https://consent-fixture.test/privacy"],
          evidenceExcerpts:[vendorExcerpt,valid?ownRights:"You can also complain to a regulator."],conflictingExcerpts:[],reasonCodes:["policy_review_invariants_applied_v1"],rationale:"Fictional cached semantic review."}],
        deterministicLegalFrameworkSignals:[],deterministicPolicyReviewSignals:[],failureReason:null,productionEligible:true,
        provenance:{role:"review",provider:"openai",requestedModel:"gpt-5.4-mini",resolvedModel:"gpt-5.4-mini",taskType:"policy_semantic_review",promptVersion:"policy_semantic_review.v5",schemaVersion:"policy_semantic_review_output.v2",
          inputRefs:["policy-1"],outputRefs:["policy-1"],contentHash:"b".repeat(64),confidence:0.96,reasonCodes:["approved_precision_first_production_projection_v1"],uncertaintyNotes:[],latencyMs:0,promptTokens:0,completionTokens:0,totalTokens:0,usedForProductionProjection:true}});
      const record={scan:{id:scanId,domainHostname:"consent-fixture.test",status:"completed",scanType:"full",scanFromValue:"eu_ie",createdAt:f.bundle.startedAt,startedAt:f.bundle.startedAt,completedAt:f.bundle.completedAt,pagesRequested:1,pagesScanned:1,
        scanConfigJson:{processor:metadata.processor,hostname:"consent-fixture.test",normalizedUrl:f.url,execution:{v2DagParallel:{localOnly:true,artifactOnly:true,profile:"standard"},localV2Dag:{outDir}}}},
        signalEnrichmentWorkflow:{findingsReady:true,mergedSignalsReady:true},events:[{id:"1",eventType:"v2_lambda_result.received",createdAt:f.bundle.completedAt,metadataJson:metadata}],
        pageEvidence:[],policyEnrichment:[],policyReviewQueue:[],preconsentViolations:[],primaryPolicyEnrichment:null,runtimeArtifacts:{policyModelReviewArtifact:review},signals:[],snapshot:{},trackerVendors:[],validationFindings:[]};
      harness.state.record=record;harness.state.writes.length=0;
      assert.equal((await harness.pipeline.publishCanonicalScanReportProjection({organizationId:null,scanId,publicationTrigger:"authorized_worker"})).status,"ready");
      const writes=harness.state.writes.filter((row:{sql:string})=>row.sql.includes("insert into public.scan_snapshots"));assert.equal(writes.length,1);
      const params=writes[0].params;
      const readback=harness.pipeline.readPersistedScanReportProjection({scan:record.scan,snapshot:{report_projection_status:"ready",report_projection_version:params[28],report_projection_computed_at:f.bundle.completedAt,
        report_projection_payload:JSON.parse(params[37]),report_projection_payload_sha256:params[38],report_projection_payload_size_bytes:params[39]}});
      assert.ok(readback);
      const concerns=readback.canonicalReportProjection.normalizedConcerns;
      const rights=concerns.find((row:{originKey:string})=>row.originKey==="gdpr_transparency.article13.data_subject_rights");
      assert.equal(Boolean(rights),valid);
      if(valid){assert.equal(rights.regulatoryChecklistEligibility,"observed");assert.deepEqual(rights.evidenceBundle.rawEvidence.policySnippets,[ownRights]);}
      assert.deepEqual(readback.runtimeArtifacts.policyModelReviewArtifact,review,"original cached review remains available for audit");
      assert.ok(!readback.canonicalReportProjection.globalUnifiedFindings.some((row:{unifiedFindingId:string})=>row.unifiedFindingId==="data_subject_rights_disclosure_missing"));
      for(const focus of ["gdpr_eprivacy","ccpa_cpra"]){
        const report=harness.pipeline.buildCanonicalReportExport(readback,undefined,focus);assert.ok(report);
        const row=report.gdprEprivacyReview.rows.find((row:{id:string})=>row.id==="data_subject_rights_disclosure");
        assert.equal(row.status,valid?"Observed":"Not confirmed");
        assert.equal(JSON.parse(JSON.stringify(report)).gdprEprivacyReview.rows.find((row:{id:string})=>row.id==="data_subject_rights_disclosure").status,row.status);
        const pdf=harness.pipeline.renderCanonicalReportPdf(report).toString("latin1");
        assert.doesNotMatch(pdf,/Partner Company answers|scoring withheld|point penalty/i);
      }
      const api=harness.pipeline.buildApiV2ScanResource(readback);assert.equal(api.scoreStatus,"final");assert.notEqual(api.status,"finalizing");scores.push(api.score);
      assert.equal(harness.pipeline.buildApiV2ScanStatus(readback,{canonicalScan:api}).score,api.score);
    }
    assert.equal(scores[0],scores[1],"observed-only policy credit cannot create an absence deduction");
  } finally {
    if(previousAppUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previousAppUrl;
    await harness.close();
  }
});
