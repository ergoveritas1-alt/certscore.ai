import assert from 'node:assert/strict';
import test from 'node:test';
import {materializeSelfHiddenFrameInspection, privacyChoiceInspectionSchema, isCurrentCaliforniaChoiceInspection} from './california-privacy-review';
import {selfHiddenFrameFixture as baseline} from './test-fixtures/self-hidden-frame';
const wouldQualify=(value:unknown, verifiedOriginalVisit=true)=>verifiedOriginalVisit && Boolean(materializeSelfHiddenFrameInspection(value));
test('v6 qualifies exact self-hidden proof; historical v5 absence rules still reject it',()=>{
  const value=baseline(); assert.ok(wouldQualify(value));assert.ok(privacyChoiceInspectionSchema.safeParse(value).success);
  assert.equal(privacyChoiceInspectionSchema.safeParse({...value,coverage:'complete',limitationKeys:[]}).success,false);
  assert.equal(wouldQualify(value,false),false);
});
for(const reason of ['visibility_hidden','visibility_collapse','opacity_zero','aria_hidden','inert','no_rect','visible']) test(`exclude ${reason}`,()=>{
  const v=baseline();v.diagnostics.frames[0]!.first.reason=reason;v.diagnostics.frames[0]!.second.reason=reason;assert.equal(wouldQualify(v),false);
});
for(const [name,mutate] of [
  ['ancestor hiding',(v:any)=>{v.diagnostics.frames[0].first.depth=1;v.diagnostics.frames[0].second.depth=1;}],
  ['missing identity',(v:any)=>delete v.diagnostics.checkpointIdentity],
  ['missing second checkpoint',(v:any)=>{v.diagnostics.secondDocumentHash=null;v.diagnostics.frames[0].second=null;}],
  ['node replacement',(v:any)=>{v.diagnostics.checkpointIdentity.status='limited';v.diagnostics.checkpointIdentity.frames[0].node='different';v.diagnostics.checkpointIdentity.frames[0].document='unavailable';v.diagnostics.checkpointIdentity.limitations=['node_changed'];}],
  ['child navigation',(v:any)=>{v.diagnostics.checkpointIdentity.status='limited';v.diagnostics.checkpointIdentity.frames[0].document='different';v.diagnostics.checkpointIdentity.limitations=['document_changed'];}],
  ['source mismatch',(v:any)=>v.diagnostics.inspectionSourceHash='f'.repeat(64)],
  ['opaque child',(v:any)=>{v.diagnostics.frames[0].first.frameDocumentHash=null;v.diagnostics.frames[0].second.frameDocumentHash=null;}],
  ['frame sample evicted',(v:any)=>v.diagnostics.frames=[]],
  ['time limit',(v:any)=>{v.diagnostics.status='limited';v.diagnostics.limitations=['diagnostic_time_limit'];}],
  ['metadata truncation',(v:any)=>{v.diagnostics.status='limited';v.diagnostics.limitations=['byte_limit'];}],
  ['candidate truncation',(v:any)=>v.candidateEnumerationTruncated=true],
  ['locator truncation',(v:any)=>v.diagnostics.frames[0].first.locatorLimited=true],
  ['unstable document',(v:any)=>v.documentStable=false],
  ['unnamed control',(v:any)=>{v.unnamedControlCount=1;v.limitationKeys.push('unnamed_controls');}],
  ['unsupported language',(v:any)=>{v.supportedDocumentLanguage=false;v.limitationKeys.push('unsupported_language');}],
  ['loading parent',(v:any)=>{v.documentReadyState='loading';v.limitationKeys.push('document_loading');}],
  ['interactive parent',(v:any)=>v.documentReadyState='interactive'],
  ['unrepresentative parent',(v:any)=>{v.representativeDocument=false;v.limitationKeys.push('document_not_representative');}],
  ['named choice candidate',(v:any)=>v.namedChoiceCandidateCount=1],
  ['uninspected shadow root',(v:any)=>{v.uninspectedShadowRootCount=1;v.limitationKeys.push('shadow_inventory_incomplete');}],
  ['mixed visible and hidden frames',(v:any)=>{v.frameCount=2;v.inspectedSameOriginFrameCount=1;}],
  ['inaccessible frame',(v:any)=>{v.hiddenUninspectedFrameCount=0;v.inaccessibleFrameCount=1;}],
  ['unready frame',(v:any)=>{v.hiddenUninspectedFrameCount=0;v.unreadyFrameCount=1;}],
  ['over four frames',(v:any)=>{v.frameCount=5;v.uninspectedFrameCount=5;v.hiddenUninspectedFrameCount=5;}],
] as const) test(`exclude ${name}`,()=>{const value=baseline();mutate(value);assert.equal(wouldQualify(value),false);});

