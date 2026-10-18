import assert from "node:assert/strict";
import test from "node:test";
import { assessGoverningPolicyBodyEvidence, assessPolicyDocumentSubstance, assessPolicyDocumentRoleForChildSelection } from "./scanners/policy-surface-scanner";
const text = ("California Privacy Notice. We collect identifiers and internet activity. We use personal information to provide our services and deliver advertising. You have the right to know and delete your personal information. We sell or share personal information for targeted advertising. ").repeat(12);
test("owned, substantive and fully retained California notices enter the document handoff", () => {
  for (const surface of ["california_notice", "notice_at_collection"] as const) {
    const candidate = { deterministicSurfaceType: surface, normalizedUrl: "https://brand.test/privacy/california", linkText: "California Privacy Notice", deterministicClassifierReasonCodes: ["matched_" + surface, "match_strength_equivalent", "context_satisfied"] } as never;
    const body = { candidate, documentSubstance: assessPolicyDocumentSubstance({ surfaceType: surface, text }), documentTextChars: text.length, documentTextCoverageStatus: "complete" as const, evidenceBoundObservedTopicCount: 0, substantiveDisclosureSignalCount: 0, targetRelationship: "first_party_brand" as const, text, title: "California Privacy Notice" };
    const assessment = assessGoverningPolicyBodyEvidence(body);
    assert.equal(assessment.state, "substantive");
    assert.equal(assessPolicyDocumentRoleForChildSelection(candidate, { fetchCandidates: [], observedChildCandidates: [] }, { governingPolicyBodyAssessment: assessment }).role, "policy_document");
    for (const change of [{ targetRelationship: "unknown" as const }, { documentTextCoverageStatus: "truncated" as const }, { documentSubstance: assessPolicyDocumentSubstance({ surfaceType: surface, text: "Navigation only. Cookie settings." }) }]) {
      const limited = assessGoverningPolicyBodyEvidence({ ...body, ...change });
      assert.notEqual(limited.state, "substantive");
      assert.equal(assessPolicyDocumentRoleForChildSelection(candidate, { fetchCandidates: [], observedChildCandidates: [] }, { governingPolicyBodyAssessment: limited }).role, "unknown");
    }
  }
});

test("direct cross-origin collection notices remain fetch candidates",async()=>{
 const {isFetchablePolicyCandidateForPolicySurface}=await import('./scanners/policy-surface-scanner');
 assert.equal(isFetchablePolicyCandidateForPolicySurface({baseUrl:'https://open.example.test/',href:'https://www.example.test/us/legal/notice-at-collection/',normalizedUrl:'https://www.example.test/us/legal/notice-at-collection/',surfaceType:'notice_at_collection',matchStrength:'direct',linkText:'Notice at Collection'}),true);
 assert.equal(isFetchablePolicyCandidateForPolicySurface({baseUrl:'https://open.example.test/',href:'https://unrelated.test/other',normalizedUrl:'https://unrelated.test/other',surfaceType:'unknown',linkText:'Other'}),false);
});

test('canonical California consumer notice and act links survive privacy-context classification',async()=>{
 const {classifyPrivacySurface}=await import('@certscore/contracts');
 for(const linkText of ['California Consumer Privacy Notice','California Consumer Privacy Act'])assert.equal(classifyPrivacySurface({linkText,surroundingText:'Privacy policy for California residents'}).surfaceType,'california_notice');
});

