import assert from "node:assert/strict";
import test from "node:test";
import {readCookieClassification} from "@certscore/contracts";
import {resolveCanonicalCookieClassification,resolveCanonicalActionStoragePurpose,resolveCanonicalVendor,retainedCookiePurposePolicy} from "./index";

test("v8 exact Lotame audience identity is non-essential without inferring active collection",()=>{
 for(const cookieDomain of ["crwdcntrl.net",".crwdcntrl.net","sync.crwdcntrl.net"]){
  const row=resolveCanonicalCookieClassification("_cc_aud",{cookieDomain});
  assert.equal(row.version,"certscore.cookie-purpose.v8");assert.equal(row.category,"advertising");assert.equal(row.essentiality,"non_essential");assert.equal(row.unknownReason,null);
  assert.equal(row.provider?.entity,"Lotame Solutions, Inc.");assert.equal(row.provider?.registryAttribution.ruleIds[0],"lotame_exact_audience_cookie_v8");
  assert.deepEqual(readCookieClassification(JSON.parse(JSON.stringify(row)),"_cc_aud",cookieDomain),row);
  assert.equal(resolveCanonicalActionStoragePurpose({storageType:"cookie",name:"_cc_aud",hostname:cookieDomain}).nonEssential,true);
 }
 for(const cookieDomain of [undefined,"example.test","crwdcntrl.net.evil.test","https://crwdcntrl.net/path","evilcrwdcntrl.net"]){
  const row=resolveCanonicalCookieClassification("_cc_aud",{cookieDomain});assert.equal(row.category,"unknown");assert.equal(row.provider,null);assert.equal(row.unknownReason,"missing_context");
 }
 for(const name of ["_CC_AUD"," _cc_aud","_cc_aud ","_cc_aud_extra","_cc_cc","_cc_dc","_cc_unknown"]){
  const row=resolveCanonicalCookieClassification(name,{cookieDomain:"crwdcntrl.net"});assert.equal(row.essentiality,"unknown",name);assert.equal(row.provider,null,name);
 }
 for(const storageType of ["local_storage","session_storage"] as const)assert.equal(resolveCanonicalActionStoragePurpose({storageType,name:"_cc_aud",hostname:"crwdcntrl.net"}).nonEssential,false);
 assert.equal(resolveCanonicalVendor({type:"request",url:"https://crwdcntrl.net/arbitrary"}).status,"unrecognized");
});
test("LinkedIn's documented browser security purpose does not prove site-specific necessity",()=>{
 const row=resolveCanonicalCookieClassification("bcookie",{cookieDomain:"linkedin.com"});assert.equal(row.category,"security");assert.equal(row.essentiality,"unknown");assert.equal(row.unknownReason,"necessity_not_established");assert.deepEqual(row.documentedPurposes,["security"]);
 const action=resolveCanonicalActionStoragePurpose({storageType:"cookie",name:"bcookie",hostname:"linkedin.com"});assert.equal(action.nonEssential,false);assert.equal(action.purposeAssessment.essentiality,"unknown");
 assert.equal(resolveCanonicalCookieClassification("bcookie",{cookieDomain:"linkedin.com.evil.test"}).category,"unknown");
});
test("unknown reasons distinguish missing rules, mixed purposes, identity and context",()=>{
 for(const [name,cookieDomain,reason] of [["not_documented","example.test","no_registry_match"],["MUID","bing.com","mixed_purpose"],["UID","scorecardresearch.com","ambiguous_identity"],["MUID","example.test","missing_context"],["_dd_s","example.test","purpose_not_established"]]){
  const row=resolveCanonicalCookieClassification(name!,{cookieDomain});assert.equal(row.essentiality,"unknown");assert.equal(row.unknownReason,reason,name);
 }
});
test("v7 historical classifications remain readable and cannot acquire v8 facts",()=>{
 for(const [name,cookieDomain] of [["_cc_aud","crwdcntrl.net"],["bcookie","linkedin.com"]]){
  const old=resolveCanonicalCookieClassification(name!,{cookieDomain},"certscore.cookie-purpose.v7");assert.equal(old.category,"unknown");assert.equal(old.unknownReason,undefined);assert.ok(readCookieClassification(old,name!,cookieDomain));
  assert.equal(readCookieClassification({...old,unknownReason:"no_registry_match"},name!,cookieDomain),null);
 }
 for(const version of ["certscore.cookie-purpose.v6","certscore.cookie-purpose.v7","certscore.cookie-purpose.v8"])assert.equal(retainedCookiePurposePolicy([`cookie_purpose_policy:${version}`]),version);
 const row=resolveCanonicalCookieClassification("_cc_aud",{cookieDomain:"crwdcntrl.net"});assert.equal(readCookieClassification({...row,unknownReason:undefined},row.cookieName,row.cookieDomain),null);
});
