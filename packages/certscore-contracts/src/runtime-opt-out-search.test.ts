import assert from 'node:assert/strict';
import test from 'node:test';
import {domOptOutSearchSchema,scopedOptOutSearchSchema,scopedRuntimeTextLimitations,GATE_RUNTIME_TEXT_PAGE as documentUrl,GATE_RUNTIME_TEXT_TARGET as targetUrl} from './scoped-opt-out-search';
const body={version:'dom_opt_out_search.v3',artifactId:'dom_text_pre_consent',sourceLane:'runtime_evidence',documentUrl,targetUrl,documentToken:'runtime-loader',capturedAtMs:700,
 textSha256:'a'.repeat(64),textChars:600,truncated:false,result:'no_qualifying_signal',bodyUsability:'substantive_public_page',documentReadyState:'complete',documentLanguage:'en'};
test('runtime body proof preserves its Gate-only lane and parsed original read under the unchanged cap',()=>{
 assert.ok(domOptOutSearchSchema.safeParse(body).success);assert.ok(Buffer.byteLength(JSON.stringify(body))<=1024);
 for(const patch of [{sourceLane:'gpc_observation'},{targetUrl:'https://other.test/'},{documentUrl:documentUrl+'other'},{documentReadyState:'loading'},{artifactId:'other'},
  {version:'dom_opt_out_search.v1'},{version:'dom_opt_out_search.v2'}])assert.equal(domOptOutSearchSchema.safeParse({...body,...patch}).success,false);
});
test('runtime scoped proof retains the independent blocked-consent reference without reinterpreting earlier versions',()=>{
 const proof={version:'sale_sharing_opt_out_scoped_search.v3',artifactId:body.artifactId,documentToken:body.documentToken,textSha256:body.textSha256,capturedAtMs:700,inspectedPolicyCount:0,
  scope:'captured_runtime_main_document_text',sourceLane:'runtime_evidence',targetUrl,documentUrl,bodyUsability:'substantive_public_page',documentReadyState:'complete',documentLanguage:'en',limitations:scopedRuntimeTextLimitations(false),
  consentCapture:{artifactId:'dom_text_pre_consent',documentToken:'consent-loader',textSha256:'b'.repeat(64),capturedAtMs:500,observationId:'consent_ui_pre_consent',observedAtMs:600}};
 assert.ok(scopedOptOutSearchSchema.safeParse(proof).success);assert.ok(Buffer.byteLength(JSON.stringify(proof))<=2048);
 for(const patch of [{sourceLane:'consent_proof'},{consentCapture:undefined},{version:'sale_sharing_opt_out_scoped_search.v1'},{version:'sale_sharing_opt_out_scoped_search.v2'}])
  assert.equal(scopedOptOutSearchSchema.safeParse({...proof,...patch}).success,false);
});
