import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCanonicalVendor, resolveCanonicalCookieClassification, resolveCanonicalCookieKnowledge, COOKIE_PURPOSE_POLICY} from './index';
import {resolveCanonicalActionStoragePurpose} from './action-storage-purpose';
import {isCanonicalAdvertisingCollectionCandidate, classifyCanonicalCollectionEndpoint} from './collection-endpoints';

test('exact DoubleClick GA advertising-feature collector requires client ID, measurement destination and protocol version',()=>{
 for(const query of ['v=2&tid=G-ABC123&cid=123.456','cid=123.456&tid=G-ABC123&v=2']){
  const url='https://stats.g.doubleclick.net/g/collect?'+query;
  assert.equal(resolveCanonicalVendor({type:'request',url}).observation?.registryAttribution?.matchKind,'endpoint');
  assert.equal(isCanonicalAdvertisingCollectionCandidate(url,'ping'),true);
 }
 for(const url of ['https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123','https://stats.g.doubleclick.net/g/collect?v=2&tid=G-ABC123&cid=',
  'https://stats.g.doubleclick.net/g/collect?v=2&tid=AW-123&cid=123.456','https://stats.g.doubleclick.net/g/collect-config?v=2&tid=G-ABC123&cid=123.456',
  'https://stats.g.doubleclick.net.evil.test/g/collect?v=2&tid=G-ABC123&cid=123.456']){
  assert.notEqual(resolveCanonicalVendor({type:'request',url}).observation?.registryAttribution?.matchKind,'endpoint',url);
 }
 assert.equal(resolveCanonicalVendor({type:'request',url:'https://rtb.openx.net/esp?url=https%3A%2F%2Fpublisher.test%2F&rid=esp'}).observation?.registryAttribution?.matchKind,'endpoint');
 assert.notEqual(resolveCanonicalVendor({type:'request',url:'https://rtb.openx.net/esp?url=&rid=esp'}).observation?.registryAttribution?.matchKind,'endpoint');
 assert.equal(classifyCanonicalCollectionEndpoint('https://gum.criteo.com/syncframe?origin=prebid&gdpr=0','document').category,'identity_sync_bootstrap');
 assert.equal(isCanonicalAdvertisingCollectionCandidate('https://gum.criteo.com/syncframe?origin=prebid','document'),false);
});

test('CreativeCDN exact documented cookies qualify only in fresh v5 domain context; historical and generic names stay neutral',()=>{
 for(const name of ['u','ts']){
  const c=resolveCanonicalCookieClassification(name,{cookieDomain:'.creativecdn.com'});
  assert.equal(c.version,COOKIE_PURPOSE_POLICY);assert.equal(c.category,'advertising');assert.equal(c.essentiality,'non_essential');
  assert.equal(c.provider?.registryAttribution.entityId,'ent_f3a0ce7ab768');
  assert.equal(resolveCanonicalActionStoragePurpose({storageType:'cookie',name,hostname:'creativecdn.com'}).nonEssential,true);
  for(const purposePolicyVersion of [undefined,'certscore.cookie-purpose.v2','certscore.cookie-purpose.v3','certscore.cookie-purpose.v4'] as const)
   assert.equal(resolveCanonicalCookieKnowledge(name,{cookieDomain:'creativecdn.com',purposePolicyVersion}).essentiality,'unknown');
  for(const domain of ['example.test','creativecdn.com.evil.test'])assert.equal(resolveCanonicalCookieClassification(name,{cookieDomain:domain}).essentiality,'unknown');
 }
 for(const name of ['c','__rtbh.lid','t2gt.tid','_dd_s'])assert.equal(resolveCanonicalCookieClassification(name,{cookieDomain:'example.test'}).essentiality,'unknown');
 assert.equal(resolveCanonicalActionStoragePurpose({storageType:'local_storage',name:'ts',hostname:'creativecdn.com'}).nonEssential,false);
 assert.equal(resolveCanonicalCookieKnowledge('_hp2_id.123',{purposePolicyVersion:'certscore.cookie-purpose.v4'}).essentiality,'non_essential');
});
