/** Offline verification only. No fetching, scans, model calls or database writes.
 * Reclassifications are local candidate interpretations of immutable retained
 * observations, never a rewrite of the original scan or its source receipt.
 * Run: pnpm exec tsx --tsconfig tsconfig.base.json scripts/replay-daily-audit-defects.ts RUN OUTPUT
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {consentControlAssessmentSchema, type CanonicalEvidenceBundle} from "@certscore/contracts";
import {projectExternalScanNoGo} from "../packages/shared/src/scan-no-go-reasons";
import {buildScanNoGoAssessment, buildScanEvidenceLaneAssessment} from "../packages/certscore-scan-core/src";
import {assessGoverningPolicyBodyEvidence, assessPolicyDocumentSubstance, assessPolicyDocumentRoleForChildSelection,
  applyGoverningPolicySelection, type PolicySurfaceCandidate} from "../packages/certscore-scan-core/src/scanners/policy-surface-scanner";
import {projectCaliforniaPrivacyReview} from "../apps/web/server/scans/california-privacy-review-projection";
import {deriveCaliforniaRegulatoryScore} from "../apps/web/lib/scans/california-regulatory-score";
import {buildUnifiedFindingDisplayPackets} from "../apps/web/lib/scans/unified-findings";
import {readPersistedScanReportProjection} from "../apps/web/server/scans/scan-report-projection-contract";
import {buildApiV2ScanResource} from "../apps/web/lib/api-v2/scan-resource";

const root=path.resolve(process.argv[2] ?? "artifacts/daily-scan-audit/runs/20261023T184455Z-manual-307d8d57");
const output=path.resolve(process.argv[3] ?? "artifacts/daily-audit-fixes-2026-10-23");
assert.ok(output!==root && !output.startsWith(root+path.sep),"Do not write into the frozen audit");
mkdirSync(output,{recursive:true});
const read=(file:string)=>JSON.parse(readFileSync(file,"utf8"));
const sha=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
const receipts=read(path.join(root,"evidence-retrieval-receipts.json"));
const integrity:Array<{scanId:string;sha256:string}>=[];
function bundleFor(id:string):CanonicalEvidenceBundle {
  const bytes=readFileSync(path.join(root,`scans/${id}/evidence/0/CanonicalEvidenceBundle.json`));
  const receipt=receipts.find((r:any)=>r.scanId===id && r.kind==="scanArtifactUri" && r.eventIndex===0);
  assert.ok(receipt?.verified && receipt.expected?.sha256,"Missing original verification receipt");
  assert.equal(sha(bytes),receipt.expected.sha256,id);
  assert.equal(bytes.length,receipt.expected.sizeBytes,id);
  integrity.push({scanId:id,sha256:sha(bytes)});
  return JSON.parse(bytes.toString());
}
function sourceFor(id:string) {return {sha256:integrity.find(r=>r.scanId===id)!.sha256,verificationStatus:"verified"};}
const inventory=read(path.join(root,"mechanical-results.json"));
const bindings:any[]=[],naming:any[]=[];
for(const row of inventory) {
  const reportPath=path.join(root,`scans/${row.scanId}/offline/report.json`);
  if(!existsSync(reportPath))continue;
  const report=read(reportPath),bundle=bundleFor(row.scanId);
  if(row.noGo) {
    const snapshot=read(path.join(root,`scans/${row.scanId}/persisted/snapshot.json`));
    const rt=snapshot.report_projection_payload.runtimeArtifacts;
    const projection=projectExternalScanNoGo(rt);
    assert.ok(projection,row.scanId);
    assert.doesNotMatch(JSON.stringify(projection),/\bCertScore\b(?!\.ai)/);
    naming.push({scanId:row.scanId,reasonCode:projection.noGo.reasonCode});
  }
  const parent=report.consentControlAssessment;
  if(!parent)continue;
  // Same bounded child replay as the original audit. Policy text is omitted;
  // this verifies exact binding and score availability, not full rescoring.
  const child=projectCaliforniaPrivacyReview(bundle,sourceFor(row.scanId),parent.scan.finalUrl);
  const wasAffected=row.checks.some((c:any)=>c.id==="dual_posture_scores" && c.status==="failed") &&
    new URL(parent.scan.finalUrl).search.length>0;
  if(wasAffected) {
    assert.ok(child?.contractVersion==="certscore.california-privacy-review.v10",`Missing query-bound child ${row.scanId}`);
    assert.equal(child.documentUrl,parent.scan.finalUrl);
    consentControlAssessmentSchema.parse({...parent,californiaPrivacyReview:child});
    const score=deriveCaliforniaRegulatoryScore({assessment:child,checklistRows:report.projection.checklist,unifiedFindings:report.projection.unifiedFindings});
    bindings.push({scanId:row.scanId,site:row.site,parentIdentitySha256:sha(parent.scan.finalUrl),
      childBinds:true,basisPresent:Boolean(child.observedScoreBasis),oldScore:report.californiaScore?.score,newScore:score.score});
  } else if(parent.californiaPrivacyReview?.observedScoreBasis) {
    assert.ok(child?.contractVersion==="certscore.california-privacy-review.v10" && child.observedScoreBasis,`Existing observed score basis lost: ${row.scanId}`);
    consentControlAssessmentSchema.parse({...parent,californiaPrivacyReview:child});
  }
}
assert.equal(bindings.length,7);
assert.equal(bindings.filter(r=>r.basisPresent).length,4);
assert.equal(bindings.filter(r=>r.newScore===null).length,3,"Independent missing or mismatched runtime proof must stay unknown");
assert.equal(naming.length,60);

const policyId="5315fb12-4183-4c1b-9c3a-3c483b6f6440";
const original=bundleFor(policyId),candidate=structuredClone(original);
const snapshot=read(path.join(root,`scans/${policyId}/persisted/snapshot.json`));
const originalReport=read(path.join(root,`scans/${policyId}/offline/report.json`));
const policyProjection=structuredClone(snapshot.report_projection_payload.runtimeArtifacts.policy_disclosure_summary.policyTextEvidenceProjection);
const texts=policyProjection.documents.map((d:any)=>{
  const text=readFileSync(path.join(root,`scans/${policyId}/support/${d.artifactFileName}`),"utf8");
  assert.equal(sha(text),d.retainedTextSha256);assert.equal(sha(text),d.artifactSha256);
  return {observationId:d.observationId,text};
});
const policyRows:any[]=[];
for(const textRow of texts) {
  const observation=candidate.policySurfaceObservations.find(o=>o.observationId===textRow.observationId)!;
  const prior=observation.governingPolicyBodyAssessment!;
  const policyCandidate={normalizedUrl:observation.normalizedUrl ?? observation.url,linkText:observation.linkText,
    deterministicSurfaceType:observation.surfaceType,deterministicClassifierReasonCodes:observation.classifierReasonCodes ?? []} as PolicySurfaceCandidate;
  const body=assessGoverningPolicyBodyEvidence({candidate:policyCandidate,text:textRow.text,title:observation.title,
    documentSubstance:assessPolicyDocumentSubstance({surfaceType:observation.surfaceType,text:textRow.text,title:observation.title,finalUrl:observation.finalUrl}),
    documentTextChars:prior.documentTextChars,documentTextCoverageStatus:observation.documentTextCoverage?.status,
    targetRelationship:observation.targetRelationship,evidenceBoundObservedTopicCount:prior.evidenceBoundObservedTopicCount,
    substantiveDisclosureSignalCount:prior.substantiveDisclosureSignalCount});
  const role=assessPolicyDocumentRoleForChildSelection(policyCandidate,{fetchCandidates:[],observedChildCandidates:[]},
    {governingPolicyBodyAssessment:body,evidenceBoundObservedTopicCount:prior.evidenceBoundObservedTopicCount,substantiveDisclosureSignalCount:prior.substantiveDisclosureSignalCount});
  assert.equal(body.state,"insufficient");assert.notEqual(role.role,"policy_document");
  observation.governingPolicyBodyAssessment=body;observation.documentRole=role.role;observation.documentRoleReasonCodes=role.reasonCodes;
  policyProjection.documents.find((d:any)=>d.observationId===observation.observationId).documentRole=role.role;
  policyRows.push({observationId:observation.observationId,textSha256:sha(textRow.text),oldBody:prior.state,newBody:body.state,newRole:role.role});
}
candidate.policySurfaceObservations=applyGoverningPolicySelection(candidate.policySurfaceObservations);
assert.ok(candidate.policySurfaceObservations.filter(o=>texts.some((t:any)=>t.observationId===o.observationId)).every(o=>o.governingPolicySelection?.state==="ineligible"));
// Save the locally reinterpreted candidate separately and bind its downstream
// projection to its own hash. Never label modified bytes as the production source.
const candidateBytes=JSON.stringify(candidate);
writeFileSync(path.join(output,"policy-candidate-bundle.json"),candidateBytes);
const candidateSource={sha256:sha(candidateBytes),verificationStatus:"verified"};
policyProjection.sourceBundle={...policyProjection.sourceBundle,...candidateSource,uri:`local-candidate:${policyId}`,sizeBytes:Buffer.byteLength(candidateBytes)};
const child=projectCaliforniaPrivacyReview(candidate,candidateSource,originalReport.consentControlAssessment.scan.finalUrl,{projection:policyProjection,texts});
assert.ok(child && child.contractVersion==="certscore.california-privacy-review.v10");
assert.equal(child.reviewCoverage.captureCoverage.policyTextComplete,false);
assert.equal(child.disclosureInspection,undefined);
const parent=consentControlAssessmentSchema.parse({...originalReport.consentControlAssessment,californiaPrivacyReview:child});
const runtime={...snapshot.report_projection_payload.runtimeArtifacts,consentControlAssessment:parent,consent_control_assessment:parent};
const findings=buildUnifiedFindingDisplayPackets({runtimeArtifacts:runtime,reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map()});
assert.ok(!findings.some(f=>f.unifiedFindingId==="california_rights_disclosure_not_observed"));
assert.ok(findings.some(f=>f.unifiedFindingId==="california_collection_review"),"Independent collection finding must survive");

const timeoutId="fed80f2b-6595-47b4-9c2c-a175fa879850",timeout=bundleFor(timeoutId);
const noGo=buildScanNoGoAssessment(timeout);
assert.equal(noGo?.primaryReasonCode,"server_error_5xx");assert.equal(noGo?.scanNoGoAssessment.decision,"no_go");
const lanes=buildScanEvidenceLaneAssessment({normalizedUrl:timeout.normalizedUrl,policySurfaceObservations:timeout.policySurfaceObservations,
  runtimeCoverage:timeout.runtimeCoverage!,scanNoGoAssessment:noGo!.scanNoGoAssessment,transportSecurityObservationCount:timeout.transportSecurityObservations?.length??0});
assert.equal(lanes.outcome,"no_go");
const timeoutSnapshot=read(path.join(root,`scans/${timeoutId}/persisted/snapshot.json`));
const record=readPersistedScanReportProjection({scan:{id:timeoutId,status:"completed"},snapshot:timeoutSnapshot} as any)!;
assert.ok(record);
const candidateRecord={...record,runtimeArtifacts:{...record.runtimeArtifacts,scan_no_go_assessment:noGo!.scanNoGoAssessment,
  scanNoGoAssessment:noGo!.scanNoGoAssessment,scanEvidenceLaneAssessment:lanes,scan_evidence_lane_assessment:lanes}};
const api=buildApiV2ScanResource(candidateRecord as any);
assert.equal(api.resultDisposition,"no_go");assert.equal(api.score,null);
assert.equal(api.postureScores,undefined,"No-go API responses omit both posture scores");
const result={scope:"Local offline candidate verification; frozen evidence and production reports unchanged",bindings,
  policy:{scanId:policyId,documents:policyRows,sourceSha256:sourceFor(policyId).sha256,candidateSha256:candidateSource.sha256,
    complete:false,unsupportedRightsFindingRemoved:true,independentCollectionFindingPreserved:true},
  naming:{verifiedNoGoScans:naming.length,rows:naming},timeout:{scanId:timeoutId,reason:noGo!.primaryReasonCode,lanes,apiScore:api.score,postureScores:api.postureScores},
  sourceIntegrity:[...new Map(integrity.map(row=>[row.scanId,row])).values()]};
writeFileSync(path.join(output,"retained-replay.json"),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({sourceBundles:result.sourceIntegrity.length,queryBindings:bindings.length,scoreBasisRecovered:4,independentUnknownsPreserved:3,
  policyShellsRejected:policyRows.length,noGoNamingVerified:naming.length,timeoutDisposition:api.resultDisposition},null,2));
