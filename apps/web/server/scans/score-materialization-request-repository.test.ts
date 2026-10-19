import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {Pool} from "pg";
import {redirectPublicationHarness} from "./redirect-publication.fixture";
import {consentCanaryAccuracyFixture} from "./consent-canary-accuracy.fixture";

const adminUrl=process.env.CERTSCORE_PUBLICATION_TEST_ADMIN_URL;

test("canonical invariant failures quarantine once; transient errors retain bounded PostgreSQL recovery",{skip:!adminUrl},async()=>{
  const url=new URL(adminUrl!);
  assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/postgres");
  const name=`certscore_publication_test_${Date.now()}`;
  const admin=new Pool({connectionString:url.toString()});
  let pool:Pool|undefined;
  let harness:Awaited<ReturnType<typeof redirectPublicationHarness>>|undefined;
  const previousAppUrl=process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL="http://localhost:3000";
  try{
    await admin.query(`create database ${name}`);
    url.pathname=`/${name}`;pool=new Pool({connectionString:url.toString()});
    await pool.query(`create table public.scans(id uuid primary key,organization_id uuid,status text not null,scan_config_json jsonb);
      create table public.scan_events(id uuid primary key,scan_id uuid,event_type text,metadata_json jsonb,created_at timestamptz default now());`);
    for(const migration of ["0152_scan_score_materialization_requests.sql","0164_scan_score_materialization_terminal_failure.sql","0176_score_materialization_retry_schedule.sql"]){
      await pool.query(await readFile(path.resolve("packages/db/migrations",migration),"utf8"));
    }
    harness=await redirectPublicationHarness({materializationRoute:true});
    const {pipeline,state}=harness;
    const token="t".repeat(43),hash=createHash("sha256").update(token).digest("hex");
    const db=pool;
    const databaseQuery=(sql:string,params:unknown[])=>db.query(sql,params);
    state.databaseQuery=databaseQuery;
    const create=async(id:string,attempt=1)=>{
      await db.query("insert into scans(id,status,scan_config_json) values($1,'completed',$2)",[id,{processor:"local-certscore-v2-dag-parallel-v1"}]);
      await db.query("insert into scan_score_materialization_requests(scan_id,token_sha256,attempt_count) values($1,$2,$3)",[id,hash,attempt]);
      state.record={scan:{id,status:"completed",scanType:"full",scanFromValue:"california",completedAt:"2026-10-19T10:00:10.000Z",scanConfigJson:{processor:"local-certscore-v2-dag-parallel-v1"}},
        signalEnrichmentWorkflow:{findingsReady:true,mergedSignalsReady:true},runtimeArtifacts:{},snapshot:{},events:[],signals:[],trackerVendors:[],validationFindings:[],
        pageEvidence:[],policyEnrichment:[],policyReviewQueue:[],preconsentViolations:[],primaryPolicyEnrichment:null};
      state.writes.length=0;
    };
    const post=(scanId:string)=>pipeline.POST(new Request("http://localhost:3000/api/internal/scan-score-materialization",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({scanId,token,mode:"publish_report"})}));
    const row=async(id:string)=>(await db.query("select *,next_attempt_at>now() as future from scan_score_materialization_requests where scan_id=$1",[id])).rows[0];
    const prepareValid=async(scanId:string,defect?:"checksum"|"json")=>{
      const f=consentCanaryAccuracyFixture(0);f.bundle.scanId=scanId;
      const outDir=path.join(harness!.directory,scanId);await mkdir(outDir);
      const bundleBytes=defect==="json"?"{invalid retained json":JSON.stringify(f.bundle),geometryBytes=JSON.stringify(f.geometry);
      const digest=(bytes:string)=>({sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:Buffer.byteLength(bytes)});
      const manifestBytes=JSON.stringify({auxiliaryArtifacts:[{fileName:"ConsentControlGeometryEvidence.json",uri:`s3://offline-fixture/${scanId}/ConsentControlGeometryEvidence.json`,...digest(geometryBytes)}]});
      await writeFile(path.join(outDir,"CanonicalEvidenceBundle.json"),defect==="checksum"?bundleBytes.replace('"scanId"','"scAnId"'):bundleBytes);
      await writeFile(path.join(outDir,"ConsentControlGeometryEvidence.json"),geometryBytes);
      await writeFile(path.join(outDir,"LocalV2DagLambdaManifest.json"),manifestBytes);
      const metadata={processor:"local-certscore-v2-dag-parallel-v1",artifactOnly:true,productionFindingIntegration:false,
        artifactPointers:{scanArtifactUri:`s3://offline-fixture/${scanId}/CanonicalEvidenceBundle.json`,manifestUri:`s3://offline-fixture/${scanId}/LocalV2DagLambdaManifest.json`},
        artifactMetadata:{scanArtifactUri:digest(bundleBytes),manifestUri:digest(manifestBytes)}};
      state.record.scan={...state.record.scan,domainHostname:"consent-fixture.test",createdAt:f.bundle.startedAt,startedAt:f.bundle.startedAt,completedAt:f.bundle.completedAt,pagesRequested:1,pagesScanned:1,
        scanConfigJson:{processor:metadata.processor,hostname:"consent-fixture.test",normalizedUrl:f.url,execution:{v2DagParallel:{localOnly:true,artifactOnly:true,profile:"standard"},localV2Dag:{outDir}}}};
      state.record.events=[{id:"1",eventType:"v2_lambda_result.received",createdAt:f.bundle.completedAt,metadataJson:metadata}];
    };
    const failedId=randomUUID();await create(failedId);
    const failure=await post(failedId);assert.equal(failure.status,422);
    assert.deepEqual(await failure.json(),{code:"publication_invariant_failed",error:"Score materialization failed.",retryable:false});
    const terminal=await row(failedId);assert.equal(terminal.status,"terminal_failure");assert.equal(terminal.attempt_count,1);
    const diagnostic=JSON.parse(terminal.last_error);assert.equal(diagnostic.invariant,"consent_assessment_missing");assert.equal(diagnostic.phase,"consent_assessment");
    assert.ok(terminal.completed_at);assert.ok(terminal.first_failed_at);
    assert.equal((await db.query("select count(*)::int n from scan_score_materialization_requests where status='pending' and next_attempt_at<=now() and scan_id=$1",[failedId])).rows[0].n,0);
    assert.equal(await pipeline.getReadTriggeredPublicationDeferral(failedId),"durable_publication_terminal_failure");
    assert.equal((await pipeline.publishCanonicalScanReportProjection({organizationId:null,scanId:failedId})).reason,"durable_publication_terminal_failure");
    assert.equal((await post(failedId)).status,401,"terminal requests cannot authorize another worker publication");
    assert.equal(state.writes.length,0,"invariants cannot publish a snapshot or score");

    const writeFailureId=randomUUID();await create(writeFailureId);
    state.databaseQuery=async(sql:string,params:unknown[])=>{
      if(sql.includes("set status = 'terminal_failure'"))throw Object.assign(new Error("database temporarily unavailable"),{code:"ECONNRESET"});
      return databaseQuery(sql,params);
    };
    const unrecorded=await post(writeFailureId);assert.equal(unrecorded.status,503);
    assert.equal((await unrecorded.json()).code,"failure_persistence_unavailable");assert.equal((await row(writeFailureId)).status,"pending");
    state.databaseQuery=databaseQuery;
    assert.equal((await post(writeFailureId)).status,422);assert.equal((await row(writeFailureId)).status,"terminal_failure");

    const transientId=randomUUID();await create(transientId,3);
    state.sourceReadError=Object.assign(new Error("temporary connection reset"),{code:"ECONNRESET"});
    const transient=await post(transientId);assert.equal(transient.status,503);
    const transientBody=await transient.json();assert.equal(transientBody.retryable,true);assert.ok(transientBody.retryAfterSeconds>=1);
    const pending=await row(transientId);assert.equal(pending.status,"pending");assert.equal(pending.completed_at,null);assert.equal(pending.future,true);
    state.sourceReadError=null;
    await prepareValid(transientId);
    await db.query("update scan_score_materialization_requests set next_attempt_at=now() where scan_id=$1",[transientId]);
    const recovered=await post(transientId);assert.equal(recovered.status,200);assert.equal((await recovered.json()).reportReady,true);
    const snapshots=state.writes.filter((write:{sql:string})=>write.sql.includes("insert into public.scan_snapshots"));assert.equal(snapshots.length,1);
    const params=snapshots[0].params;
    const restored=pipeline.readPersistedScanReportProjection({scan:state.record.scan,snapshot:{report_projection_status:"ready",report_projection_version:params[28],report_projection_computed_at:state.record.scan.completedAt,
      report_projection_payload:JSON.parse(params[37]),report_projection_payload_sha256:params[38],report_projection_payload_size_bytes:params[39]}});
    assert.ok(restored);assert.equal(pipeline.buildApiV2ScanResource(restored).scoreStatus,"final");
    assert.match(pipeline.renderCanonicalReportPdf(pipeline.buildCanonicalReportExport(restored,undefined,"gdpr_eprivacy")).toString("latin1"),/evidence report/);
    // The existing retry ceiling remains authoritative for transient failures.
    const exhaustedId=randomUUID();await create(exhaustedId,24);
    const exhausted=await pipeline.recordScoreMaterializationRequestError(exhaustedId,"materialization_failed_transient");
    assert.equal(exhausted.retryable,false);assert.equal((await row(exhaustedId)).status,"terminal_failure");

    for(const defect of ["checksum","json"] as const){
      const id=randomUUID();await create(id);await prepareValid(id,defect);
      const blocked=await post(id);assert.equal(blocked.status,422,defect);
      assert.equal(JSON.parse((await row(id)).last_error).invariant,defect==="checksum"?"artifact_checksum_mismatch":"artifact_json_invalid");
      assert.equal(state.writes.length,0);
    }

    const staleTokenId=randomUUID();await create(staleTokenId);
    await db.query("update scan_score_materialization_requests set token_sha256=$2 where scan_id=$1",[staleTokenId,"f".repeat(64)]);
    await assert.rejects(pipeline.failScoreMaterializationRequest(staleTokenId,"invariant",token),/not durably recorded/);
    assert.equal((await row(staleTokenId)).status,"pending","a stale attempt cannot quarantine a newer request");
    const completedId=randomUUID();await create(completedId);await pipeline.completeScoreMaterializationRequest(completedId);
    await assert.rejects(pipeline.failScoreMaterializationRequest(completedId,"invariant",token),/not durably recorded/);
    assert.equal((await row(completedId)).status,"completed","terminal failure cannot overwrite success");

    const workerId=randomUUID();await create(workerId);
    let workerRequests=0;
    const workerInput={scanId:workerId,targetEnvironment:"local",webBaseUrl:"http://localhost:3000",fetchImpl:async(url:string,init:RequestInit)=>{
      workerRequests++;return pipeline.POST(new Request(url,init));
    }};
    const workerResults=await Promise.all([pipeline.ensureCompletedScanScoresPersisted(workerInput),pipeline.ensureCompletedScanScoresPersisted(workerInput)]);
    assert.equal(workerRequests,1,"concurrent worker handoffs coalesce into one canonical request");
    assert.ok(workerResults.every(result=>result.terminalFailure===true));
    assert.equal((await row(workerId)).status,"terminal_failure");
    await pipeline.ensureCompletedScanScoresPersisted(workerInput);
    assert.equal(workerRequests,1,"a terminal worker handoff cannot retry or enter finalize");

    const unauthorizedId=randomUUID();await create(unauthorizedId);
    state.databaseQuery=async()=>{throw Object.assign(new Error("authorization storage unavailable"),{name:"ZodError",issues:[{code:"custom",path:["authorization"]}]});};
    assert.equal((await post(unauthorizedId)).status,503);assert.equal((await row(unauthorizedId)).status,"pending");
  }finally{
    if(previousAppUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previousAppUrl;
    if(harness)await harness.close();
    if(pool)await pool.end();
    await admin.query(`drop database if exists ${name} with (force)`);
    await admin.end();
  }
});