test('one-hop governing California supplement is fetched ahead of general security links',async()=>{
 const {highValueSecondaryCandidatesFromPolicyPage,selectOneHopPolicyIndexChildren}=await import('./scanners/policy-surface-scanner');
 const base='https://www.bank.test/privacy/online-privacy-policy';
 const candidates=highValueSecondaryCandidatesFromPolicyPage(base,'<footer><a href="/privacy/online-privacy-policy">Privacy Notice</a><a href="/privacy/ca-consumer-privacy-notice">California Consumer Privacy Notice</a><a href="/privacy/security">Security Center</a></footer>','Privacy Notice. Privacy information for California residents. GDPR privacy notice.');
 assert.ok(candidates.some(c=>c.deterministicSurfaceType==='california_notice'),JSON.stringify(candidates));
 const result=await selectOneHopPolicyIndexChildren({input:{normalizedUrl:base,region:'us-west-1'} as never,indexCandidate:{normalizedUrl:base,deterministicSurfaceType:'privacy_policy',deterministicMatchedLocale:'en'} as never,indexText:'Our online privacy policy.',candidates:candidates.map(c=>({...c,sameOrigin:false}))});
 assert.equal(result.fetchCandidates[0]?.deterministicSurfaceType,'california_notice',JSON.stringify({candidates,result}));
});

for (const fast of [false,true]) for (const competingIndex of [false,true]) test(`${fast ? "fast" : "full"} policy capture fetches a California child with competing index ${competingIndex}`,async()=>{
 const {createServer}=await import('node:http');const {once}=await import('node:events');
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');
 const {createArtifactWriter}=await import('./artifact-writer');const {policySurfaceScanner}=await import('./scanners/policy-surface-scanner');
 const hits:string[]=[];const server=createServer(async(request,response)=>{hits.push(request.url??'');response.setHeader('Content-Type','text/html');
  if(request.url==='/slow.js') { response.setHeader('Content-Type','text/javascript'); return; }
  if(request.url==='/privacy') { if(competingIndex) await new Promise(resolve=>setTimeout(resolve,200)); response.end(`<title>Online Privacy Policy</title><main><h1>Online Privacy Policy</h1><p>${text.repeat(5)}</p><a href="/privacy">Privacy Notice</a><a href="/privacy/ca-consumer-privacy-notice">California Consumer Privacy Notice</a><a href="/privacy/ca-consumer-privacy-notice-jpmselect">California Consumer Privacy Notice for Reserve Customers</a></main>`);}
  else if(request.url==='/privacy-security/financial-abuse')response.end('<title>Privacy Center</title><main>'+('Personal data and cookies are discussed in the privacy policy documents listed below. Select a privacy document for your audience. The privacy center lists policy documents. '.repeat(25))+'</main><footer><a href="/privacy">Privacy Notice</a><a href="/privacy/other-disclosure">Additional privacy disclosure</a></footer>');
  else if(request.url?.startsWith('/privacy/ca-consumer'))response.end(`<title>California Privacy Notice</title><main><h1>California Privacy Notice</h1><p>${text}</p></main>`);
  else response.end((fast ? '<script src="/slow.js"></script>' : '')+'<footer><a href="/privacy">Privacy Notice</a>'+(competingIndex?'<a href="/privacy-security/financial-abuse">Financial abuse</a>':'')+'</footer>');});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;const dir=await mkdtemp(path.join(tmpdir(),'ca-handoff-'));
 try{const result=await policySurfaceScanner({url:base,normalizedUrl:base,scanStartedAtMs:Date.now(),internalBudgetMs:fast ? 1500 : 10000,discoveryMode:fast ? "fast" : "full",artifactWriter:await createArtifactWriter(dir),nanoAssistProvider:{async classifyLinks(input){return {assistId:input.assistId,rankedCandidates:input.candidates.filter(c=>c.deterministicSurfaceType!=="unknown").map((c,i)=>({candidateId:c.candidateId,likelySurfaceType:c.deterministicSurfaceType,shouldFetch:true,priorityRank:i+1,confidence:0.9,reason:"Fixture ranking",uncertaintyNotes:[]}))}}}});const ca=result.policySurfaceObservations.find(x=>x.normalizedUrl===base+'/privacy/ca-consumer-privacy-notice');assert.equal(ca?.status,'fetched',JSON.stringify({ca,hits,observations:result.policySurfaceObservations.map(s=>({url:s.normalizedUrl,status:s.status,role:s.documentRole,reasons:s.documentRoleReasonCodes,failure:s.fetchFailureReason})),errors:result.moduleRun.errors}));assert.equal(ca?.documentRole,'policy_document');assert.equal(ca?.parentSurfaceUrl,base+'/privacy');assert.equal(hits.filter(x=>x==='/privacy/ca-consumer-privacy-notice').length,1);assert.equal(hits.some(x=>x==='/privacy/ca-consumer-privacy-notice-jpmselect'),false);}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});

