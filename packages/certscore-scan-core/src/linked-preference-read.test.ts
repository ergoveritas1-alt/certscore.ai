import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {runCmpPreferencesObserver} from './cmp-preferences-observer';
import {cmpPreferencesEvidenceSchema,hasBoundCmpPreferenceDocument} from '@certscore/contracts';

test('passive CMP capture never follows a linked preference page or submits its form', {timeout:25000},async()=>{
 let mode='valid';const hits:string[]=[];
 const server=createServer(async(req,res)=>{hits.push(`${req.method} ${req.url}`);res.setHeader('Content-Type','text/html');
  if(req.url==='/settings'){
   if(mode==='delayed')await new Promise(resolve=>setTimeout(resolve,2200));
   if(mode==='blocked'){res.statusCode=403;res.end('Access denied');return;}
   if(mode==='redirect'){res.statusCode=302;res.setHeader('Location','/unexpected');res.end();return;}
   res.end('<main><h1>Privacy Settings</h1><form method="post" action="/save"><fieldset><legend>Sale or sharing</legend><label><input type="radio" name="sale" checked>Accept Standard Advertising Settings (Opt In)</label><label><input type="radio" name="sale">Do Not Sell or Share My Personal Information (Opt Out)</label></fieldset><button>Save</button></form><a href="/privacy">Privacy policy</a></main>'+ (mode==='delayed_controls'?'<script>for(const input of document.querySelectorAll("input"))input.disabled=true;setTimeout(()=>{for(const input of document.querySelectorAll("input"))input.disabled=false;},350);</script>':''));return;
  }
  res.end(`<main><h1>Homepage</h1><a href="${mode==='external'?'https://external.example.test/settings':'/settings'}">Privacy Settings</a>${mode==='ambiguous'?'<a href="/another">Privacy Settings</a>':''}<a href="/privacy">Privacy Policy</a></main>`);
 });server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
 try{
  for(mode of ['valid','delayed','delayed_controls','ambiguous','external','redirect','blocked']){
   hits.length=0;
   const packet=await runCmpPreferencesObserver({parentDispatchSha256:'a'.repeat(64),config:{policyVersion:'bounded_cmp_preferences.v1',computeBudgetPolicy:'coverage_25_gb_seconds.v1',enabled:true,scanId:'linked-'+mode,exactTargetUrl:base+'/'}});
   assert.equal(packet.action.count,0);assert.equal(packet.action.opened,false);assert.equal(hits.some(hit=>hit.startsWith('POST')||hit.includes('/save')||hit.includes('/unexpected')),false,JSON.stringify(hits));
   assert.equal(packet.status,'limited',JSON.stringify(packet));
   assert.equal(packet.finalUrl,base+'/');assert.equal(hasBoundCmpPreferenceDocument(packet),true);
   assert.equal(packet.captureMode,'passive_cmp_inventory.v1');
   assert.equal(packet.controls.length,0);assert.equal(packet.controlInventoryComplete,false);
   assert.equal(packet.linkedPreferenceNavigation,undefined);
   assert.equal(packet.checkpoints?.controlsSurface,'first_layer');
   assert.equal(hits.some(hit=>hit.includes('/settings')||hit.includes('/another')||hit.includes('/privacy')),false,JSON.stringify(hits));
   assert.equal(cmpPreferencesEvidenceSchema.safeParse({...packet,action:{...packet.action,count:1}}).success,false);

  }
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