test('two independently proven self-hidden frames qualify',()=>{
  const v=baseline();v.frameCount=v.hiddenUninspectedFrameCount=v.uninspectedFrameCount=2;
  v.diagnostics.frames.push({first:{...v.diagnostics.frames[0]!.first,locatorHash:'e'.repeat(64)},second:{...v.diagnostics.frames[0]!.first,locatorHash:'e'.repeat(64)}});
  v.diagnostics.checkpointIdentity.frames.push({slot:1,node:'same',document:'same'});assert.ok(wouldQualify(v));
});


test('v6 retains raw counts and rejects forged accounting or removed proof',()=>{
  const original=baseline(), next=materializeSelfHiddenFrameInspection(original)!;
  assert.ok(next);assert.equal(next.contractVersion,'certscore.privacy-choice-inspection.v6');
  assert.equal(next.coverage,'complete');assert.equal(next.uninspectedFrameCount,1);assert.equal(next.hiddenUninspectedFrameCount,1);
  assert.deepEqual(next.limitationKeys,['frame_inventory_incomplete']);
  assert.deepEqual(next.frameExclusion,{policyVersion:'self_display_none_at_both_checkpoints.v1',excludedFrameCount:1,blockingFrameCount:0,frameSlots:[0]});
  assert.ok(isCurrentCaliforniaChoiceInspection(next));
  assert.equal(original.contractVersion,'certscore.privacy-choice-inspection.v5');assert.equal(original.coverage,'limited');
  for(const patch of [{uninspectedFrameCount:0},{hiddenUninspectedFrameCount:0},{diagnostics:undefined},
    {frameExclusion:{...next.frameExclusion,excludedFrameCount:2}}, {frameExclusion:{...next.frameExclusion,frameSlots:[1]}},
    {frameExclusion:{...next.frameExclusion,blockingFrameCount:1}}, {coverage:'limited'}, {limitationKeys:[]}])
    assert.equal(privacyChoiceInspectionSchema.safeParse({...next,...patch}).success,false);
  assert.equal(materializeSelfHiddenFrameInspection(next),undefined,'Already versioned records are not re-materialized');
});

test('legacy inspections never receive the new exemption during parsing',()=>{
  const original=baseline();
  const parsed=privacyChoiceInspectionSchema.parse(original);assert.equal(parsed.coverage,'limited');
  assert.equal(parsed.contractVersion,'certscore.privacy-choice-inspection.v5');
  const {diagnostics,limitationKeys,documentReadyState,readinessPolicy,...v4}=original;
  assert.ok(privacyChoiceInspectionSchema.safeParse({...v4,contractVersion:'certscore.privacy-choice-inspection.v4'}).success);
  assert.equal(materializeSelfHiddenFrameInspection({...v4,contractVersion:'certscore.privacy-choice-inspection.v4'}),undefined);
});

test('duplicate frame locators cannot account for distinct excluded frames',()=>{
  const v=baseline();v.frameCount=v.hiddenUninspectedFrameCount=v.uninspectedFrameCount=2;
  v.diagnostics.frames.push(structuredClone(v.diagnostics.frames[0]!));
  v.diagnostics.checkpointIdentity.frames.push({slot:1,node:'same',document:'same'});
  assert.equal(materializeSelfHiddenFrameInspection(v),undefined);
});

test('four frames qualify at the existing cap; contradictory unnamed diagnostics do not',()=>{
  const v=baseline();v.frameCount=v.hiddenUninspectedFrameCount=v.uninspectedFrameCount=4;
  for(let slot=1;slot<4;slot++) {
    const frame={...v.diagnostics.frames[0]!.first,locatorHash:String(slot).repeat(64)};
    v.diagnostics.frames.push({first:{...frame},second:{...frame}});
    v.diagnostics.checkpointIdentity.frames.push({slot,node:'same',document:'same'});
  }
  const next=materializeSelfHiddenFrameInspection(v)!;assert.ok(next);
  assert.deepEqual(next.frameExclusion.frameSlots,[0,1,2,3]);
  assert.ok(Buffer.byteLength(JSON.stringify(next.diagnostics))+Buffer.byteLength(JSON.stringify(next.frameExclusion))<=4096);
  const contradictory:any=baseline();
  contradictory.diagnostics.unnamedControls=[{locatorHash:'e'.repeat(64),locatorLimited:false,scope:'main',tag:'button',role:'button',
    nameStates:[0,0,0,0,0,0],labelledByTruncated:false}];
  assert.ok(privacyChoiceInspectionSchema.safeParse(contradictory).success);
  assert.equal(materializeSelfHiddenFrameInspection(contradictory),undefined);
});
