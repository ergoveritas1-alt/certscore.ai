import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveCanonicalVendor} from './index';
test('Criteo first-party identity collection requires the exact endpoint and nonempty identifier',()=>{
 for(const url of ['https://gum.criteo.com/fpm/init?first_party_id=opaque','https://gum.us.criteo.com/fpm/sid?p=123&first_party_id=opaque&first_party_domain=example.test']){
  const result=resolveCanonicalVendor({type:'request',url,sourceScanner:'fixture',matchSource:'network_request'}).observation;
  assert.equal(result?.vendor,'Criteo');assert.equal(result?.purpose,'advertising');assert.equal(result?.registryAttribution?.matchKind,'endpoint');
 }
 for(const url of ['https://gum.criteo.com/fpm/init?first_party_id=','https://gum.criteo.com/fpm/init?first_party_domain=example.test','https://gum.criteo.com/fpm/config?first_party_id=opaque','https://gum.criteo.com.attacker.test/fpm/init?first_party_id=opaque'])
  assert.notEqual(resolveCanonicalVendor({type:'request',url,sourceScanner:'fixture',matchSource:'network_request'}).observation?.registryAttribution?.matchKind,'endpoint');
});
