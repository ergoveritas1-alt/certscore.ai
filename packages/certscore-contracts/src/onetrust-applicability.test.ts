import {runInNewContext} from "node:vm";
import {reviewedOneTrustPredicates} from "./test-fixtures/onetrust-source-predicates";
import assert from "node:assert/strict";
import test from "node:test";
import { ONETRUST_IKEA_APPLICABILITY as pin, oneTrustApplicabilityInputsSchema, oneTrustEffectiveGroups,
  oneTrustApplicabilityEvidenceSchema, validateOneTrustApplicabilityEnvelope, ONETRUST_REVIEWED_SDKS, oneTrustApplicabilityInputsSupported, oneTrustInventoryOnlySource } from "./onetrust-applicability";
import { z } from "zod";
const group={id:"required",status:"always active",type:"COOKIE",root:true,named:true,isIabPurpose:false,
  showInPopup:true,alwaysShowCategory:true,firstPartyCookies:0,hosts:0,generalVendors:0,vendorServices:0};
const inputs={isIabEnabled:false,vendorLevelOptOut:false,useGoogleVendors:false,
  groups:[group,{...group,id:"optional",status:"inactive"},{...group,id:"empty",status:"inactive",alwaysShowCategory:false}]};
function proof(){return {policyVersion:pin.policyVersion,source:{sdkUrl:pin.sdkUrl,sdkSha256:pin.sdkSha256,sdkBytes:pin.sdkBytes,
  responseStatus:200,redirected:false,serviceWorker:false,documentSha256:pin.documentSha256,documentEpochSha256:"a".repeat(64),observedAtEpochMs:100},inputs,
  configurationSha256:"b".repeat(64),baselineReadAtEpochMs:200,confirmationReadAtEpochMs:400};}

test("flat non-IAB effective groups follow reviewed popup and inventory predicates",()=>{
  const parsed=oneTrustApplicabilityInputsSchema.parse(inputs);
  assert.deepEqual(oneTrustEffectiveGroups(parsed.groups).map(g=>g.id),["required","optional"]);
  for(const key of ["firstPartyCookies","hosts","generalVendors","vendorServices"] as const){
    const groups=parsed.groups.map(g=>g.id === "empty" ? {...g,[key]:1} : g);
    assert.equal(oneTrustEffectiveGroups(groups).length,3,key);
    groups[2]!.showInPopup=false;assert.equal(oneTrustEffectiveGroups(groups).length,2,"hidden inventory is not a first-layer category");
  }
});
for(const field of ["type","root","named","isIabPurpose","showInPopup","alwaysShowCategory","firstPartyCookies","hosts","generalVendors","vendorServices"] as const){
  test(`unknown ${field} cannot authorize a category exclusion`,()=>{
    for(const value of [undefined,null,"unknown",-1,10001]){
      const groups=inputs.groups.map(g=>g.id === "empty" ? {...g,[field]:value}:g);
      assert.equal(oneTrustApplicabilityInputsSchema.safeParse({...inputs,groups}).success,false);
    }
  });
}

test("unsupported IAB, hierarchy, required exclusion, duplicate IDs and all-optional universes stay unknown",()=>{
  for(const change of [
    {isIabEnabled:true},{vendorLevelOptOut:true},{useGoogleVendors:true},
    {groups:inputs.groups.map(g=>({...g,root:false}))},
    {groups:inputs.groups.map(g=>g.id === "required" ? {...g,showInPopup:false}:g)},
    {groups:inputs.groups.map(g=>({...g,id:"duplicate"}))},
    {groups:inputs.groups.map(g=>({...g,status:"inactive"}))},
  ])assert.equal(oneTrustApplicabilityInputsSchema.safeParse({...inputs,...change}).success,false);
});

test("source, pre-click baseline and confirmation times cannot be retrofitted",()=>{
  assert.ok(oneTrustApplicabilityEvidenceSchema.safeParse(proof()).success);
  for(const change of [{baselineReadAtEpochMs:99},{confirmationReadAtEpochMs:199},
    {source:{...proof().source,sdkUrl:pin.sdkUrl+"?version=other"}},
    {source:{...proof().source,sdkSha256:"f".repeat(64)}},
  ])assert.equal(oneTrustApplicabilityEvidenceSchema.safeParse({...proof(),...change}).success,false);
  const parsed=oneTrustApplicabilityEvidenceSchema.parse(proof());
  const envelope={startedAt:new Date(50).toISOString(),completedAt:new Date(500).toISOString(),dispatchedAtMs:250,frameIdentitySha256:pin.documentSha256};
  const schema=(value:Parameters<typeof validateOneTrustApplicabilityEnvelope>[1])=>z.object({}).superRefine((_v,ctx)=>validateOneTrustApplicabilityEnvelope(parsed,value,ctx));
  assert.ok(schema(envelope).safeParse({}).success);
  for(const change of [{startedAt:new Date(101).toISOString()}, {completedAt:new Date(399).toISOString()},
    {dispatchedAtMs:100},{dispatchedAtMs:400},{dispatchedAtMs:undefined},{frameIdentitySha256:"f".repeat(64)}]) {
    assert.equal(schema({...envelope,...change}).safeParse({}).success,false);
  }
});

