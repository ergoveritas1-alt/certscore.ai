/** CertScore.ai retained-only choice review. No network, database, model calls or historical writes.
 * pnpm exec tsx --tsconfig tsconfig.base.json scripts/replay-sale-sharing-priority.ts AUDIT_JSON RETAINED_RUN OUTPUT_JSON
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync,readFileSync,writeFileSync} from "node:fs";
import path from "node:path";
import {consentControlAssessmentSchema,type CanonicalEvidenceBundle} from "@certscore/contracts";
import {projectCaliforniaPrivacyReview} from "../apps/web/server/scans/california-privacy-review-projection";
import {buildUnifiedFindingDisplayPackets} from "../apps/web/lib/scans/unified-findings";
import {projectCaliforniaChoicePresence} from "../apps/web/lib/scans/california-choice-presence";
import {deriveCaliforniaRegulatoryScore} from "../apps/web/lib/scans/california-regulatory-score";

const [auditFile,runArg,outputArg]=process.argv.slice(2);
assert.ok(auditFile&&runArg&&outputArg,"Supply audit JSON, retained run and a separate output JSON.");
const root=path.resolve(runArg),output=path.resolve(outputArg);
assert.ok(output!==root&&!output.startsWith(root+path.sep)&&output!==path.resolve(auditFile),"Never overwrite retained input.");
const read=(p:string)=>JSON.parse(readFileSync(p,"utf8"));
const hash=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
const audit=read(auditFile);
const rows:Array<{scanId:string;host:string;limitations?:string[]}>= [...audit.positiveProjectionReview,...audit.qualifiedGpcButUnknownChoice];
assert.equal(new Set(rows.map(r=>r.scanId)).size,rows.length);
const results=[];
for(const row of rows){
  assert.match(row.scanId,/^[a-f0-9-]{36}$/);
  const dir=path.join(root,"scans",row.scanId),bundleFile=path.join(dir,"evidence/0/CanonicalEvidenceBundle.json");
  if(!existsSync(bundleFile)){results.push({...row,verification:"not_available_locally",state:"not_replayed"});continue;}
  const bytes=readFileSync(bundleFile),events=read(path.join(dir,"persisted/events.json"));
  const event=events.find((e:{type:string})=>e.type==="v2_lambda_result.received");
  const receipt=event?.metadata?.artifactMetadata?.scanArtifactUri;
  assert.ok(receipt,`Missing source receipt: ${row.scanId}`);
  assert.equal(hash(bytes),receipt.sha256);assert.equal(bytes.length,receipt.sizeBytes);
  const bundle=JSON.parse(bytes.toString()) as CanonicalEvidenceBundle;assert.equal(bundle.scanId,row.scanId);
  const snapshot=read(path.join(dir,"persisted/snapshot.json"));
  const originalParent=consentControlAssessmentSchema.parse(snapshot.consent_control_assessment);
  const frozen=JSON.stringify(originalParent),runtime=snapshot.report_projection_payload.runtimeArtifacts;
  const review=originalParent.californiaPrivacyReview;
  assert.ok(review,`Missing persisted California review: ${row.scanId}`);
  const fresh=projectCaliforniaPrivacyReview(bundle,{sha256:receipt.sha256,verificationStatus:"verified"},review.documentUrl);
  assert.ok(fresh);
  const project=(parent:typeof originalParent)=>{
    const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),
      runtimeArtifacts:{...runtime,consentControlAssessment:parent}});
    return {state:projectCaliforniaChoicePresence(packets,row.scanId,review.documentUrl)?.state??"unknown",
      score:deriveCaliforniaRegulatoryScore({assessment:parent.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets})};
  };
  const before=project(originalParent),candidate=structuredClone(originalParent);
  // Candidate-only positive-presence materialization. All other retained
  // assessments, inspections and score inputs remain byte-for-byte unchanged.
  candidate.californiaPrivacyReview!.choicePresence=fresh.choicePresence;
  const after=project(consentControlAssessmentSchema.parse(candidate));
  assert.deepEqual(after.score,before.score,`Presence changed scoring: ${row.scanId}`);
  assert.equal(JSON.stringify(originalParent),frozen);
  if(row.limitations) assert.equal(after.state,"unknown",`Incomplete historical inspection upgraded: ${row.scanId}`);
  const timing=bundle.modulesRun.find(m=>m.moduleName==="policySurfaceScanner")?.timingBreakdown??[];
  results.push({...row,verification:"sha256_and_size_verified",sha256:receipt.sha256,before:before.state,candidate:after.state,
    scoreUnchanged:true,inspectionUnchanged:true,
    pendingStages:timing.filter(t=>/pending at/.test(t.detail??"")).map(t=>t.label),
    analysisOverlappedCapture:timing.some(t=>t.label==="static policy analysis warmup"&&/overlaps rendered/.test(t.detail??""))});
}
const summary={product:"CertScore.ai",mode:"offline_future_positive_projection_candidate",historicalWrites:0,liveVisits:0,
  sourcesVerified:results.filter(r=>r.verification==="sha256_and_size_verified").length,
  unavailableLocally:results.filter(r=>r.verification==="not_available_locally").length,
  positiveRecoveries:results.filter(r=>"candidate"in r&&r.before==="unknown"&&r.candidate==="observed").map(r=>r.host),
  note:"No missing provenance is reconstructed. Capture fixes require a future authorized scan; this replay does not predict recovery for the 30 priority sites.",results};
writeFileSync(output,JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify({verified:summary.sourcesVerified,unavailable:summary.unavailableLocally,positiveRecoveries:summary.positiveRecoveries}));
