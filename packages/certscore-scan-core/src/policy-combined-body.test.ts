import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPrivacySurface} from '@certscore/contracts';
import {assessGoverningPolicyBodyEvidence,assessPolicyDocumentSubstance,extractPolicyFacts,type PolicySurfaceCandidate} from './scanners/policy-surface-scanner';

test('combined Terms/Privacy body needs substantive retained disclosures, ownership and complete text',()=>{
 const text='Terms & Privacy. Privacy Policy. We collect personal data to provide our service. We retain personal data for six months. Contact the data controller at privacy@example.test. You have the right to access and delete your personal information. '.repeat(14);
 const classification=classifyPrivacySurface({linkText:'Terms & Privacy',url:'https://example.test/terms'});
 const candidate={normalizedUrl:'https://example.test/terms',deterministicSurfaceType:classification.surfaceType,deterministicMatchStrength:classification.matchStrength,deterministicClassifierReasonCodes:classification.reasonCodes} as PolicySurfaceCandidate;
 const facts=extractPolicyFacts(text);
 const input={candidate,documentSubstance:assessPolicyDocumentSubstance({surfaceType:'privacy_policy',text}),text,documentTextChars:text.length,documentTextCoverageStatus:'complete' as const,targetRelationship:'target_controller' as const,evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:facts.article13DisclosureSignals.filter(s=>s.status==='observed').length};
 assert.equal(assessGoverningPolicyBodyEvidence(input).state,'substantive');
 assert.equal(assessGoverningPolicyBodyEvidence({...input,targetRelationship:'unknown'}).state,'insufficient');
 assert.equal(assessGoverningPolicyBodyEvidence({...input,documentTextCoverageStatus:'truncated'}).state,'insufficient');
 const thin='Terms of service. Read our Privacy Policy for more information. '.repeat(55);
 assert.equal(assessGoverningPolicyBodyEvidence({...input,text:thin,documentTextChars:thin.length,documentSubstance:assessPolicyDocumentSubstance({surfaceType:'privacy_policy',text:thin}),substantiveDisclosureSignalCount:0}).state,'insufficient');
});

test('short complete standalone notices use distinct retained disclosure proof instead of a fixed 2500-character cutoff',()=>{
 const text='Privacy Policy. We collect personal information to provide our service. We retain personal information for six months. Contact the data controller at privacy@example.test. You have the right to access and delete your personal information. Hosting records include the requested URL, timestamp and browser information to deliver and protect the site. Analytics services may set cookies and collect page visits, device characteristics and approximate location to diagnose usability issues. ';
 const classification=classifyPrivacySurface({linkText:'Privacy Policy',url:'https://example.test/privacy'});
 const candidate={normalizedUrl:'https://example.test/privacy',deterministicSurfaceType:classification.surfaceType,deterministicMatchStrength:classification.matchStrength,deterministicClassifierReasonCodes:classification.reasonCodes} as PolicySurfaceCandidate;
 const body=text.repeat(3);
 assert.ok(body.length>=1000 && body.length<2500);
 const input={candidate,documentSubstance:assessPolicyDocumentSubstance({surfaceType:'privacy_policy',text:body}),text:body,documentTextChars:body.length,documentTextCoverageStatus:'complete' as const,targetRelationship:'target_controller' as const,evidenceBoundObservedTopicCount:2,substantiveDisclosureSignalCount:2};
 const assessment=assessGoverningPolicyBodyEvidence(input);
 assert.equal(assessment.state,'substantive');
 assert.ok(assessment.reasonCodes.includes('short_substantive_policy_body.v1'));
 for(const patch of [{targetRelationship:'unknown' as const},{documentTextCoverageStatus:'truncated' as const},
   {evidenceBoundObservedTopicCount:1,substantiveDisclosureSignalCount:1},{documentTextChars:900}])
   assert.equal(assessGoverningPolicyBodyEvidence({...input,...patch}).state,'insufficient');
 const shell=('Privacy Policy. Read our privacy policy. Navigation Contact Products Careers. ').repeat(20);
 assert.equal(assessGoverningPolicyBodyEvidence({...input,text:shell,documentTextChars:shell.length,documentSubstance:assessPolicyDocumentSubstance({surfaceType:'privacy_policy',text:shell}),evidenceBoundObservedTopicCount:0,substantiveDisclosureSignalCount:0}).state,'insufficient');
});
