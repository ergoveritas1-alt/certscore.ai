import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {EvidenceTools} from "../../components/scans/report-finding-row";
import {SHADOW_REPORT} from "../../components/scans/report-lab/shadow-report-data";
import {assessAfterRejectScoring} from "./after-reject-scoring-policy";
import {afterRejectClickProjection} from "./test-fixtures/after-reject-scoring";
import {projectRejectPresenceDetails,factualCustomerEvidence} from "./reject-presence-details";
import {buildDetailedEvidenceExport} from "./detailed-evidence-report";
import {buildReportDisplayExport} from "../api-v2/report-display-export";

function evidence(){
 const p=afterRejectClickProjection("measurement"),cookie={storageType:"cookie" as const,name:"_ga",hostname:"example.test",valueHash:"f".repeat(64),purpose:"analytics" as const,nonEssential:true};
 p.scoringEvidence!.postActionStorage=[cookie];p.afterActionStorage=[cookie];
 return {retainedEvidence:{afterRejectScoringAssessment:assessAfterRejectScoring(p),scoreEffect:"canonical_reject_presence_policy"}};
}
test("details show canonical entity, purpose, references and distinct click-relative request/snapshot times without scoring diagnostics",()=>{
 const value=evidence(),original=structuredClone(value),rows=projectRejectPresenceDetails(value);
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.entity==="Google LLC"));
 assert.deepEqual(rows.map(r=>[r.kind,r.msAfterClick]),[["service_request",90],["cookie_snapshot",510]]);
 const html=renderToStaticMarkup(<EvidenceTools evidenceJson={value} canonicalEvidenceJson={JSON.stringify(value)} correctionSteps={[]}/>);
 for(const text of ["Google LLC","Request start +90 ms","Snapshot +510 ms","_ga","request:request-1","analytics"])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/deductionPoints|scoreEffect|15 points|confirmed refusal/);
 assert.deepEqual(value,original);
 assert.equal(projectRejectPresenceDetails({retainedEvidence:{afterRejectScoringAssessment:{policyVersion:"fake"}}}).length,0);
 assert.ok(!JSON.stringify(factualCustomerEvidence(value)).includes("deductionPoints"));
});
test("report export preserves the same factual entity/timing rows with no score explanation",()=>{
 const report=structuredClone(SHADOW_REPORT),value=evidence();
 report.consentRows=[{id:"post_reject_tracking_reduction",title:"Non-essential cookies or services after Reject",status:"Partial concern",summary:"Retained observations",evidenceJson:value,correctionSteps:[],evidenceRefs:[]}];
 report.cmpAudit=undefined;
 const detailed=buildDetailedEvidenceExport(report);
 const row=detailed.detailedEvidence.sections.flatMap(s=>s.rows).find(r=>r.id==="post_reject_tracking_reduction")!;
 assert.deepEqual(row.afterRejectObservations,projectRejectPresenceDetails(value));
 const exported=buildReportDisplayExport({...report,...detailed},{scanId:report.scan.id});
 assert.ok(JSON.stringify(exported).includes("afterRejectObservations"));
 assert.doesNotMatch(JSON.stringify(detailed),/deductionPoints|scoreEffect/);
});
