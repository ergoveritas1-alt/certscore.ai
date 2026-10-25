import assert from 'node:assert/strict';
import test from 'node:test';
import {JOYBUY_OPT_OUT_POLICY_REDIRECT as rule,reviewedOptOutPolicyRedirect} from './reviewed-opt-out-policy-redirect';
import {REVIEWED_UK_COOKIE_REFUSAL_RULE,matchReviewedOptOutRoute,reviewedOptOutRouteCandidates} from './reviewed-opt-out-routes';
import {optOutPresenceSignalSchema} from './opt-out-presence-signal';

const context='3.5 Targeting / advertising cookies: a. Tracking cookies are used to follow the behaviour of website visitors across multiple websites.';
const instruction='4.2 Within your browser you can change your cookie preferences and choose whether you wish to accept cookies or not. The choices you can make and how you make them differs per browser, such as denying all third-party cookies.';
const at='2026-10-24T12:00:01.000Z';
function signal(){
 const passage={evidenceRef:'policy-text:joybuy',textSha256:'a'.repeat(64)};
 return {version:'sale_sharing_opt_out_signal.v8',scanId:'joybuy',documentUrl:rule.pageUrl,sourceHash:'b'.repeat(64),state:'observed',
  basis:'specific_policy_opt_out_instructions',confidence:'signal',effectiveness:'not_verified',label:REVIEWED_UK_COOKIE_REFUSAL_RULE.label,
  scope:REVIEWED_UK_COOKIE_REFUSAL_RULE.scope,scopeLabel:REVIEWED_UK_COOKIE_REFUSAL_RULE.scopeLabel,sourceDocumentUrl:rule.finalUrl,
  passage:{...passage,start:1000,end:1000+instruction.length,excerpt:instruction},contextPassage:{...passage,start:0,end:context.length,excerpt:context},
  sourceBinding:{kind:'reviewed_policy_redirect',relationshipId:rule.id,requestedUrl:rule.requestedUrl,surfaceEvidenceRef:'policy-surface:joybuy',observedAt:at}};
}
test('positive-only Joybuy grant requires exact page, ordered source/destination and date',()=>{
 assert.equal(reviewedOptOutPolicyRedirect(rule.pageUrl,[rule.requestedUrl,rule.finalUrl],at)?.id,rule.id);
 for(const page of ['https://joybuy.com/country-selection',rule.pageUrl+'/',rule.pageUrl+'?a=1',rule.pageUrl+'#x',rule.pageUrl.replace('joybuy.com','joybuy.com.evil.test'),rule.pageUrl.replace('https:','http:')])
  assert.equal(reviewedOptOutPolicyRedirect(page,[rule.requestedUrl,rule.finalUrl],at),undefined);
 for(const chain of [[],[rule.finalUrl],[rule.finalUrl,rule.requestedUrl],[rule.requestedUrl,rule.requestedUrl,rule.finalUrl],[rule.requestedUrl+'?a=1',rule.finalUrl],[rule.requestedUrl,rule.finalUrl.replace('.co.uk','.fr')]])
  assert.equal(reviewedOptOutPolicyRedirect(rule.pageUrl,chain,at),undefined);
 for(const date of ['invalid','2026-10-23T23:59:59.999Z'])assert.equal(reviewedOptOutPolicyRedirect(rule.pageUrl,[rule.requestedUrl,rule.finalUrl],date),undefined);
});
test('UK cookie refusal requires explicit advertising context and cannot reinterpret v1-v7',()=>{
 assert.equal(matchReviewedOptOutRoute(instruction,context,true,true,true)?.id,REVIEWED_UK_COOKIE_REFUSAL_RULE.id);
 assert.equal(matchReviewedOptOutRoute(instruction,context,true,true),undefined);
 assert.equal(matchReviewedOptOutRoute(instruction,'Analytics cookies only.',true,true,true),undefined);
 assert.equal([...reviewedOptOutRouteCandidates(context+' '+instruction,true,true,true)].length,1);
 assert.equal([...reviewedOptOutRouteCandidates(context+' For example: '+instruction,true,true,true)].length,0);
 assert.ok(optOutPresenceSignalSchema.safeParse(signal()).success);
 for(let v=1;v<=7;v++)assert.equal(optOutPresenceSignalSchema.safeParse({...signal(),version:`sale_sharing_opt_out_signal.v${v}`}).success,false);
});
test('persisted UK signal rejects lost/replaced provenance, purpose and geographical scope',()=>{
 const s=signal();
 for(const change of [
  {...s,sourceBinding:undefined},{...s,scope:'named_route'},{...s,scopeLabel:'Global choices'}, {...s,contextPassage:undefined},
  {...s,sourceDocumentUrl:rule.requestedUrl}, {...s,sourceBinding:{...s.sourceBinding,relationshipId:'other'}},
  {...s,sourceBinding:{...s.sourceBinding,surfaceEvidenceRef:'policy-surface:other'}},
  {...s,sourceBinding:{...s.sourceBinding,observedAt:'2026-10-23T23:59:59.999Z'}},
  {...s,contextPassage:{...s.contextPassage,textSha256:'c'.repeat(64)}},
 ])assert.equal(optOutPresenceSignalSchema.safeParse(change).success,false);
});