test("legacy inventory-only SDK never borrows the modern always-show predicate",()=>{
  const legacy={sdkUrl:"https://cdn.cookielaw.org/scripttemplates/202211.2.0/otBannerSdk.js",sdkSha256:"49582965b8ddcb8f728f5b4d33b2c73e138690f5c6815bd9918de94f62f4b80b"};
  const groups=oneTrustApplicabilityInputsSchema.parse(inputs).groups;
  groups[0]!.firstPartyCookies=1;groups[1]!.hosts=1;groups[2]!.alwaysShowCategory=true;
  assert.equal(oneTrustEffectiveGroups(groups).length,3);
  assert.deepEqual(oneTrustEffectiveGroups(groups,legacy).map(g=>g.id),["required","optional"]);
});


test("6.34 source excludes vendor-service-only groups; later inventory-only revisions retain them",()=>{
  const groups=oneTrustApplicabilityInputsSchema.parse(inputs).groups;
  groups[0]!.firstPartyCookies=1;groups[1]!.hosts=1;groups[2]!.vendorServices=1;
  const old=ONETRUST_REVIEWED_SDKS.find(s=>s.sdkUrl.includes("/6.34.0/"))!;
  const later=ONETRUST_REVIEWED_SDKS.find(s=>s.sdkUrl.includes("/6.36.0/"))!;
  assert.deepEqual(oneTrustEffectiveGroups(groups,old).map(g=>g.id),["required","optional"]);
  assert.equal(oneTrustEffectiveGroups(groups,later).length,3);
  assert.equal(oneTrustInventoryOnlySource({...old,sdkSha256:"f".repeat(64)}),false);
});

test("private feature flag must not affect the supported 202505 category universe",()=>{
  const sdk=ONETRUST_REVIEWED_SDKS.find(s=>s.sdkUrl.includes("/202505.1.0/"))!;
  const groups=oneTrustApplicabilityInputsSchema.parse(inputs).groups;
  groups[0]!.firstPartyCookies=1;groups[1]!.hosts=1;
  assert.ok(oneTrustApplicabilityInputsSupported(groups,sdk));
  groups[2]!.alwaysShowCategory=true;
  assert.equal(oneTrustApplicabilityInputsSupported(groups,sdk),false);
  const value=proof();
  assert.equal(oneTrustApplicabilityEvidenceSchema.safeParse({...value,policyVersion:"onetrust_effective_categories.v2",source:{...value.source,...sdk},inputs:{...inputs,groups}}).success,false);
  groups[2]!.showInPopup=false;assert.ok(oneTrustApplicabilityInputsSupported(groups,sdk));
  groups[2]!.showInPopup=true;groups[2]!.vendorServices=1;assert.ok(oneTrustApplicabilityInputsSupported(groups,sdk));
});


for (const sdk of ONETRUST_REVIEWED_SDKS) test(`received SDK predicate parity: ${sdk.sdkUrl}`,()=>{
  const reference=reviewedOneTrustPredicates.find(r=>r.sdkSha256===sdk.sdkSha256);
  assert.ok(reference,"Every source pin needs an independently reviewed predicate reference");
  assert.equal(reference.sdkBytes,sdk.sdkBytes);
  const methods=reference.methods,code=Object.values(methods).filter(Boolean).join(" ");
  for(let mask=0;mask<64;mask++){
    const [show,always,fp,hosts,gv,vs]=Array.from({length:6},(_,i)=>Boolean(mask&(1<<i)));
    const g={id:"optional",status:"inactive" as const,type:"COOKIE" as const,root:true as const,named:true as const,isIabPurpose:false as const,
      showInPopup:show!,alwaysShowCategory:always!,firstPartyCookies:Number(fp),hosts:Number(hosts),generalVendors:Number(gv),vendorServices:Number(vs)};
    const supported=oneTrustApplicabilityInputsSupported([g],sdk),results=new Set<boolean>();
    for(const skip of [false,true])for(const vendor of [false,true]){
      const globals:Record<string,unknown>={...reference.iabTypeArrays};
      for(const m of code.matchAll(/([A-Za-z_$][\w$]*)\.showVendorService/g))globals[m[1]!]={showVendorService:vendor};
      for(const m of code.matchAll(/([A-Za-z_$][\w$]*)\.fp\.CookieV2SkipCategory/g))globals[m[1]!]={fp:{CookieV2SkipCategory:skip}};
      const receiver:Record<string,Function>={};
      for(const[name,fn]of Object.entries(methods))if(fn)receiver[name]=runInNewContext("("+fn+")",globals);
      const raw={Type:"COOKIE",Parent:null,SubGroups:[],GroupName:"optional",ShowInPopup:show,AlwaysShowCategory:always,
        FirstPartyCookies:fp?[{}]:[],Hosts:hosts?[{}]:[],GeneralVendorsIds:gv?[1]:[],VendorServices:vs?[{}]:[]};
      const actual=Boolean(receiver.isValidConsentNoticeGroup!.call(receiver,raw,false));results.add(actual);
      if(supported)assert.equal(oneTrustEffectiveGroups([g],sdk).length>0,actual,`mask=${mask},skip=${skip},vendor=${vendor}`);
    }
    if(!supported)assert.equal(results.size,2,"Unknown feature flag genuinely changes membership");
  }
});
