import test from 'node:test';import assert from 'node:assert/strict';
import fixture from './test-fixtures/redhat-terminal-choice.json';
import {saleSharingOptOutEvidenceSchema,saleSharingOptOutDispatchSchema,deriveOptOutExecutionAssessment,REDHAT_OPT_OUT_POLICY,saleSharingOptOutMatchesDispatch} from './sale-sharing-opt-out';
const packet=()=>saleSharingOptOutEvidenceSchema.parse(structuredClone(fixture));
test('retained Red Hat proof confirms terminal CMP recording but no GPP state or measured tracking window',()=>{
 const p=packet(),e=deriveOptOutExecutionAssessment(p,'a'.repeat(64));
 assert.equal(e.choiceConfirmation,'confirmed_terminal');assert.equal(e.confirmationReadAtMs,2239);assert.equal(e.confirmationBasis,'cmp_explicit_choice');assert.equal(e.postConfirmationObservation,'not_measured');assert.equal(e.observationWindowMs,0);assert.equal(p.registration,'unconfirmed');assert.equal(p.status,'limited');
 const config=saleSharingOptOutDispatchSchema.parse({enabled:true,policyVersion:REDHAT_OPT_OUT_POLICY,scanId:p.scanId,exactTargetUrl:p.targetUrl,redHatAuthorization:p.redHatChoice!.source});
 assert(saleSharingOptOutMatchesDispatch(p,config));assert.equal(saleSharingOptOutMatchesDispatch(p,{...config,redHatAuthorization:{...config.redHatAuthorization!,sourceSha256:'b'.repeat(64)}}),false);
 for(const patch of [{policyVersion:'bounded_sale_sharing_opt_out.v1'},{exactTargetUrl:'https://www.redhat.com/en'},{controlPolicy:'explicit_opt_out_controls.v1'},{redHatAuthorization:undefined}])assert.equal(saleSharingOptOutDispatchSchema.safeParse({...config,...patch}).success,false);
 for(const patch of [{contractVersion:'certscore.sale-sharing-opt-out-evidence.v1'},{registration:'confirmed'},{captureComplete:true},{observationWindowMs:500},{status:'complete'}])assert.equal(saleSharingOptOutEvidenceSchema.safeParse({...p,...patch}).success,false);
});
test('missing or changed action, route, document, state or timing cannot create terminal confirmation',()=>{
 const changes:Array<(p:any)=>void>=[p=>p.redHatChoice.bindingVerified=false,p=>p.redHatChoice.route[2].requestId=p.redHatChoice.route[0].requestId,p=>p.redHatChoice.reads[1].documentSha256="f".repeat(64),p=>p.submitted=false,p=>p.redHatChoice.control=null,p=>p.redHatChoice.route[1].redirectedRequestId='wrong',p=>p.redHatChoice.route[2].status=302,p=>p.redHatChoice.reload=null,p=>p.redHatChoice.reload.sourceDocumentSha256='c'.repeat(64),p=>p.redHatChoice.reads[2].documentSha256='b'.repeat(64),p=>p.redHatChoice.reads[2].decision.source='implied',p=>p.redHatChoice.reads[2].decision.selectedCategoryIndices=[0],p=>p.redHatChoice.followUpMs=100];
 for(const change of changes){const p=packet();change(p);const parsed=saleSharingOptOutEvidenceSchema.safeParse(p);assert.ok(!parsed.success||deriveOptOutExecutionAssessment(parsed.data,'a'.repeat(64)).choiceConfirmation!=='confirmed_terminal');}
});

test('historical limited confirmation outside the bounded timestamp field does not break projection or extend capture',()=>{
 const p=saleSharingOptOutEvidenceSchema.parse({contractVersion:'certscore.sale-sharing-opt-out-evidence.v1',policyVersion:'bounded_sale_sharing_opt_out.v1',scanId:'historical-limited',parentDispatchSha256:'a'.repeat(64),targetUrl:'https://example.com/',documentToken:'doc',startedAt:'2026-10-01T00:00:00Z',completedAt:'2026-10-01T00:00:04Z',confirmedAt:'2026-10-01T00:00:03.500Z',status:'limited',recipeVersion:'historical',provider:'OneTrust',actionCount:2,submitted:true,registration:'confirmed',before:{sectionId:8,sale:2,sharing:2},after:{sectionId:8,sale:1,sharing:1},observationWindowMs:0,captureComplete:false,truncated:false,requests:[],limitations:['observation_incomplete']});
 const execution=deriveOptOutExecutionAssessment(p,'b'.repeat(64));assert.equal(execution.choiceConfirmation,'confirmed_initial');assert.equal(execution.confirmationReadAtMs,null);assert.equal(execution.postConfirmationObservation,'limited');
});
