/** Audit-only binding: source presence is separate from meaning and ownership. */
import {createHash} from "node:crypto";
type RecordValue=Record<string,any>;
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const normal=(value:string)=>value.replace(/\s+/g," ").trim();
const hex=(value:unknown)=>typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);
export function bindPolicyCitation(input:{sourceUrl:string;text:string;textSha256:string;quote:string;topic:string;sections:RecordValue[];witnesses:RecordValue[]}){
  const base={version:"certscore.policy-citation-binding.v1",diagnosticOnly:true,semanticValidation:"not_assessed",governingOwnership:"not_assessed",independentHtmlVerification:"not_checked"};
  const unresolved=(reason:string)=>({...base,status:"source_binding_unresolved",reason});
  if(typeof input.text!=="string"||typeof input.quote!=="string"||typeof input.sourceUrl!=="string"||!Array.isArray(input.sections)||!Array.isArray(input.witnesses))return unresolved("malformed_input");
  if(input.text.length>2_000_000||input.quote.length>1600||!input.quote.trim()||input.sections.length>80||input.witnesses.length>20)return unresolved("input_outside_bound");
  if(!hex(input.textSha256)||hash(input.text)!==input.textSha256)return unresolved("document_hash_mismatch");
  try{const url=new URL(input.sourceUrl);if(!/^https?:$/.test(url.protocol)||url.username||url.password)return unresolved("invalid_source_url");}catch{return unresolved("invalid_source_url");}
  const quote=normal(input.quote),document=normal(input.text),index=document.indexOf(quote);
  if(index>=0)return {...base,status:"verified_document_text",documentSha256:input.textSha256,quoteSha256:hash(input.quote),offsetBasis:"whitespace_normalized_text",start:index,end:index+quote.length};
  const candidates=new Map<string,RecordValue>();
  for(const witness of input.witnesses){
    if(!witness||typeof witness!=="object")continue;
    if(witness.coverageArea!==input.topic||typeof witness.selectedPolicySectionExcerpt!=="string"||normal(witness.selectedPolicySectionExcerpt)!==quote||
      witness.selectedPolicySectionUrl!==input.sourceUrl||witness.sectionExtractionMethod!=="html_table_row"||witness.sourceOffsetBasis!=="sanitized_html"||
      witness.sectionExtractionState!=="complete"||witness.extractionLimitation||!hex(witness.sourceDocumentTextSha256)||
      hash(witness.selectedPolicySectionExcerpt)!==witness.evidenceTextSha256)continue;
    for(const section of input.sections){
      if(!section||typeof section!=="object"||typeof section.heading!=="string"||typeof witness.selectedPolicySectionHeading!=="string")continue;
      if(section.sourceUrl!==input.sourceUrl||section.extractionMethod!=="html_table_row"||section.sourceOffsetBasis!=="sanitized_html"||section.extractionState!=="complete"||
        section.extractionLimitation||typeof section.textExcerpt!=="string"||section.textExcerpt.length>5000||
        normal(section.heading??"")!==normal(witness.selectedPolicySectionHeading??"")||
        section.documentTextSha256!==witness.sourceDocumentTextSha256||hash(section.textExcerpt)!==section.evidenceTextSha256||
        !Number.isSafeInteger(section.charStart)||!Number.isSafeInteger(section.charEnd)||!Number.isSafeInteger(section.sourceTextChars)||
        section.charStart<0||section.charEnd<=section.charStart||section.charEnd>section.sourceTextChars||
        section.charStart!==witness.sourceCharStart||section.charEnd!==witness.sourceCharEnd||!normal(section.textExcerpt).includes(quote))continue;
      const key=JSON.stringify([section.documentTextSha256,section.charStart,section.charEnd,section.evidenceTextSha256]);
      candidates.set(key,{sourceUrl:input.sourceUrl,heading:section.heading,sectionSha256:section.evidenceTextSha256,quoteSha256:witness.evidenceTextSha256,
        producerDocumentSha256:section.documentTextSha256,producerOffsetBasis:"sanitized_html",producerStart:section.charStart,producerEnd:section.charEnd});
    }
  }
  if(candidates.size!==1)return unresolved(candidates.size?"ambiguous_retained_section":"no_matching_verified_section_witness");
  // This verifies the producer's retained serialization, not unavailable HTML.
  return {...base,status:"retained_table_witness_bound",documentSha256:input.textSha256,producerAttestation:[...candidates.values()][0],
    limitation:"Header/value association is producer-attested; original HTML bytes are unavailable for independent replay."};
}
