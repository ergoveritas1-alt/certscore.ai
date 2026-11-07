import test from 'node:test';import assert from 'node:assert/strict';
import {choiceSummaryFromRecord,choiceSummaryAudit,applyChoiceSummary,choiceMetricRegistry,CHOICE_AUDIT_SQL,LEGACY_CHOICE_AUDIT_VERSION,CHOICE_AUDIT_VERSION} from './audit-progress-choice';
const id='11111111-1111-4111-8111-111111111111',source='a'.repeat(64),url='https://example.com/';
function record(){return {scan:{id,scanConfigJson:{execution:{v2DagLambda:{saleSharingOptOutEnabled:true}}}},snapshot:{consentControlAssessment:{scan:{noGo:false},californiaPrivacyReview:{scanId:id,contractVersion:'certscore.california-privacy-review.v10',sourceHash:source,documentUrl:url,verificationStatus:'verified',broadOptOutAssessment:{version:'sale_sharing_opt_out_assessment.v3',scanId:id,documentUrl:url,sourceHash:source,state:'observed',basis:'specific_signal',evidenceRefs:['dom-text:one']},optOutPresenceSignal:{scope:'named_route',basis:'specific_policy_opt_out_instructions'},optOutEffectiveness:'not_assessed'}}},canonicalReportProjection:{globalUnifiedFindings:[{unifiedFindingId:'gpc_response',title:'GPC response',surfacingDecision:{reportable:true},presentationDecision:{status:'surface'}}]}};}
test('broad presence, configured enablement, missing packet and neutral canonical result stay separate',()=>{
 const a=choiceSummaryAudit(choiceSummaryFromRecord(record()),id);
 assert.equal(a.states['sealed.opt_out.presence'],'observed');assert.equal(a.states['sealed.opt_out.configured'],'enabled');assert.equal(a.states['sealed.opt_out.packet'],'no_packet_retained');assert.equal(a.states['sealed.opt_out.effectiveness'],'not_assessed');assert.equal(a.states['sealed.opt_out.registration'],undefined);assert.equal(a.states['sealed.opt_out.lane'],undefined);assert.equal(a.states['sealed.choice_finding.gpc_response'],'surfaced');
 assert.equal(a.states['sealed.opt_out.dispatch'],undefined);
});
test('effective dispatch uses verified profile or lane proof, independently of configured enablement',()=>{
 const manifest={privacyCaptureProfile:'presence_only_six_workers.v1'};
 const lane={status:'limited',startedAt:'2026-11-04T00:00:00.000Z',completedAt:'2026-11-04T00:00:01.000Z',limitationCode:'opt_out_worker_failed'};
 const state=(original?:Parameters<typeof choiceSummaryFromRecord>[1])=>choiceSummaryAudit(choiceSummaryFromRecord(record(),original),id).states;
 assert.equal(state({manifest})['sealed.opt_out.dispatch'],'excluded_by_profile');
 assert.equal(state({manifest:{privacyCaptureProfile:'conditional_opt_out_seven_workers.v1'}})['sealed.opt_out.dispatch'],'conditional_no_dispatch_recorded');
 assert.equal(state({manifest:{privacyCaptureProfile:'conditional_opt_out_seven_workers.v1'},bundle:{saleSharingOptOutLaneOutcome:lane}})['sealed.opt_out.dispatch'],'dispatch_recorded');
 const conflict=choiceSummaryFromRecord({...record(),runtimeArtifacts:{saleSharingOptOutLaneOutcome:lane},events:[{eventType:'v2_lambda_result.received',metadataJson:{artifactVerification:{optOutDispatch:'conditional_no_dispatch_recorded'}}}]});
 assert.equal(choiceSummaryAudit(conflict,id).states['sealed.opt_out.dispatch'],'profile_dispatch_conflict');
 assert.equal(state({manifest})['sealed.opt_out.lane'],undefined);
 assert.equal(state({bundle:{saleSharingOptOutLaneOutcome:lane}})['sealed.opt_out.dispatch'],'dispatch_recorded');
 assert.equal(state({manifest,bundle:{saleSharingOptOutLaneOutcome:lane}})['sealed.opt_out.dispatch'],'profile_dispatch_conflict');
 assert.equal(state({manifest:{privacyCaptureProfile:'unrecognized'}})['sealed.opt_out.dispatch'],undefined);
 const event={eventType:'v2_lambda_result.received',metadataJson:{artifactVerification:{optOutDispatch:'excluded_by_profile'}}};
 const summarized=(events:unknown[])=>choiceSummaryAudit(choiceSummaryFromRecord({...record(),events}),id).states;
 assert.equal(summarized([event])['sealed.opt_out.dispatch'],'excluded_by_profile');
 assert.equal(summarized([event,event])['sealed.opt_out.dispatch'],undefined);
 assert.equal(summarized([{...event,metadataJson:{optOutDispatch:'excluded_by_profile'}}])['sealed.opt_out.dispatch'],undefined);
 const {dispatch,...legacy}=choiceSummaryFromRecord(record());
 assert.equal(choiceSummaryAudit(legacy,id).states['sealed.opt_out.coverage'],'available');
});
test('wrong scan, changed source/document, malformed or no-go summaries never promote evidence',()=>{
 const original=choiceSummaryFromRecord(record());assert.deepEqual(choiceSummaryAudit(original,'other').states,{});
 for(const patch of [{noGo:true},{version:'future'},{scanId:'other'}])assert.deepEqual(choiceSummaryAudit({...original,...patch},id).states,{});
 for(const patch of [{reviewScanId:'other'},{reviewSourceHash:'b'.repeat(64)},{reviewDocumentUrl:'https://other.example/'},{reviewVerification:'unverified'}])assert.equal(choiceSummaryAudit({...original,...patch},id).states['sealed.opt_out.presence'],undefined);
});
test('submission and confirmation require the retained same-section decision transition',()=>{
 const s:any=choiceSummaryFromRecord(record());s.packetVerification='verified';s.packet={contractVersion:'certscore.sale-sharing-opt-out-evidence.v1',policyVersion:'bounded_sale_sharing_opt_out.v1',scanId:id,status:'complete',provider:'onetrust',recipeVersion:'onetrust.v1',actionCount:1,submitted:true,registration:'confirmed',before:{sectionId:7,sale:2,sharing:2},after:{sectionId:7,sale:1,sharing:1},observationWindowMs:500,captureComplete:true,truncated:false,limitations:[]};
 assert.equal(choiceSummaryAudit(s,id).states['sealed.opt_out.registration'],'confirmed');
 for(const patch of [{scanId:'other'},{actionCount:0},{after:{sectionId:7,sale:2,sharing:2}},{captureComplete:false},{truncated:true},{before:{sectionId:8,sale:2,sharing:2}}]){
 const a=choiceSummaryAudit({...s,packet:{...s.packet,...patch}},id);assert.equal(a.states['sealed.opt_out.packet'],'invalid_or_unbound');assert.equal(a.states['sealed.opt_out.registration'],undefined);assert.equal(a.states['sealed.opt_out.presence'],'observed');}
});
test('canonical ID absence needs an available inventory; conflicting summaries fail closed',()=>{
 const row=()=>({scanId:id,reportable:true,states:{'control.privacyOptOut':'not_observed'},refs:[],projectionVersion:'scan-report-projection-v27'} as any);
 const a=row(),b=row(),c=row();applyChoiceSummary(a,choiceSummaryFromRecord(record()),'persisted');
 const empty=choiceSummaryFromRecord({...record(),canonicalReportProjection:{globalUnifiedFindings:[]}});applyChoiceSummary(b,empty,'persisted');
 const registry=choiceMetricRegistry([a,b,c]);assert.equal(registry.find(m=>m.id==='sealed.choice_finding.gpc_response')?.label,'GPC response assessment · canonical record');assert.equal(b.states['sealed.choice_finding.gpc_response'],'not_returned');assert.equal(c.states['sealed.choice_finding.gpc_response'],undefined);assert.equal(a.states['control.privacyOptOut'],'not_observed');
 assert.throws(()=>applyChoiceSummary(a,{...choiceSummaryFromRecord(record()),configured:false},'persisted'),/Conflicting/);
});
test('fixed query projection excludes raw runtime evidence and retains canonical identity',()=>{
 assert.match(CHOICE_AUDIT_SQL,/broadOptOutAssessment/);assert.match(CHOICE_AUDIT_SQL,/saleSharingOptOutEnabled/);assert.match(CHOICE_AUDIT_SQL,/globalUnifiedFindings/);assert.match(CHOICE_AUDIT_SQL,/count\(\*\)<=64/);
 assert.equal(CHOICE_AUDIT_VERSION,'certscore.audit-choice-summary.v2');
 assert.ok(CHOICE_AUDIT_SQL.includes(CHOICE_AUDIT_VERSION));
 assert.ok(!CHOICE_AUDIT_SQL.includes(LEGACY_CHOICE_AUDIT_VERSION));
 assert.match(CHOICE_AUDIT_SQL,/optOutExecution/);
 assert.match(CHOICE_AUDIT_SQL,/optOutObservation,sha256/);
 assert.match(CHOICE_AUDIT_SQL,/artifactVerification,conditionalOptOutDecision/);
 assert.match(CHOICE_AUDIT_SQL,/conditional_no_dispatch_recorded/);
 assert.match(CHOICE_AUDIT_SQL,/octet_length\(summary::text\)>8192/);
 assert.match(CHOICE_AUDIT_SQL,/octet_length\(\(summary \|\| jsonb_build_object\('priorityEvidence',priority\)\)::text\)<=8192/);
 assert.match(CHOICE_AUDIT_SQL,/artifactMetadata,scanArtifactUri/);
 assert.doesNotMatch(CHOICE_AUDIT_SQL,/artifactPointers|retainedPrivacyPolicyTextExcerpt|requestBody|cookies|documentToken|\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
});

test('conditional funnel separates source presence, supported route, dispatch, and timing',()=>{
 const conditional={version:'conditional_opt_out_dispatch.v3',scanId:id,status:'dispatched',reason:'supported_control',sourceSha256:source,
  observationId:'control',recipeVersion:'onetrust.explicit_sale_share.v3-bound-controls',controlObserved:true,supportedRoute:true,decidedAtMs:18000,remainingTimeMs:9000};
 const summary={...choiceSummaryFromRecord(record()),dispatch:'dispatch_recorded',conditional};
 const result=choiceSummaryAudit(summary,id);
 assert.equal(result.states['sealed.opt_out.conditional_control'],'observed');assert.equal(result.states['sealed.opt_out.supported_route'],'supported');
 assert.equal(result.states['sealed.opt_out.dispatch_reason'],'supported_control');assert.equal(result.states['sealed.opt_out.registration'],undefined);
 assert.equal(result.measurements['sealed.opt_out.dispatch_elapsed_ms'],18000);assert.equal(result.measurements['sealed.opt_out.decision_remaining_ms'],9000);
 const skipped=choiceSummaryAudit({...summary,dispatch:'conditional_no_dispatch_recorded',conditional:{...conditional,status:'skipped',reason:'insufficient_remaining_time',remainingTimeMs:2400}},id);
 assert.equal(skipped.states['sealed.opt_out.supported_route'],'supported');assert.equal(skipped.states['sealed.opt_out.dispatch_reason'],'insufficient_remaining_time');
 assert.equal(skipped.measurements['sealed.opt_out.dispatch_elapsed_ms'],undefined);assert.equal(skipped.measurements['sealed.opt_out.decision_remaining_ms'],2400);
 for(const conditionalBad of [{...conditional,scanId:'other'},{...conditional,sourceSha256:undefined},{...conditional,remainingTimeMs:4999}]){
  const bad=choiceSummaryAudit({...summary,conditional:conditionalBad},id);assert.equal(bad.states['sealed.opt_out.supported_route'],undefined);assert.deepEqual(bad.measurements,{});
 }
 const old=choiceSummaryAudit({...summary,conditional:{version:'conditional_opt_out_dispatch.v1',status:'dispatched',reason:'supported_control'}},id);
 assert.equal(old.states['sealed.opt_out.supported_route'],undefined,'historical diagnostics acquire no new proof');
 assert.deepEqual(old.measurements,{});
 const event={eventType:'v2_lambda_result.received',metadataJson:{artifactVerification:{optOutDispatch:'dispatch_recorded',conditionalOptOutDecision:conditional}}};
 const eventResult=choiceSummaryAudit(choiceSummaryFromRecord({...record(),events:[event]}),id);
 assert.deepEqual(eventResult.measurements,result.measurements);
 const duplicate=choiceSummaryAudit(choiceSummaryFromRecord({...record(),events:[event,event]}),id);assert.deepEqual(duplicate.measurements,{});
});


test('redirected source presence does not imply an action route and legacy eligibility is separate',()=>{
 const base=choiceSummaryFromRecord(record());
 const conditional={version:'conditional_opt_out_dispatch.v3',scanId:id,status:'skipped',reason:'unsupported_or_unverified_control',sourceSha256:source,observationId:'original-control',controlObserved:true,supportedRoute:false};
 const summary={...base,dispatch:'conditional_no_dispatch_recorded',conditional};
 const current=choiceSummaryAudit(summary,id);
 assert.equal(current.states['sealed.opt_out.conditional_control'],'observed');
 assert.equal(current.states['sealed.opt_out.supported_route'],'unsupported_or_unverified');
 assert.equal(current.states['sealed.opt_out.registration'],undefined);
 const legacy=choiceSummaryAudit({...summary,conditional:{...conditional,version:'conditional_opt_out_dispatch.v2',controlObserved:false}},id);
 assert.equal(legacy.states['sealed.opt_out.conditional_control'],undefined);
 assert.equal(legacy.states['sealed.opt_out.legacy_eligible_control'],'not_observed_at_eligible_target');
 assert.equal(legacy.states['sealed.opt_out.supported_route'],'unsupported_or_unverified');
 const unbound=choiceSummaryAudit({...summary,conditional:{...conditional,observationId:undefined}},id);
 assert.equal(unbound.states['sealed.opt_out.conditional_control'],undefined);
});

test('historical v1 summaries remain readable without inventing new execution assessments',()=>{
 const summary=choiceSummaryFromRecord(record());
 const current=choiceSummaryAudit(summary,id),old=choiceSummaryAudit({...summary,version:'certscore.audit-choice-summary.v1'},id);
 assert.deepEqual(old.states,Object.fromEntries(Object.entries(current.states).filter(([k])=>!k.startsWith('sealed.priority_evidence.'))));
 assert.equal(old.states['sealed.priority_evidence.accept'],undefined);
 assert.equal(old.states['sealed.opt_out.choice_confirmation'],undefined);
 assert.match(old.scopes['sealed.opt_out.presence']!,/^certscore.audit-choice-summary.v1/);
});


test('a Red Hat authorization skip preserves source coverage without counting a dispatch or action',()=>{
 const manifest={privacyCaptureProfile:'conditional_opt_out_seven_workers.v1',conditionalOptOutDecision:{
  version:'conditional_opt_out_dispatch.v3',scanId:id,status:'skipped',reason:'authorization_not_granted',sourceSha256:source,
  observationId:'control',recipeVersion:'trustarc.redhat_explicit_choice.v1',controlObserved:true,supportedRoute:true,decidedAtMs:1000,remainingTimeMs:9000}};
 const audit=choiceSummaryAudit(choiceSummaryFromRecord(record(),{manifest,bundle:{}}),id);
 assert.equal(audit.states['sealed.opt_out.dispatch'],'conditional_no_dispatch_recorded');
 assert.equal(audit.states['sealed.opt_out.dispatch_reason'],'authorization_not_granted');
 assert.equal(audit.states['sealed.opt_out.conditional_control'],'observed');
 assert.equal(audit.states['sealed.opt_out.action_completion'],undefined);
 assert.equal(audit.measurements['sealed.opt_out.dispatch_elapsed_ms'],undefined);
});
