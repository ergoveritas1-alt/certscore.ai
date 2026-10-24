import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveCanonicalVendor,resolveVendorObservations,type VendorResolverInput} from './index';

test('source-reviewed passive CMP identities remain separate from tag-management and tracking attribution',()=>{
 for(const [input,vendor] of [
  [{type:'cmp_runtime',domSelector:'#ensNotifyBanner'},'Ensighten Privacy'],
  [{type:'cmp_runtime',domSelector:'#tcf2__ensModalWrapper'},'Ensighten Privacy'],
  [{type:'cmp_runtime',domSelector:'.ccm-root'},'CCM19'],
  [{type:'script',url:'https://www.fc-moto.com/rp/cb/app.js?apiKey=fixture&domain=fixture'},'CCM19'],
 ] as Array<[VendorResolverInput,string]>){
  const r=resolveCanonicalVendor(input);assert.equal(r.status,'resolved');assert.equal(r.observation?.vendor,vendor);
  assert.equal(r.observation?.purpose,'consent_management');assert.ok(r.observation?.registryAttribution?.ruleIds.length);
 }
 for(const input of [
  {type:'script',url:'https://vw-tam.lighthouselabs.eu/vwd6/gb_one/Bootstrap.js'},
  {type:'script',url:'https://www.fc-moto.com/rp/tp/aGTM.js'},
  {type:'script',url:'https://other.example/rp/cb/app.js'},
  {type:'script',url:'https://www.fc-moto.com.evil.example/rp/cb/app.js'},
  {type:'cmp_runtime',globalName:'CCM'}, {type:'cmp_runtime',globalName:'Bootstrapper'},
  {type:'cmp_runtime',domSelector:'#ensNotifyBanner-copy'}, {type:'cmp_runtime',domSelector:'.ccm-root-example'},
 ] as VendorResolverInput[])assert.equal(resolveVendorObservations([input]).some(r=>['Ensighten Privacy','CCM19'].includes(r.vendor??'')),false);
});
