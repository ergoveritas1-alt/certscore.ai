import assert from "node:assert/strict";
import test from "node:test";
import {extractPropertySaleSharingSource,matchPropertySaleSharingRequest,readPropertySaleSharingSource} from "./property-sale-sharing";
const text="We share data collected through Google Analytics property G-ABC123 with Google for cross-context behavioral advertising.";
const observation={observationId:"privacy",surfaceType:"privacy_policy",targetRelationship:"target_controller",ownershipConfidence:.98,
 documentEvaluationState:"usable",documentRole:"policy_document",documentFetchState:"fetched",status:"fetched",httpStatus:200,
 url:"https://fixture.test/privacy",textExcerpt:text,documentLanguage:"en"};
const extract=(overrides={})=>extractPropertySaleSharingSource({scanId:"fixture",targetUrl:"https://fixture.test/",sourceBundleSha256:"a".repeat(64),observations:[{...observation,...overrides}]});
const url="https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&cid=123.456";
test("exact owned property sale or sharing declarations corroborate identified collection without requiring cookie equality",()=>{
 for(const textExcerpt of [text,"We use Google Analytics property G-ABC123 for remarketing.","We sell personal information collected using Google Analytics property G-ABC123 to Google for monetary consideration."]){
  const source=extract({textExcerpt});assert.equal(source.declarations.length,1);assert.ok(readPropertySaleSharingSource(JSON.parse(JSON.stringify(source))));
  assert.ok(matchPropertySaleSharingRequest(url,source));
  assert.equal(matchPropertySaleSharingRequest(url.replace("G-ABC123","G-OTHER1"),source),undefined);
 }
});
test("generic, modal, negated, contradictory, unowned and failed declarations cannot create purpose evidence",()=>{
 for(const overrides of [{textExcerpt:"We use Google Analytics."},{textExcerpt:"Example:\n"+text},{textExcerpt:text.replace("We share","We may share")},
  {textExcerpt:text.replace("We share","We do not share")},{textExcerpt:text+'\nWe do not share property G-ABC123 data.'},
  {targetRelationship:"third_party"},{ownershipConfidence:.5},{documentEvaluationState:"unknown"},{httpStatus:500},{documentLanguage:"ja"}])
  assert.equal(extract(overrides).declarations.length,0,JSON.stringify(overrides));
});
test("duplicate fields, invalid identifiers, wrong endpoints and tampered declaration hashes remain unsupported",()=>{
 const source=extract();
 for(const request of [url+"&cid=789",url+"&tid=G-ABC123",url.replace("123.456","false"),url.replace("123.456","000.000"),url.replace("/g/collect","/gtag/js"),url.replace("https:","http:")])assert.equal(matchPropertySaleSharingRequest(request,source),undefined,request);
 for(const field of ["propertyIdSha256","clauseSha256","declarationId"] as const){const drift=structuredClone(source);drift.declarations[0]![field]="b".repeat(64);assert.equal(readPropertySaleSharingSource(drift),undefined);}
});
