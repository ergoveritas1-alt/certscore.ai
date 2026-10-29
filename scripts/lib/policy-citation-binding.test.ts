import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {bindPolicyCitation} from "./policy-citation-binding";
const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
function fixture(){
 const quote="Legal basis: Consent where required.",text="Purpose Legal basis Marketing Consent where required.",sourceUrl="https://example.test/privacy";
 const section={sourceUrl,heading:"Purpose | Legal basis — Marketing",textExcerpt:"Purpose: Marketing. "+quote,extractionMethod:"html_table_row",sourceOffsetBasis:"sanitized_html",documentTextSha256:"a".repeat(64),extractionState:"complete",charStart:100,charEnd:200,sourceTextChars:300};
 const full={...section,evidenceTextSha256:hash(section.textExcerpt)};
 const witness={coverageArea:"legal_basis",selectedPolicySectionUrl:sourceUrl,selectedPolicySectionHeading:section.heading,selectedPolicySectionExcerpt:quote,sectionExtractionMethod:"html_table_row",sourceOffsetBasis:"sanitized_html",sourceDocumentTextSha256:section.documentTextSha256,sectionExtractionState:"complete",sourceCharStart:100,sourceCharEnd:200,evidenceTextSha256:hash(quote)};
 return {sourceUrl,text,textSha256:hash(text),quote,topic:"legal_basis",sections:[full],witnesses:[witness]};
}
test("direct verified text binding does not establish meaning, ownership or HTML proof",()=>{
 const input=fixture();input.quote="Consent where required.";const result=bindPolicyCitation(input);
 assert.equal(result.status,"verified_document_text");assert.equal(result.semanticValidation,"not_assessed");assert.equal(result.governingOwnership,"not_assessed");
});
test("structured table serialization requires original matching row, hashes and exact coordinate basis",()=>{
 const result=bindPolicyCitation(fixture());assert.equal(result.status,"retained_table_witness_bound");assert.equal(result.independentHtmlVerification,"not_checked");assert.equal(result.diagnosticOnly,true);
});
test("tampered source, quote, row, topic, URL and coordinate proof fail closed",()=>{
 for(const mutate of [
  (x:any)=>x.text+=" changed",(x:any)=>x.quote="Legal basis: Invented.",(x:any)=>x.sections[0].textExcerpt+=" changed",
  (x:any)=>x.sections[0].sourceUrl="https://other.test/privacy",(x:any)=>x.witnesses[0].sourceCharStart=101,
  (x:any)=>x.sections[0].charEnd=400,(x:any)=>x.witnesses[0].sourceOffsetBasis="normalized_visible_text",(x:any)=>x.topic="dpo_contact",
 ]){const input=fixture();mutate(input);assert.equal(bindPolicyCitation(input).status,"source_binding_unresolved");}
});
test("ambiguous alternative sections are not selected by convenient quote equality",()=>{
 const input=fixture();input.sections.push({...input.sections[0]!,charStart:201,charEnd:299});input.witnesses.push({...input.witnesses[0]!,sourceCharStart:201,sourceCharEnd:299});
 assert.equal(bindPolicyCitation(input).status,"source_binding_unresolved");
});

test("malformed or oversized retained input cannot produce source verification",()=>{
 for(const change of [{sections:null},{quote:7},{text:null},{quote:"x".repeat(1601)}])assert.equal(bindPolicyCitation({...fixture(),...change} as any).status,"source_binding_unresolved");
 const input=fixture();(input.sections as any)=[null,{heading:7}];(input.witnesses as any).push(null);assert.equal(bindPolicyCitation(input).status,"source_binding_unresolved");
});
