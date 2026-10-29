import assert from "node:assert/strict";
import test from "node:test";
import { policyDocumentTextCoverageSchema, hasCompletePolicySourceCoverage } from "@certscore/contracts";
import { boundedPdfText } from "./policy-pdf-text";
import { extractPdfPolicyText, buildGdprTransparencyTopicCoverageDiagnostics, extractPolicySections, retainedArticle13SectionEvidenceFromSections } from "./scanners/policy-surface-scanner";

function textPdf(pages:number):Buffer {
  const objects=["<< /Type /Catalog /Pages 2 0 R >>",`<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${4+2*i} 0 R`).join(" ")}] /Count ${pages} >>`,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for(let i=0;i<pages;i++){
    const stream=`BT /F1 10 Tf 72 720 Td (Privacy policy page ${i+1}. We retain personal data for 30 days.) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+2*i} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  let body="%PDF-1.4\n";const offsets:number[]=[];
  for(const [i,obj] of objects.entries()){offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${obj}\nendobj\n`;}
  const xref=Buffer.byteLength(body);body+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(n=>`${String(n).padStart(10,"0")} 00000 n \n`).join("");
  body+=`trailer\n<< /Root 1 0 R /Size ${objects.length+1} >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(body);
}
test("real PDFs preserve the twelve-page cap and distinguish full source coverage",async()=>{
  const long=await extractPdfPolicyText(textPdf(18));
  assert.equal(long.coverage.totalPages,18);assert.equal(long.coverage.extractedPages,12);assert.equal(long.coverage.status,"partial");
  assert.match(long.text,/page 12\./);assert.doesNotMatch(long.text,/page 13\./);
  const short=await extractPdfPolicyText(textPdf(2));assert.equal(short.coverage.status,"complete");assert.equal(short.coverage.totalPages,2);
});
test("unknown page metadata and character truncation cannot establish complete source coverage",()=>{
  assert.equal(boundedPdfText({text:"Policy text"}).coverage.status,"unknown");
  const limited=boundedPdfText({text:"x".repeat(500_001),total:1,pages:[{num:1}]});assert.equal(limited.text.length,500_000);assert.equal(limited.coverage.status,"partial");assert.equal(limited.coverage.characterLimitReached,true);
  assert.equal(boundedPdfText({text:"Policy",total:2,pages:[{num:1},{num:1}]}).coverage.status,"unknown");
});
test("complete extracted-string retention does not become whole-PDF absence coverage",()=>{
  const coverage=policyDocumentTextCoverageSchema.parse({status:"complete",sourceTextChars:1000,retainedTextChars:1000,limitationKeys:[],pdfSourceCoverage:boundedPdfText({text:"policy",total:18,pages:Array.from({length:12},(_,i)=>({num:i+1}))}).coverage});
  assert.equal(hasCompletePolicySourceCoverage(coverage),false);
  const diagnostics=buildGdprTransparencyTopicCoverageDiagnostics({documentRole:"policy_document",ownership:{targetRelationship:"target_controller",ownershipConfidence:1,ownershipReasonCodes:[]},contentCoverage:{status:"complete",sourceTextChars:1000,extractedSectionCount:0,retainedSectionCount:0,retainedTableRowCount:0,limitationKeys:[]},documentTextCoverage:coverage,sectionEvidence:[]});
  assert.ok(diagnostics.every(d=>d.coverageState==="limited"&&d.evaluationState==="unknown"));
  assert.equal(hasCompletePolicySourceCoverage({...coverage,pdfSourceCoverage:undefined}),true,"legacy contracts remain unchanged");
  assert.equal(policyDocumentTextCoverageSchema.safeParse({...coverage,pdfSourceCoverage:{...coverage.pdfSourceCoverage,status:"complete"}}).success,false);
});

test("a complete positive section survives partial source-PDF coverage",()=>{
  const sourceUrl="https://example.test/privacy.pdf";
  const visibleText="Privacy policy. Retention period. We retain personal data for three years after the service relationship ends and then delete it unless a legal obligation requires a longer period.";
  const sections=extractPolicySections({sourceUrl,visibleText,html:`<h2>Retention period</h2><p>${visibleText}</p>`});
  const rows=buildGdprTransparencyTopicCoverageDiagnostics({
    documentRole:"policy_document",ownership:{targetRelationship:"target_controller",ownershipConfidence:1,ownershipReasonCodes:[]},
    contentCoverage:{status:"complete",sourceTextChars:visibleText.length,extractedSectionCount:sections.length,retainedSectionCount:sections.length,retainedTableRowCount:0,limitationKeys:[]},
    documentTextCoverage:{status:"complete",sourceTextChars:visibleText.length,retainedTextChars:visibleText.length,limitationKeys:[],pdfSourceCoverage:boundedPdfText({text:visibleText,total:18,pages:Array.from({length:12},(_,i)=>({num:i+1}))}).coverage},
    sectionEvidence:retainedArticle13SectionEvidenceFromSections(sections,sourceUrl),
  });
  assert.equal(rows.find(row=>row.topic==="data_retention")?.evaluationState,"observed");
  assert.ok(rows.filter(row=>row.evaluationState!=="observed").every(row=>row.evaluationState==="unknown"&&row.coverageState==="limited"));
});
