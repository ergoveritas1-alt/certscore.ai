import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assessGoverningPolicyBodyEvidence,assessPolicyDocumentSubstance,type PolicySurfaceCandidate} from './scanners/policy-surface-scanner';
const fixtures=JSON.parse(readFileSync(new URL('./test-fixtures/short-policy-retained.json',import.meta.url),'utf8'));
function input(row:any){const o=row.observation;return {candidate:{normalizedUrl:o.normalizedUrl,deterministicSurfaceType:o.surfaceType,deterministicClassifierReasonCodes:o.classifierReasonCodes} as PolicySurfaceCandidate,
 text:row.text,title:o.title,documentOwnerEntity:o.documentOwnerEntity,documentTextChars:row.text.length,documentTextCoverageStatus:'complete' as const,targetRelationship:o.targetRelationship,
 documentSubstance:assessPolicyDocumentSubstance({surfaceType:o.surfaceType,text:row.text,title:o.title,documentOwnerEntity:o.documentOwnerEntity,finalUrl:o.finalUrl}),evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0};}
for(const row of fixtures){
 test(`retained short notice is substantive: ${row.observation.finalUrl}`,()=>{
  assert.equal(createHash('sha256').update(row.text).digest('hex'),row.textSha256);
  assert.equal(row.observation.governingPolicyBodyAssessment.state,'insufficient');
  const body=assessGoverningPolicyBodyEvidence(input(row));assert.equal(body.state,'substantive');
  assert.ok(body.reasonCodes.includes('short_document_bound_notice.v2'));
 });
 test(`short notice requires owned complete standalone document: ${row.scanId}`,()=>{
  const base=input(row);
  for(const change of [{targetRelationship:'unrelated'},{documentTextCoverageStatus:'partial'}, {documentTextCoverageStatus:'truncated'},
   {candidate:{...base.candidate,deterministicClassifierReasonCodes:['variant_combined_privacy_terms_surface']}},
   {text:row.text+' Reject all cookies. Accept all cookies.'},
   {text:'<script>const data = '+JSON.stringify(row.text)+'</script>'},
   {text:row.text+' This policy applies only to employees and does not apply to website visitors.'}]){
   const changed={...base,...change};
   changed.documentTextChars=changed.text.length;
   changed.documentSubstance=assessPolicyDocumentSubstance({surfaceType:'privacy_policy',text:changed.text,title:changed.title});
   assert.notEqual(assessGoverningPolicyBodyEvidence(changed as any).state,'substantive',JSON.stringify(change));
  }
 });
}
test('a short privacy title with repeated generic vocabulary is not a governing notice',()=>{
 const row=fixtures[0],text=('Privacy Policy. We respect your privacy. Email and cookies. Learn about our services. ').repeat(9);
 assert.equal(assessGoverningPolicyBodyEvidence({...input(row),text,documentTextChars:text.length}).state,'insufficient');
});

test('duplicating one concrete disclosure cannot supply two independent processing facts',()=>{
 const row=fixtures[0],text=('Privacy Policy. We use cookies to keep you logged in to your account. Email. ').repeat(10);
 assert.equal(assessGoverningPolicyBodyEvidence({...input(row),text,documentTextChars:text.length}).state,'insufficient');
});
