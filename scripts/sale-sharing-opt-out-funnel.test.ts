import assert from "node:assert/strict";
import test from "node:test";
import {optOutFunnelRow,summarizeOptOutFunnel} from "./lib/sale-sharing-opt-out-funnel";
import {saleSharingOptOutEvidenceSchema,saleSharingOptOutDiagnosticsSchema} from "../packages/certscore-contracts/src/sale-sharing-opt-out";
const legacy={contractVersion:"certscore.sale-sharing-opt-out-evidence.v1",policyVersion:"bounded_sale_sharing_opt_out.v1",scanId:"one",parentDispatchSha256:"a".repeat(64),targetUrl:"https://example.test/",documentToken:null,startedAt:"2026-10-23T00:00:00Z",completedAt:"2026-10-23T00:00:01Z",status:"unsupported",recipeVersion:null,provider:null,actionCount:0,submitted:false,registration:"not_attempted",confirmedAt:null,before:null,after:null,observationWindowMs:0,captureComplete:false,truncated:false,requests:[],limitations:["no_unique_registered_recipe"]};

test("historical packets preserve unknown checkpoints; configuration is not dispatch",()=>{
  assert.ok(saleSharingOptOutEvidenceSchema.safeParse(legacy).success);
  const r=optOutFunnelRow({scanId:"one",configured:true,evidence:legacy,evidenceVerified:true});
  assert.equal(r.stages.dispatched,"observed");assert.equal(r.stages.usable_document,"unknown");
  assert.equal(r.stages.recipe_selected,"not_reached");assert.equal(r.stages.evidence_persisted,"observed");assert.equal(r.stages.finding_persisted,"unknown");
  const absent=optOutFunnelRow({scanId:"two",configured:true});
  assert.equal(absent.stages.eligible,"unknown");assert.equal(absent.stages.dispatched,"unknown");assert.equal(absent.outcome,"configured_without_dispatch_proof");
});
test("new checkpoints distinguish ready document, recipe, action and already applied choice",()=>{
  const evidence={...legacy,documentToken:"doc",recipeVersion:"recipe.v2",provider:"OneTrust",actionCount:1,before:{sectionId:8,sale:1,sharing:1},limitations:["already_opted_out"],executionDiagnostics:{version:"sale_sharing_execution_diagnostics.v1",milestones:[{stage:"usable_document",elapsedMs:10},{stage:"recipe_selected",elapsedMs:20},{stage:"control_actionable",elapsedMs:30}],decisionReads:[{phase:"before",status:"observed",elapsedMs:5}]}};
  const r=optOutFunnelRow({scanId:"one",evidence,evidenceVerified:true});
  assert.equal(r.outcome,"already_opted_out");assert.equal(r.stages.control_actionable,"observed");assert.equal(r.stages.submitted,"not_reached");
});
test("unverified, malformed or wrong-scan packets cannot fill a funnel; findings need separate projection",()=>{
  for(const input of [{scanId:"one",evidence:legacy},{scanId:"other",evidence:legacy,evidenceVerified:true},{scanId:"one",evidence:{...legacy,status:"complete"},evidenceVerified:true}]){
    const r=optOutFunnelRow(input);assert.equal(r.outcome,"unverified_or_invalid_packet");assert.equal(r.stages.evidence_persisted,"unknown");assert.equal(r.stages.finding_persisted,"unknown");
  }
  const result=summarizeOptOutFunnel([{scanId:"one",evidence:legacy,evidenceVerified:true,findingIds:[]},{scanId:"two",eligible:false}]);
  assert.equal(result.stages.dispatched.observed,1);assert.equal(result.stages.dispatched.not_applicable,1);
  assert.equal(result.stages.finding_persisted.not_reached,1);
});
test("diagnostics reject duplicate/out-of-order stages, over-budget timestamps and extra raw fields",()=>{
  const base={version:"sale_sharing_execution_diagnostics.v1",milestones:[],decisionReads:[]};
  for(const milestones of [[{stage:"submitted",elapsedMs:5},{stage:"recipe_selected",elapsedMs:6}],[{stage:"usable_document",elapsedMs:1},{stage:"usable_document",elapsedMs:2}],[{stage:"usable_document",elapsedMs:3001}]])assert.equal(saleSharingOptOutDiagnosticsSchema.safeParse({...base,milestones}).success,false);
  assert.equal(saleSharingOptOutDiagnosticsSchema.safeParse({...base,rawGpp:"secret"}).success,false);
});
