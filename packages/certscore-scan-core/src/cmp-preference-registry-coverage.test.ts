import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {runCmpPreferencesObserver} from './cmp-preferences-observer.js';
import {classifyConsentControlLabel} from '@certscore/contracts';

for(const kind of ['anthropic','axeptio'] as const) test(`${kind} passive capture never opens a registered panel or saves`,async()=>{
  let mode='valid',clicks=0,saves=0;
  const server=createServer((req,res)=>{
    if(req.url==='/opened'){clicks++;res.end();return;}
    if(req.url==='/saved'){saves++;res.end();return;}
    res.setHeader('Content-Type','text/html');
    const name=mode==='wrong-label'?'Accept all cookies':kind==='anthropic'?'Customize cookie settings':'Cookies';
    const panel=kind==='anthropic'?`<dialog id="consent-container" open><p id="consent-description"><a href="https://www.anthropic.com/legal/cookies">Cookie policy</a></p><button id="customize-btn">${name}</button><div id="detailed-options" style="display:none"><form id="consent-form"><div><h6>Analytics</h6><label><input type="checkbox"><span>Toggle</span></label></div><button onclick="fetch('/saved')">Save preferences</button></form></div></dialog>`
      :`<div class="ax-website-overlay"><button id="axeptio_main_button" title="${mode==='wrong-label'?'Accept all cookies':'Manage your preferences about cookies'}">${name}</button><section data-testid="widget-container" hidden><div aria-hidden="true"><label>Axeptio consent<input id="axeptio_consent_checkbox" type="checkbox"></label></div><div class="axeptio_widget"><ul><li><div><a href="https://business.safety.google/privacy/" aria-label="Google Analytics 4: More information about this cookie">Info</a><label><div><span dir="auto">Google Analytics 4</span><p>Audience measurement</p></div><span><input type="checkbox"></span></label></div></li></ul></div><button onclick="fetch('/saved')">Close</button></section></div>`;
    res.end(`${panel}<script>
      ${kind==='axeptio'?`const host=document.createElement('div');document.body.append(host);host.attachShadow({mode:'open'}).append(document.querySelector('.ax-website-overlay'));const root=host.shadowRoot;`:'const root=document;'}
      root.querySelector('${kind==='anthropic'?'#customize-btn':'#axeptio_main_button'}').onclick=()=>{fetch('/opened');const p=root.querySelector('${kind==='anthropic'?'#detailed-options':'[data-testid="widget-container"]'}');${mode==='replace'?'p.outerHTML=p.outerHTML;':''}p.hidden=false;p.style.display='block';};
    </script>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();assert.ok(a&&typeof a!=='string');
  const memory=process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE='10240';
  try {
    for(mode of ['valid','wrong-label','replace']){
      clicks=0;saves=0;
      const packet=await runCmpPreferencesObserver({parentDispatchSha256:'a'.repeat(64),config:{policyVersion:'bounded_cmp_preferences.v1',enabled:true,scanId:kind+'-'+mode,exactTargetUrl:`http://127.0.0.1:${a.port}/`}});
      assert.equal(saves,0);assert.equal(clicks,0);
      assert.equal(packet.captureMode,'passive_cmp_inventory.v1');
      assert.equal(packet.action.count,0);assert.equal(packet.action.opened,false);
      assert.equal(packet.controlInventoryComplete,false);
      assert.equal(packet.controls.length,0,'Hidden panel controls are not visible inventory');
      assert.equal(packet.linkedPreferenceNavigation,undefined);

    }
  }finally{if(memory===undefined)delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;else process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE=memory;await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('Axeptio title is observation-only, exact and never an Accept/Reject action',()=>{
 const input={label:'Cookies',title:'Manage your preferences about cookies',hasConsentContext:true};
 assert.equal(classifyConsentControlLabel({...input,usage:'observation'}).intent,'options');
 assert.equal(classifyConsentControlLabel({...input,usage:'action'}).intent,'unknown');
 assert.notEqual(classifyConsentControlLabel({...input,title:'Close cookie settings',usage:'action'}).intent,'reject');
});

test('an unidentified CMP stays limited without claiming an inventory or following links', {timeout:12000}, async()=>{
 const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<main>Public page</main><div style="height:2000px"></div><a href="https://example.test/privacy-policy">Privacy policy</a>');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const a=server.address();assert.ok(a&&typeof a!=='string');
 const memory=process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE='3008';
 const start=Date.now();
 try{
  const packet=await runCmpPreferencesObserver({parentDispatchSha256:'a'.repeat(64),config:{policyVersion:'bounded_cmp_preferences.v1',enabled:true,scanId:'unknown-cmp',exactTargetUrl:`http://127.0.0.1:${a.port}/`}});
  assert.ok(Date.now()-start<10500);
  assert.equal(packet.status,'limited');
  assert.equal(packet.support.reason,'cmp_not_identified');
  assert.equal(packet.action.count,0);assert.equal(packet.controlInventoryComplete,false);
  assert.equal(packet.privacyLinks.length,0);
  assert.equal(packet.checkpoints?.privacyLinks,false);
 }finally{if(memory===undefined)delete process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;else process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE=memory;await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
