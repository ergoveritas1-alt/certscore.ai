import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { runCmpPreferencesObserver } from "./cmp-preferences-observer";

test("registered privacy entrance remains untouched during passive capture", async () => {
  let opens=0, changes=0;
  const server=createServer((req,res)=>{
    if(req.url==='/opened'){opens++;res.end();return;}
    if(req.url==='/changed'){changes++;res.end();return;}
    res.setHeader('content-type','text/html');
    res.end(`<!doctype html><html lang="en"><body><div id="onetrust-consent-sdk"><button hidden type="button" id="onetrust-pc-btn-handler">Cookie Settings</button><div id="onetrust-pc-sdk" role="dialog" aria-label="Privacy preferences" hidden><label><input type="checkbox" checked onchange="fetch('/changed')">Sale, sharing and targeted advertising</label><button type="button" onclick="fetch('/changed')">Confirm My Choice</button></div></div><footer><a href="#" id="ot-sdk-btn" class="ot-sdk-show-settings" onclick="event.preventDefault();document.getElementById('onetrust-pc-sdk').hidden=false;fetch('/opened')">Your Privacy Choices</a></footer></body></html>`);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  try {
    const packet=await runCmpPreferencesObserver({parentDispatchSha256:'a'.repeat(64),config:{policyVersion:'bounded_cmp_preferences.v1',enabled:true,scanId:'privacy-entrance',exactTargetUrl:`http://127.0.0.1:${address.port}/`}});
    assert.equal(packet.action.opened,false,JSON.stringify(packet));
    assert.equal(packet.action.count,0);
    assert.equal(packet.captureMode,'passive_cmp_inventory.v1');
    assert.equal(packet.controlInventoryComplete,false);
    assert.equal(packet.controls.length,0);
    assert.equal(opens,0);assert.equal(changes,0);
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
