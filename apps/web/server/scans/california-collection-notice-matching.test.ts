import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {californiaCoverageFixture,CA_FIXTURE_URL} from "./california-review-coverage.fixture";
import {matchCaliforniaCollectionNotices,matchCaliforniaCollectionNoticesV2,matchCaliforniaCollectionNoticesV3} from "./california-collection-notice-matching";
const policyUrl=`${CA_FIXTURE_URL}policy`;
function setup(){
  const f=californiaCoverageFixture();
  const form={formRef:"contact",pageUrl:CA_FIXTURE_URL,structure:"native_form" as const,surfaceType:"contact" as const,method:"post" as const,actionRelationship:"self" as const,
    candidateFieldCount:1,retainedFieldCount:1,fieldsTruncated:false,confidence:1,directVsInferred:"direct" as const,evidenceRefs:[{refId:"form-contact"}],
    fields:[{fieldRef:"email",elementType:"input" as const,inputType:"email",semanticCategory:"email" as const,label:"Email",required:true,disabled:false,readOnly:false,confidence:1,directVsInferred:"direct" as const,evidenceRefs:[{refId:"email"}]}],
    privacyDisclosure:{version:2 as const,truncated:false,excerpts:[{text:"Privacy policy",association:"adjacent_notice" as const,links:[{label:"Privacy Policy",url:policyUrl}]}]}};
  f.bundle.collectionSurfaceInventory!.forms=[form];Object.assign(f.bundle.collectionSurfaceInventory!.coverage,{candidateFormCount:1,retainedFormCount:1,candidateFieldCount:1,retainedFieldCount:1,inspectedFormCandidateCount:1,inspectedFieldCandidateCount:1});
  return f;
}
function run(f=setup(),text="We use your email to respond to your query."){
  return matchCaliforniaCollectionNotices({bundle:f.bundle,documentUrl:CA_FIXTURE_URL,sourceHash:"a".repeat(64),inventoryComplete:true,policyComplete:true,
    documents:[{evidenceRef:"policy-text:policy",url:policyUrl,textSha256:createHash("sha256").update(text).digest("hex"),text}]});
}
test("associated Privacy Policy wording can match without a Notice at Collection title",()=>{
  const result=run();assert.equal(result.points[0]!.status,"matched_text");assert.equal(result.points[0]!.association,"form_notice");
  assert.equal(result.points[0]!.passages[0]!.excerpt,"We use your email to respond to your query.");
});

