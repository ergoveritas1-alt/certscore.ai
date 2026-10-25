import assert from "node:assert/strict";
import test from "node:test";
import {CALIFORNIA_RUNTIME_LINK_POLICY,consentControlAssessmentSchema,deriveConsentControlAssessment,optOutPresenceSignalSchema,reviewedOptOutPolicyOwner} from "@certscore/contracts";
import {californiaCoverageFixture,CA_FIXTURE_URL,CA_FIXTURE_SOURCE} from "./california-review-coverage.fixture";
import {projectCaliforniaPrivacyReview} from "./california-privacy-review-projection";
import {buildUnifiedFindingDisplayPackets} from "../../lib/scans/unified-findings";
import {projectCaliforniaOptOutPresence} from "../../lib/scans/california-choice-presence";
import {deriveCaliforniaRegulatoryScore} from "../../lib/scans/california-regulatory-score";

const cases=[
 {host:"mon-essence.fr",url:"https://mon-essence.fr/privacy-essence/",text:"L’affichage de publicités personnalisées est soumis au consentement préalable de l’Utilisateur, recueilli via notre CMP. En l'absence de consentement, des publicités non personnalisées peuvent être affichées. L'Utilisateur peut modifier ses choix à tout moment : Sur l'Application : Menu > Paramètres > Confidentialité Sur le Site : Lien « Gérer les cookies » en pied de page",scope:"personalized_advertising",language:"fr"},
 {host:"www.dasoertliche.de",url:"https://www.dasoertliche.de/datenschutz",text:"Für die optimierte Ausspielung von Werbung setzen wir Adition ein. Adition ist ein Element zur Einblendung von Werbung und Messung der Reichweite solcher Werbung. Wir erheben im Rahmen von Adition Daten zu Browser, Bildschirmauflösung, IP-Adresse und Referrer. Adition nutzt dazu Cookies. Soweit Sie damit nicht einverstanden sind, können Sie durch Klick auf den folgenden Link der Nutzung von Aditon widersprechen.",scope:"advertising_provider",language:"de"},
 {host:"ramnode.com",url:"https://www.inmotionhosting.com/legal/privacy-policy/",text:"Terms of Service | Privacy Policy | DPA | Accessibility Statement | Legal Inquiries Do Not Sell My Personal Information | Limit Use of My Sensitive Personal Information.",scope:"named_route",language:"en"},
 {host:"www.bournemouthecho.co.uk",url:"https://www.newsquest.co.uk/our-policies/privacy-policy/",text:"This code may be shared with our advertising partners for targeted advertising throughout your online experience. Detailed information on the provider’s data processing activities is available in its privacy policy and opt-out here.",scope:"advertising_provider",language:"en"},
] as const;
function fixture(c:typeof cases[number]){
 const f=JSON.parse(JSON.stringify(californiaCoverageFixture(c.text)).replaceAll(CA_FIXTURE_URL,`https://${c.host}/`).replaceAll("2026-10-17","2026-10-24")) as ReturnType<typeof californiaCoverageFixture>;
 f.bundle.normalizedUrl=`https://${c.host}/`;f.bundle.policySurfaceInspection!.californiaReviewPolicy="california-privacy-review.v10";f.bundle.policySurfaceInspection!.californiaDisclosureChoicePolicy=CALIFORNIA_RUNTIME_LINK_POLICY;
 f.bundle.policySurfaceObservations.forEach(s=>Object.assign(s,{url:c.url,normalizedUrl:c.url,finalUrl:c.url,surfaceType:"privacy_policy",linkText:"Privacy Policy",documentLanguage:c.language,retrievedAt:"2026-10-24T12:00:01.000Z",targetRelationship:c.host.includes("ramnode")||c.host.includes("bournemouth")?"service_provider":"target_controller"}));
 f.policyEvidence.projection.documents.forEach(d=>Object.assign(d,{requestedUrl:c.url,finalUrl:c.url,targetRelationship:c.host.includes("ramnode")||c.host.includes("bournemouth")?"service_provider":"target_controller"}));
 return f;
}
function canonical(f:ReturnType<typeof fixture>){
 const review=projectCaliforniaPrivacyReview(f.bundle,CA_FIXTURE_SOURCE,f.bundle.normalizedUrl,f.policyEvidence)!;assert.ok(review);
 const p=deriveConsentControlAssessment({scan:{scanId:f.bundle.scanId,finalUrl:f.bundle.normalizedUrl}});p.californiaPrivacyReview=review;
 const parent=consentControlAssessmentSchema.parse(p),packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:parent}});
 return {review,parent,packets,presence:projectCaliforniaOptOutPresence(packets,f.bundle.scanId,f.bundle.normalizedUrl),score:deriveCaliforniaRegulatoryScore({assessment:review,checklistRows:[],unifiedFindings:packets})};
}
for(const c of cases)test(`${c.host}: scoped positive survives the canonical pipeline without changing score or broad policy ownership`,()=>{
 const r=canonical(fixture(c));assert.equal(r.presence.state,"observed");assert.equal(r.presence.signal?.scope,c.scope);assert.ok(r.presence.signal?.scopeLabel);
 const signal=r.presence.signal!;assert.ok(Buffer.byteLength(JSON.stringify(signal))<=2048);
 const without=structuredClone(r.parent);assert.ok(without.californiaPrivacyReview?.contractVersion==="certscore.california-privacy-review.v10");delete without.californiaPrivacyReview.optOutPresenceSignal;delete without.californiaPrivacyReview.broadOptOutAssessment;
 const packets=buildUnifiedFindingDisplayPackets({reviewFindingCandidates:[],validationFindings:[],validationFindingLookup:new Map(),runtimeArtifacts:{consentControlAssessment:without}});
 assert.deepEqual(deriveCaliforniaRegulatoryScore({assessment:without.californiaPrivacyReview,checklistRows:[],unifiedFindings:packets}),r.score);
 if(c.host.includes("ramnode")||c.host.includes("bournemouth")){
  assert.ok(r.review.contractVersion==="certscore.california-privacy-review.v10");
  assert.equal(r.review.reviewCoverage.sourceDocuments.length,0,"Owner grant never upgrades general governing policy coverage");
  const bad=fixture(c);bad.bundle.normalizedUrl="https://unrelated.test/";assert.notEqual(canonical(bad).presence.state,"observed");
 }
 assert.equal(optOutPresenceSignalSchema.safeParse({...signal,scope:"other"}).success,false);
});
test("generic cookie choices, analytics-only objections and placeholder routes remain unresolved",()=>{
 for(const text of ["Vous pouvez modifier vos choix via le lien Gérer les cookies.","Click here to opt out of analytics.","You may stop sharing by clicking [enlace].","Privacy choices is a category of data we collect."]){
  const f=fixture({...cases[0],text} as typeof cases[0]);assert.notEqual(canonical(f).presence.state,"observed");
 }
});
test("reviewed owner grants bind exact target, policy route, date and public HTTPS identity",()=>{
 const target="https://ramnode.com/",url="https://www.inmotionhosting.com/legal/privacy-policy/",at="2026-10-24T12:00:00Z";
 assert.ok(reviewedOptOutPolicyOwner(target,url,at));
 for(const [t,u,d] of [[target,url,"2026-10-23T23:59:59Z"],["https://ramnode.com.evil.test/",url,at],[target,url+"?site=other",at],[target,url+"other",at],[target,url.replace("https:","http:"),at]])assert.equal(reviewedOptOutPolicyOwner(t!,u!,d!),undefined);
});
test("owner-policy text requires original verified bytes, the observed index chain and unchanged parent scope",()=>{
 const f=fixture(cases[3]),policy=f.bundle.policySurfaceObservations[0]!;
 const index={...policy,observationId:"owner-index",url:"https://www.newsquest.co.uk/our-policies/",normalizedUrl:"https://www.newsquest.co.uk/our-policies/",finalUrl:"https://www.newsquest.co.uk/our-policies/",documentRole:"policy_index" as const,linkText:"policies"};
 f.bundle.policySurfaceObservations=[policy,index];f.policyEvidence.projection.documents=f.policyEvidence.projection.documents.slice(0,1);f.policyEvidence.texts=f.policyEvidence.texts.slice(0,1);
 Object.assign(policy,{parentObservationId:index.observationId,traversalDepth:1,directlyLinkedFromScannedPage:false,parentSurfaceUrl:index.finalUrl,linkSourcePageUrl:index.finalUrl});
 assert.equal(canonical(f).presence.state,"observed");
 for(const mutate of [(x:typeof f)=>{x.policyEvidence.texts[0]!.text+="altered";},(x:typeof f)=>{x.bundle.policySurfaceObservations[1]!.linkObservationState="candidate";},(x:typeof f)=>{x.bundle.policySurfaceObservations[1]!.finalUrl="https://other.test/";}]){
  const bad=structuredClone(f);mutate(bad);assert.notEqual(canonical(bad).presence.state,"observed");
 }
});