for(const outlineOnly of [false,true]) test(`usable policy introduction does not suppress bounded recovery of a client-rendered California section: outline=${outlineOnly}`,async()=>{
 const {createServer}=await import('node:http');const {once}=await import('node:events');
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');
 const {createArtifactWriter}=await import('./artifact-writer');const {policySurfaceScanner,hasCollapsedCaliforniaDisclosure,hasCaliforniaNoticeOutline}=await import('./scanners/policy-surface-scanner');
 const introduction='Privacy Policy. We collect personal information to operate services and provide customer support. Contact us about personal data. '.repeat(20);
 const clause='California consumers may request access, correction and deletion of their personal information. We do not discriminate when you exercise these rights.';
 const shell=`<html><head><title>Privacy Policy</title></head><body><main><h1>Privacy Policy</h1><p>${introduction}</p>${outlineOnly ? "<p>2. California Consumer Privacy Act (CCPA) Notice 3. General Data Protection Regulation (GDPR) Notice</p>" : '<button aria-controls="ca" aria-expanded="false">California Consumer Privacy Act Notice</button>'}<section id="ca" hidden></section></main><script>document.getElementById('ca').textContent=${JSON.stringify(clause)};</script></body></html>`;
 assert.equal(hasCollapsedCaliforniaDisclosure(shell),!outlineOnly);
 assert.equal(hasCaliforniaNoticeOutline('Global Disclosures 1. U.S. State Data Privacy Laws Notice 2. California Consumer Privacy Act (CCPA) Notice 3. General Data Protection Regulation (GDPR) Notice'),true);
 assert.equal(hasCaliforniaNoticeOutline('California Consumer Privacy Act (CCPA) Notice. California consumers may request deletion. 3. General Data Protection Regulation (GDPR) Notice'),false);
 assert.equal(hasCollapsedCaliforniaDisclosure('<button aria-controls="x" aria-expanded="false">Cookie settings</button>'),false);
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(req.url==='/privacy'?shell:'<footer><a href="/privacy">Privacy Policy</a></footer>');});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');
 const base=`http://127.0.0.1:${address.port}`;const dir=await mkdtemp(path.join(tmpdir(),'ca-collapsed-'));
 try {
  const result=await policySurfaceScanner({url:base,normalizedUrl:base,scanStartedAtMs:Date.now(),internalBudgetMs:10000,artifactWriter:await createArtifactWriter(dir),nanoAssistProvider:{async classifyLinks(input){return {assistId:input.assistId,rankedCandidates:input.candidates.filter(c=>c.deterministicSurfaceType==='privacy_policy').map((c,i)=>({candidateId:c.candidateId,likelySurfaceType:c.deterministicSurfaceType,shouldFetch:true,priorityRank:i+1,confidence:0.9,reason:'Fixture',uncertaintyNotes:[]}))}}}});
  const policy=result.policySurfaceObservations.find(p=>p.normalizedUrl===base+'/privacy'&&p.status==='fetched');
  assert.ok(policy,JSON.stringify(result.moduleRun));
  const {readdir,readFile}=await import('node:fs/promises');const files=await readdir(dir);
  const retained=(await Promise.all(files.filter(f=>f.startsWith('policy_surface_text_')).map(f=>readFile(path.join(dir,f),'utf8')))).join('\n');
  assert.match(retained,/California consumers may request access, correction and deletion/);
  assert.ok(result.moduleRun.timingBreakdown?.some(t=>/rendered low-quality text fallback/.test(t.label)));
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