test("v3 separates category/purpose coverage from names, resource contacts and unknown purposes",()=>{
  const f=setup();f.bundle.cookieEvents=[{eventId:"cookie",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,cookieName:"unnamed_in_policy",cookiePurpose:"analytics"}] as never;
  const text="We collect contact information. We use it to respond to enquiries. We use cookies for analytics.";
  const input={bundle:f.bundle,documentUrl:CA_FIXTURE_URL,sourceHash:"a".repeat(64),inventoryComplete:true,policyComplete:true,documents:[{evidenceRef:"policy-text:policy",url:policyUrl,textSha256:createHash("sha256").update(text).digest("hex"),text}]};
  const result=matchCaliforniaCollectionNoticesV3(input);const form=result.points.find(point=>point.kind === "form")!,cookie=result.points.find(point=>point.kind === "cookies")!;
  assert.equal(form.categoryMatch,"wording_retained");assert.equal(form.purposeMatch,"wording_retained");assert.equal(form.status,"matched_text");
  assert.equal(cookie.status,"matched_text");assert.equal(cookie.technicalMatch,"not_retained","exact cookie names are not a category/purpose requirement");
  for(const point of result.points)for(const passage of point.passages)assert.equal(text.slice(passage.start,passage.end),passage.excerpt);
  f.bundle.cookieEvents![0]!.cookiePurpose="unknown";
  const unknown=matchCaliforniaCollectionNoticesV3(input).points.find(point=>point.kind === "cookies")!;
  assert.equal(unknown.categoryMatch,"wording_retained");assert.equal(unknown.purposeMatch,"unresolved");assert.equal(unknown.status,"policy_text_only");
  const unrelated={...input,documents:input.documents.map(document=>({...document,text:"We collect email. We use health information to provide medical services."}))};
  assert.equal(matchCaliforniaCollectionNoticesV3(unrelated).points.find(point=>point.kind === "form")!.purposeMatch,"not_observed");
  f.bundle.networkEvents=[{eventId:"contact",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,thirdParty:true}] as never;
  const technical=matchCaliforniaCollectionNoticesV3(input).points.find(point=>point.kind === "third_party_resources")!;
  assert.equal(technical.assessmentScope,"technical_context");assert.equal(technical.categoryMatch,"not_assessed");assert.equal(technical.purposeMatch,"not_assessed");
  input.policyComplete=false;assert.ok(matchCaliforniaCollectionNoticesV3(input).points.filter(point=>point.assessmentScope === "category_purpose").every(point=>point.status === "limited"));
});
test("unrelated links, absent association, unknown fields and truncated evidence cannot get matched credit",()=>{
  const f=setup();f.bundle.collectionSurfaceInventory!.forms[0]!.privacyDisclosure!.excerpts[0]!.links[0]!.url="https://unrelated.test/privacy";
  assert.equal(run(f).points[0]!.status,"policy_text_only");
  f.bundle.collectionSurfaceInventory!.forms[0]!.privacyDisclosure!.truncated=true;assert.equal(run(f).points[0]!.status,"limited");
  delete f.bundle.collectionSurfaceInventory!.forms[0]!.privacyDisclosure;assert.equal(run(f).points[0]!.status,"limited");
  f.bundle.collectionSurfaceInventory!.forms[0]!.fields[0]!.semanticCategory="unknown";assert.equal(run(f).points[0]!.status,"limited");
});
test("search fields require search-relevant wording; baseline cookies and resource contacts remain separate",()=>{
  const f=setup();const form=f.bundle.collectionSurfaceInventory!.forms[0]!;form.surfaceType="search";form.fields[0]!.semanticCategory="search";form.privacyDisclosure={version:2,truncated:false,excerpts:[]};
  f.bundle.collectionSurfaceInventory!.scenario="fresh_pre_consent";
  f.bundle.cookieEvents=[{eventId:"cookie",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,cookieName:"sid"} as never];
  f.bundle.networkEvents=[{eventId:"network",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,thirdParty:true} as never,
    {eventId:"gpc",scenario:"gpc",documentUrl:CA_FIXTURE_URL,thirdParty:true} as never];
  const result=run(f,"We use your email to respond to requests. We use cookies to remember preferences. Our website uses third-party service providers.");
  assert.equal(result.points[0]!.status,"not_matched");
  assert.equal(result.points.find(point=>point.kind === "cookies_storage")!.status,"matched_text");
  assert.equal(result.points.find(point=>point.kind === "third_party_resources")!.status,"policy_text_only");
  assert.ok(!JSON.stringify(result).includes('"gpc"'));
  form.privacyDisclosure={version:2,truncated:false,excerpts:[{text:"Privacy Policy",association:"inside_form",links:[{label:"Privacy Policy",url:policyUrl}]}]};
  assert.equal(run(f,"We use search terms you enter to provide site search results.").points[0]!.status,"matched_text");
});
test("browser storage needs its own baseline provenance and relevant text; cookie wording is insufficient",()=>{
  const f=setup();f.bundle.collectionSurfaceInventory!.forms=[];Object.assign(f.bundle.collectionSurfaceInventory!.coverage,{candidateFormCount:0,retainedFormCount:0,candidateFieldCount:0,retainedFieldCount:0,inspectedFormCandidateCount:0,inspectedFieldCandidateCount:0});
  f.bundle.storageSnapshots=[{artifactId:"baseline-storage",scenario:"fresh_pre_consent",url:CA_FIXTURE_URL,localStorageKeys:["preferences"],sessionStorageKeys:[]},
    {artifactId:"gpc-storage",scenario:"gpc",url:CA_FIXTURE_URL,localStorageKeys:["preferences"],sessionStorageKeys:[]},
    {artifactId:"legacy-unbound",url:CA_FIXTURE_URL,localStorageKeys:["preferences"],sessionStorageKeys:[]}] as never;
  const unmatched=run(f,"We use cookies to remember preferences.");
  assert.equal(unmatched.points[0]!.status,"policy_text_only");assert.deepEqual(unmatched.points[0]!.evidenceRefs,["baseline-storage"]);
  assert.equal(run(f,"We use browser storage to remember preferences.").points[0]!.status,"matched_text");
});

