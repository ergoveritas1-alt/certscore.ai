import assert from "node:assert/strict";
import test from "node:test";
import {saleSharingApexWwwCounterpart,SALE_SHARING_REDIRECT_POLICY,SALE_SHARING_REDIRECT_AUTHORIZATION,saleSharingOptOutDispatchSchema,saleSharingOptOutEvidenceSchema,saleSharingOptOutMatchesDispatch,saleSharingOptOutBindsDocument} from "./sale-sharing-opt-out";

const grant={version:SALE_SHARING_REDIRECT_AUTHORIZATION,alternateTargetUrl:"https://www.example.com/"};
const dispatch={policyVersion:SALE_SHARING_REDIRECT_POLICY,enabled:true as const,scanId:"one",exactTargetUrl:"https://example.com/",redirectAuthorization:grant};
function evidence(){return {contractVersion:"certscore.sale-sharing-opt-out-evidence.v2",policyVersion:SALE_SHARING_REDIRECT_POLICY,scanId:"one",parentDispatchSha256:"a".repeat(64),targetUrl:dispatch.exactTargetUrl,redirectAuthorization:grant,actionTargetUrl:grant.alternateTargetUrl,tlsValidated:true,
  redirectProof:{version:"sale_sharing_redirect_proof.v1",fromUrl:dispatch.exactTargetUrl,toUrl:grant.alternateTargetUrl,status:302,sourceRequestId:"first",targetRequestId:"second",tlsValidated:true},documentToken:"loader",
  startedAt:"2026-10-23T00:00:00Z",completedAt:"2026-10-23T00:00:02Z",confirmedAt:"2026-10-23T00:00:01Z",status:"complete",recipeVersion:"onetrust.explicit_sale_share.v2",provider:"OneTrust",actionCount:1,submitted:true,registration:"confirmed",before:{sectionId:8,sale:2,sharing:2},after:{sectionId:8,sale:1,sharing:1},observationWindowMs:500,captureComplete:true,truncated:false,requests:[],limitations:[]};}

test("PSL-bound homepage delegation excludes paths, tenant suffixes and alternate subdomains",()=>{
  assert.equal(saleSharingApexWwwCounterpart("https://example.com/"),"https://www.example.com/");
  assert.equal(saleSharingApexWwwCounterpart("https://www.example.co.uk/"),"https://example.co.uk/");
  assert.equal(saleSharingApexWwwCounterpart(`https://${"a".repeat(64)}.com/`),null);
  for(const url of ["https://example.com","https://EXAMPLE.com/","https://example.com:443/","https://example.com:444/","http://example.com/","https://example.com/path","https://example.com/?x=1","https://example.com/#x","https://user:password@example.com/","https://other.example.com/","https://www.other.example.com/","https://foo.github.io/","https://www.foo.github.io/","https://foo.blogspot.com/","https://github.io/","https://example.test/","https://127.0.0.1/","https://localhost/","https://com/","https://co.uk/"])
    assert.equal(saleSharingApexWwwCounterpart(url),null,url);
});
test("v2 grants and evidence cannot widen or upgrade a historical authorization",()=>{
  const config=saleSharingOptOutDispatchSchema.parse(dispatch),packet=saleSharingOptOutEvidenceSchema.parse(evidence());
  assert.equal(saleSharingOptOutMatchesDispatch(packet,config),true);
  for(const patch of [{scanId:"another"},{exactTargetUrl:"https://example.org/"},{policyVersion:"bounded_sale_sharing_opt_out.v1"}])
    assert.equal(saleSharingOptOutMatchesDispatch(packet,{...config,...patch} as typeof config),false);
  for(const alternateTargetUrl of ["https://other.com/","https://sub.example.com/","https://www.example.com/path","https://www.example.com/?x=1"])
    assert.equal(saleSharingOptOutDispatchSchema.safeParse({...dispatch,redirectAuthorization:{...grant,alternateTargetUrl}}).success,false);
  assert.equal(saleSharingOptOutDispatchSchema.safeParse({...dispatch,redirectAuthorization:undefined}).success,false);
  assert.equal(saleSharingOptOutDispatchSchema.safeParse({...dispatch,policyVersion:"bounded_sale_sharing_opt_out.v1"}).success,false);
  assert.equal(saleSharingOptOutBindsDocument(packet,dispatch.exactTargetUrl),true);
  assert.equal(saleSharingOptOutBindsDocument(packet,grant.alternateTargetUrl),true);
  assert.equal(saleSharingOptOutBindsDocument(packet,"https://www.example.com/path"),false);
  for(const patch of [{redirectProof:null},{redirectProof:undefined},{actionTargetUrl:null},{actionTargetUrl:"https://other.com/"},{tlsValidated:false},{contractVersion:"certscore.sale-sharing-opt-out-evidence.v1"},{policyVersion:"bounded_sale_sharing_opt_out.v1"},{redirectAuthorization:undefined}])
    assert.equal(saleSharingOptOutEvidenceSchema.safeParse({...evidence(),...patch}).success,false,JSON.stringify(patch));
  for(const patch of [{fromUrl:"https://other.com/"},{toUrl:"https://example.com/"},{status:200},{targetRequestId:"first"},{tlsValidated:false}])
    assert.equal(saleSharingOptOutEvidenceSchema.safeParse({...evidence(),redirectProof:{...evidence().redirectProof,...patch}}).success,false);
  const legacy={...evidence(),contractVersion:"certscore.sale-sharing-opt-out-evidence.v1",policyVersion:"bounded_sale_sharing_opt_out.v1",redirectAuthorization:undefined,actionTargetUrl:undefined,redirectProof:undefined,tlsValidated:undefined};
  assert.ok(saleSharingOptOutEvidenceSchema.safeParse(legacy).success);
  assert.equal(saleSharingOptOutMatchesDispatch(saleSharingOptOutEvidenceSchema.parse(legacy),config),false,"v1 packet cannot satisfy a v2 dispatch");
});
