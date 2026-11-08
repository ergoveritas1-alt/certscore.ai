import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {canonicalEvidenceBundleSchema,gpcObservationSessionSchema} from '@certscore/contracts';
import {resolveVendorObservations} from '@certscore/vendor-resolver';
import {gpcProductionRuntimeFixture} from '../../certscore-contracts/src/test-fixtures/gpc-production';
import {buildGpcProductionObservation} from './gpc-production-observation';

function collectorFixture(url:string){
 const bundle=gpcProductionRuntimeFixture(),event=bundle.networkEvents[1]!;
 event.requestUrl=event.url=url;event.collectionEndpointObserved=true;
 bundle.networkResponseEvents=canonicalEvidenceBundleSchema.parse({...bundle,networkResponseEvents:[{...event,eventType:'network_response',eventId:'response',responseUrl:url,status:200}]}).networkResponseEvents;
 bundle.normalizedVendorObservations=resolveVendorObservations([{type:'request',url,evidenceId:event.eventId,sourceScanner:'pre_consent_runtime',matchSource:'network_request'}]);
 bundle.gpcObservationSession!.requests.find(r=>r.eventId===event.eventId)!.urlSha256=createHash('sha256').update(url).digest('hex');
 const run=()=>{
  bundle.gpcObservationSession=gpcObservationSessionSchema.parse(bundle.gpcObservationSession);
  bundle.gpcPrototypeSessionBinding!.sessionSha256=createHash('sha256').update(JSON.stringify(bundle.gpcObservationSession)).digest('hex');
  const bytes=Buffer.from(JSON.stringify(bundle));
  return buildGpcProductionObservation({scanId:bundle.scanId,source:{bytes,pointer:{uri:'fixture.json',sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}}});
 };
 return {bundle,event,run};
}

test('body-observed GPC roles survive restriction handling without gaining California eligibility',async()=>{
 const {createGpcRequestProofCapture}=await import('./gpc-request-proof');
 const {deriveCaliforniaGpcResponsePolicy}=await import('../../../apps/web/lib/scans/california-gpc-response-policy');
 const {buildGpcResponseAssessment}=await import('./gpc-response-assessment');
 const {gpcRuntimeFixture}=await import('../../certscore-contracts/src/test-fixtures/gpc-runtime');
 for(const privacy of ['', '&rdp=1', '&gpp=bad&gpp_sid=7', '&us_privacy=1NYN']){
  const {bundle,event,run}=collectorFixture('https://www.google.com/pagead/conversion/123/');
  event.method='POST';
  const session=bundle.gpcObservationSession!,capture=createGpcRequestProofCapture(()=>event.timestampMs+1);
  capture.reserve(event,session.mainDocument!.documentToken,{method:()=>event.method,postData:()=>`gclid=visitor123${privacy}`})!({'content-type':'application/x-www-form-urlencoded'});
  capture.response(event.eventId,200);session.requestProofCapture=capture.finish(session.mainDocument!.documentToken);
  const observation=run(),q=observation.requests.advertisingCollectionQualification!.rows[0]!;
  assert.equal(observation.requests.advertisingCollectionCount,1,privacy);
  assert.equal(q.activity,'identified_advertising_collection',privacy);
  assert.equal(q.basis,'google_advertising_conversion_identifier');
  const bytes=Buffer.from(JSON.stringify(bundle)),pointer={uri:'fixture.json',sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const comparison=buildGpcResponseAssessment({baseline:gpcRuntimeFixture({enabled:false}),baselineArtifact:pointer,gpc:bundle,gpcArtifact:pointer});
  const assessment={...comparison,contractVersion:'certscore.gpc-response-assessment.v3' as const,observation};
  const result=deriveCaliforniaGpcResponsePolicy(assessment);
  assert.equal(result.deductionPoints,privacy?0:15,privacy);
  assert.equal((result.recipientIds??[]).length,privacy?0:1,privacy);
  assert.equal(session.requestProofCapture.inspected,1);
  assert.equal(session.requestProofCapture.rows.length,1);
  assert.doesNotMatch(JSON.stringify(session.requestProofCapture),/visitor123/);
 }
});
