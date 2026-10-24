import assert from 'node:assert/strict';
import test from 'node:test';
import {KNOWN_CMP_REGISTRY,detectKnownCmps,getKnownCmpActionCapability} from './known-cmps';

test('reviewed CCM19 and Ensighten Privacy identities never register actions or infer consent from tag management',()=>{
 for(const [name,selectors] of [['Ensighten Privacy',['#ensNotifyBanner','#ensModalWrapper','#tcf2__ensModalWrapper']],['CCM19',['.ccm-root','#ccm-widget']]] as const){
  for(const selector of selectors)assert.equal(detectKnownCmps({domSelectors:[selector]})[0]?.canonicalName,name);
  const d=KNOWN_CMP_REGISTRY.find(d=>d.canonicalName===name)!;assert.ok(d);
  assert.equal(d.saleSharingOptOut,undefined);assert.equal(d.preferenceDialogBinding,undefined);assert.equal(d.passiveConfigurationApi,undefined);
  for(const action of ['accept','reject'] as const){assert.equal(getKnownCmpActionCapability(name,action)?.recipeAvailable,false);assert.equal(getKnownCmpActionCapability(name,action)?.selectorRegistered,false);}
 }
 assert.equal(detectKnownCmps({urls:['https://www.fc-moto.com/rp/cb/app.js?apiKey=fixture&domain=fixture']})[0]?.canonicalName,'CCM19');
 for(const input of [
  {urls:['https://vw-tam.lighthouselabs.eu/vwd6/gb_one/Bootstrap.js']}, {jsGlobals:['Bootstrapper','CCM']},
  {textSnippets:['Powered by Tracking Garden']}, {domSelectors:['#ensOpenModal','#ensNotifyBanner-copy','.ccm-root-example','#ccm-widget-extra']},
  ...['https://other.example/rp/cb/app.js','http://www.fc-moto.com/rp/cb/app.js','https://www.fc-moto.com/rp/tp/aGTM.js','https://www.fc-moto.com.evil.example/rp/cb/app.js'].map(url=>({urls:[url]})),
 ])assert.equal(detectKnownCmps(input).some(r=>['CCM19','Ensighten Privacy'].includes(r.canonicalName)),false,JSON.stringify(input));
});
