import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assessGoverningPolicyBodyEvidence,assessPolicyDocumentSubstance} from './scanners/policy-surface-scanner';
import {retainedPolicyBodyDeclarations} from './policy-body-declarations';
const rows=JSON.parse(readFileSync(new URL('./test-fixtures/short-policy-heldout.json',import.meta.url),'utf8'));
for(const row of rows) test(`held-out short policy: ${row.observation.finalUrl} ${row.textSha256.slice(0,8)}`,()=>{
 const o=row.observation;
 assert.equal(createHash('sha256').update(row.text).digest('hex'),row.textSha256);
 const result=assessGoverningPolicyBodyEvidence({candidate:{normalizedUrl:o.normalizedUrl??o.finalUrl,deterministicSurfaceType:o.surfaceType,deterministicClassifierReasonCodes:o.classifierReasonCodes??[]} as never,
  text:row.text,title:o.title,documentOwnerEntity:o.documentOwnerEntity,documentTextChars:row.text.length,
  documentTextCoverageStatus:o.documentTextCoverage?.status,targetRelationship:o.targetRelationship,
  documentSubstance:assessPolicyDocumentSubstance({surfaceType:o.surfaceType,text:row.text,title:o.title,finalUrl:o.finalUrl}),
  evidenceBoundObservedTopicCount:o.governingPolicyBodyAssessment?.evidenceBoundObservedTopicCount??0,substantiveDisclosureSignalCount:o.governingPolicyBodyAssessment?.substantiveDisclosureSignalCount??0});
 assert.equal(result.state,row.expected);
});
test('short declaration proof excludes examples and binds a named subject literally',()=>{
 const text="Acme uses cookies to store preferences. Acme will never share your email address.";
 assert.equal(retainedPolicyBodyDeclarations(text,'Acme').eligible,true);
 assert.equal(retainedPolicyBodyDeclarations(text,'Other company').eligible,false);
 for(const prefix of ['This page is an example privacy-policy template. ', 'These are not descriptions of our data practices. '])
  assert.equal(retainedPolicyBodyDeclarations(prefix+text,'Acme').eligible,false);
});
test('short declaration proof deduplicates statements and stays bounded',()=>{
 const text='We store personal data in our database. ';
 assert.equal(retainedPolicyBodyDeclarations(text.repeat(25)).eligible,false);
 assert.equal(retainedPolicyBodyDeclarations('x'.repeat(2500)+' We collect personal data. We store cookies.').eligible,false);
});