test("v2 separates cookie matches from browser storage and preserves search and recipient uncertainty",()=>{
  const f=setup();const form=f.bundle.collectionSurfaceInventory!.forms[0]!;form.surfaceType="search";form.fields[0]!.semanticCategory="search";form.privacyDisclosure={version:2,truncated:false,excerpts:[]};
  f.bundle.cookieEvents=[{eventId:"cookie",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,cookieName:"sid"}] as never;
  f.bundle.storageSnapshots=[{artifactId:"storage",scenario:"fresh_pre_consent",url:CA_FIXTURE_URL,localStorageKeys:["pref"],sessionStorageKeys:[]}] as never;
  f.bundle.networkEvents=[{eventId:"contact",scenario:"fresh_pre_consent",documentUrl:CA_FIXTURE_URL,thirdParty:true},{eventId:"gpc",scenario:"gpc",documentUrl:CA_FIXTURE_URL,thirdParty:true}] as never;
  const text="We use sid cookies to remember your preferences. We use Example Analytics to understand website traffic.";
  const input={bundle:f.bundle,documentUrl:CA_FIXTURE_URL,sourceHash:"a".repeat(64),inventoryComplete:true,policyComplete:true,documents:[{evidenceRef:"policy-text:policy",url:policyUrl,textSha256:createHash("sha256").update(text).digest("hex"),text}]};
  const result=matchCaliforniaCollectionNoticesV2(input);
  assert.equal(result.points.find(point=>point.kind === "cookies")!.status,"matched_text");
  const generic={...input,documents:input.documents.map(document=>({...document,text:document.text.replace("sid cookies","cookies")}))};
  assert.equal(matchCaliforniaCollectionNoticesV2(generic).points.find(point=>point.kind === "cookies")!.status,"policy_text_only","generic analytics/cookie wording cannot resolve an unknown observed cookie purpose");
  assert.equal(result.points.find(point=>point.kind === "browser_storage")!.status,"not_matched");
  assert.equal(result.points.find(point=>point.kind === "form")!.scope,"search_input");
  assert.equal(result.points.find(point=>point.kind === "third_party_resources")!.status,"limited");
  assert.ok(!JSON.stringify(result).includes('"gpc"'));
  const vendor={observationId:"vendor",product:"Example Fonts",purpose:"infrastructure",registryAttribution:{serviceId:"fonts"},matchSources:[{scenario:"fresh_pre_consent",sourceEventId:"contact"}]};
  f.bundle.normalizedVendorObservations=[vendor] as never;
  const precise=matchCaliforniaCollectionNoticesV2(input).points.find(point=>point.kind === "third_party_resources")!;
  assert.equal(precise.recipientMatch,"unresolved","another product from the same vendor must not count");
  vendor.product="Example Analytics";
  const named=matchCaliforniaCollectionNoticesV2(input).points.find(point=>point.kind === "third_party_resources")!;
  assert.equal(named.recipientMatch,"wording_retained");assert.equal(named.purposeMatch,"wording_retained");assert.equal(named.status,"policy_text_only");
  f.bundle.normalizedVendorObservations!.push({...vendor,registryAttribution:{serviceId:"conflicting"}} as never);
  assert.equal(matchCaliforniaCollectionNoticesV2(input).points.find(point=>point.kind === "third_party_resources")!.status,"limited");
});
