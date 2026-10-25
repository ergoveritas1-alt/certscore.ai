import assert from "node:assert/strict";
import test from "node:test";
import {privacyChoiceInspectionSchema,isCurrentCaliforniaChoiceInspection,materializeSelfHiddenFrameInspection} from "./california-privacy-review";
import {selfHiddenFrameFixture} from "./test-fixtures/self-hidden-frame";

const complete=()=>({...selfHiddenFrameFixture(),contractVersion:"certscore.privacy-choice-inspection.v7",
  documentUrl:"https://example.test/?redirect=%2F#home",coverage:"complete",frameCount:0,
  hiddenUninspectedFrameCount:0,uninspectedFrameCount:0,diagnostics:undefined,limitationKeys:[]});
test("v7 retains exact document identity without rewriting historical inspection contracts",()=>{
  const value=complete(),parsed=privacyChoiceInspectionSchema.parse(value);
  assert.equal(parsed.documentUrl,value.documentUrl);assert.equal(parsed.coverage,"complete");
  assert.ok(isCurrentCaliforniaChoiceInspection(parsed));
  assert.equal(privacyChoiceInspectionSchema.safeParse({...value,contractVersion:"certscore.privacy-choice-inspection.v5"}).success,false);
  assert.equal(materializeSelfHiddenFrameInspection(value),undefined);
});
for(const patch of [{documentUrl:"https://user:password@example.test/?q=1"},{documentUrl:"file:///tmp/test"},
  {documentUrl:"https://example.test/?q="+"x".repeat(800)}, {unnamedControlCount:1},{candidateEnumerationTruncated:true},
  {documentStable:false},{documentReadyState:"loading"},{supportedDocumentLanguage:false},
  {representativeDocument:false},{limitationKeys:["document_binding_unverified"]},
  {frameCount:1,hiddenUninspectedFrameCount:1,uninspectedFrameCount:1}]) {
  test(`v7 preserves the fail-closed completeness rules: ${JSON.stringify(patch).slice(0,90)}`,()=>{
    assert.equal(privacyChoiceInspectionSchema.safeParse({...complete(),...patch}).success,false);
  });
}
test("query-bound hidden frames remain limited without inventing a new exclusion",()=>{
  const value={...selfHiddenFrameFixture(),contractVersion:"certscore.privacy-choice-inspection.v7",documentUrl:complete().documentUrl};
  assert.equal(privacyChoiceInspectionSchema.parse(value).coverage,"limited");
  assert.equal(materializeSelfHiddenFrameInspection(value),undefined);
});
