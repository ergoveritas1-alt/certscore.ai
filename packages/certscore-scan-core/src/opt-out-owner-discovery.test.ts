import assert from "node:assert/strict";
import test from "node:test";
import {extractCandidates,highValueSecondaryCandidatesFromPolicyPage,classifyPolicyDocumentOwnership,selectOneHopPolicyIndexChildren} from "./scanners/policy-surface-scanner";
test("observed reviewed-owner policy index enters the existing bounded discovery path",()=>{
 const html='<footer><a href="https://www.newsquest.co.uk/our-policies/">policies</a></footer>';
 const c=extractCandidates("https://www.bournemouthecho.co.uk/",html,"policies");
 assert.equal(c.length,1);assert.equal(c[0]!.deterministicSurfaceType,"privacy_policy");
 assert.ok(c[0]!.deterministicClassifierReasonCodes.includes("policy_index_requires_content_validation"));
 assert.equal(extractCandidates("https://unrelated.test/",html,"policies").length,0);
 assert.equal(extractCandidates("https://www.bournemouthecho.co.uk/",html.replace('/our-policies/','/other/'),"policies").length,0);
});
test("reviewed index uses the existing one-hop deterministic child selection",async()=>{
 const index=extractCandidates("https://www.bournemouthecho.co.uk/",'<footer><a href="https://www.newsquest.co.uk/our-policies/">policies</a></footer>',"policies")[0]!;
 const children=highValueSecondaryCandidatesFromPolicyPage(index.normalizedUrl,'<a href="/our-policies/privacy-policy/">Privacy Policy</a><a href="/our-policies/cookie-policy/">Cookie Policy</a>',"Privacy Policy Cookie Policy");
 const result=await selectOneHopPolicyIndexChildren({input:{normalizedUrl:"https://www.bournemouthecho.co.uk/",region:"us-west-1",scanStartedAtMs:Date.parse("2026-10-24T12:00:00Z")} as never,indexCandidate:index,indexTitle:"Our Policies",indexText:"Privacy Policy Cookie Policy",candidates:children,allowModelSelection:false});
 assert.ok(result.fetchCandidates.some(c=>c.normalizedUrl==="https://www.newsquest.co.uk/our-policies/privacy-policy/"));
 assert.ok(result.fetchCandidates.every(c=>c.traversalDepth===1),"No new traversal depth or lookup lane");
});
test("named owner-policy opt-out links are retained without opening them or upgrading generic ownership",()=>{
 const root="https://www.inmotionhosting.com/legal/privacy-policy/";
 const children=highValueSecondaryCandidatesFromPolicyPage(root,'<footer><a href="/legal/do-not-sell-my-personal-information/">Do Not Sell My Personal Information</a></footer>',"Do Not Sell My Personal Information");
 assert.ok(children.some(c=>c.deterministicSurfaceType==="do_not_sell_or_share"));
 const owner=classifyPolicyDocumentOwnership({targetUrl:"https://ramnode.com/",documentUrl:root,text:"InMotion Hosting is the controller of your personal information.",observedAt:"2026-10-24T12:00:00Z"});
 assert.equal(owner.targetRelationship,"service_provider","General scoring/ownership semantics are unchanged");
});
