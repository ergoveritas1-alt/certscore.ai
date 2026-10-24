import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { privacyChoiceInspectionSchema } from "@certscore/contracts";
import { createArtifactWriter } from "./artifact-writer";
import { capturePassivePrivacyChoiceDiagnostic, policySurfaceScanner } from "./scanners/policy-surface-scanner";
import { redirectedPolicyText } from "./test-fixtures/redirected-policy-recovery";

const label = "Do Not Sell or Share My Personal Information";
const svg = (content: string) => `<svg width="700" height="60">${content}</svg>`;
const refs = `<span id="choice-name" hidden>${label}</span>`;
const scenarios = [
  {name:"SVG anchor rendered text", html:svg(`<a href="/choices"><text y="25">${label}</text></a>`), unnamed:0, named:1},
  {name:"SVG text button rendered text", html:svg(`<text role="button" y="25">${label}</text>`), unnamed:0, named:1},
  {name:"SVG leaf tspan link rendered text", html:svg(`<text y="25"><tspan role="link">${label}</tspan></text>`), unnamed:0, named:1},
  {name:"leading whitespace preserves fourth label reference",html:`${refs}<button aria-labelledby=" missing-a missing-b missing-c choice-name "></button>`,unnamed:0,named:1},
  {name:"resolved name-only button survives candidate retention",html:`${refs}<button aria-labelledby="choice-name"></button>`,unnamed:0,named:1},
  {name:"shadow-root label references remain root-bound",html:`<span id="choice-name">Search</span><div id="host"></div><script>document.querySelector('#host').attachShadow({mode:'open'}).innerHTML=${JSON.stringify(`${refs}<button aria-labelledby=" a b c choice-name "></button>`)};</script>`,unnamed:0,named:1},
  {name:"fifth reference stays outside existing four-reference cap",html:`${refs}<button style="width:40px;height:25px" aria-labelledby=" a b c d choice-name "></button>`,unnamed:1,named:0,truncated:true},
  {name:"whitespace does not mark four missing references truncated",html:'<button style="width:40px;height:25px" aria-labelledby=" a b c d "></button>',unnamed:1,named:0,truncated:false},
  {name:"shadow-root reference cannot borrow outer document name",html:`${refs}<div id="host"></div><script>document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<button style="width:40px;height:25px" aria-labelledby="choice-name"></button>';</script>`,unnamed:1,named:0},
  {name:"SVG metadata is not rendered text",html:svg(`<a href="/choices"><metadata>${label}</metadata><rect width="40" height="25"/></a>`),unnamed:1,named:0},
  {name:"hidden SVG text is not a visible name",html:svg(`<a href="/choices"><text y="25" style="visibility:hidden">${label}</text></a>`),unnamed:1,named:0},
  {name:"nested SVG text remains outside narrow fallback",html:svg(`<a href="/choices"><text y="25"><tspan>Menu</tspan><tspan style="display:none">${label}</tspan></text></a>`),unnamed:1,named:0},
  {name:"empty control remains unknown",html:'<button style="width:40px;height:25px"></button>',unnamed:1,named:0},
  {name:"ordinary named SVG navigation is not opt-out",html:svg('<a href="/home"><text y="25">Home</text></a>'),unnamed:0,named:0},
  {name:"frame label repair does not exempt interactive frames",html:`<iframe srcdoc="${(`${refs}<button aria-labelledby=' a b c choice-name '></button>`).replaceAll('"','&quot;')}"></iframe>`,unnamed:0,named:1,frame:true},
  {name:"frame SVG text repair does not exempt interactive frames",html:`<iframe srcdoc="${svg(`<a href='/choices'><text y='25'>${label}</text></a>`).replaceAll('"','&quot;')}"></iframe>`,unnamed:0,named:1,frame:true},
];

async function fixture(html: string, svgReadCostMs = 0) {
  const requests: string[] = [];
  const server=createServer((req,res)=>{
    requests.push(req.url??'');res.setHeader('content-type','text/html');
    if(req.url==='/')res.end(`<html lang="en"><body><main>${"Cloud Security provides tools, documentation and local support for business websites. ".repeat(25)}</main><footer><a href="/privacy">Privacy Policy</a>${html}</footer></body></html>`);
    else if(req.url==='/privacy')res.end(`<html lang="en"><title>Privacy Policy</title><body>${redirectedPolicyText.repeat(4)}</body></html>`);
    else {res.statusCode=404;res.end('Not found');}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address==='object');
  const url=`http://127.0.0.1:${address.port}/`,browser=await chromium.launch({headless:true});
  const newContext=browser.newContext.bind(browser);let inventoryReads=0,frameReads=0,externalRequests=0;
  browser.newContext=async(...args)=>{
    const context=await newContext(...args);
    await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==new URL(url).origin){externalRequests++;await route.abort();}else await route.fallback();});
    const newPage=context.newPage.bind(context);context.newPage=async()=>{
      const page=await newPage(),evaluate=page.evaluate.bind(page),evaluateHandle=page.evaluateHandle.bind(page);
      page.evaluateHandle=(async(fn:unknown,arg:unknown)=>{
        if(typeof fn==='string'&&fn.includes('unnamedControlCount')) {
          inventoryReads++;
          if(svgReadCostMs) fn=`(() => { let clock=0; Object.defineProperty(performance,'now',{value:()=>clock});
            const rects=Element.prototype.getClientRects; Element.prototype.getClientRects=function(){
              const value=rects.call(this);if(this.namespaceURI==='http://www.w3.org/2000/svg')clock+=${svgReadCostMs};return value;};
            return ${fn}; })()`;
        }
        return evaluateHandle(fn as never,arg as never);
      }) as typeof page.evaluateHandle;
      page.evaluate=(async(fn:unknown,arg:unknown)=>{
        if(String(fn).includes('regionHtml'))frameReads++;
        return evaluate(fn as never,arg as never);
      }) as typeof page.evaluate;return page;
    };return context;
  };
  return {url,browser,requests,counts:()=>({inventoryReads,frameReads,externalRequests}),async close(){await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}

for(const scenario of scenarios) test(`bounded name extraction: ${scenario.name}`,{timeout:12000},async()=>{
  const f=await fixture(scenario.html);
  try {
    const start=Date.now();
    const result=await capturePassivePrivacyChoiceDiagnostic({url:f.url,normalizedUrl:f.url,scanStartedAtMs:start,
      internalBudgetMs:4000,absoluteDeadlineAtMs:start+5000,browser:f.browser} as Parameters<typeof capturePassivePrivacyChoiceDiagnostic>[0]);
    const inspection=privacyChoiceInspectionSchema.parse(result.privacyChoiceInspection);
    assert.equal(inspection.unnamedControlCount,scenario.unnamed);
    // HTML discovery may conservatively retain a choice candidate even when
    // its name/visibility proof is missing. Never erase that absence blocker.
    if(scenario.unnamed===0)assert.equal(inspection.namedChoiceCandidateCount,scenario.named);
    assert.equal(inspection.coverage,scenario.unnamed||scenario.frame?'limited':'complete');
    if(scenario.frame)assert.ok(inspection.uninspectedFrameCount>0);
    if('truncated' in scenario)assert.equal(inspection.diagnostics?.unnamedControls[0]?.labelledByTruncated,scenario.truncated);
    assert.deepEqual(f.counts(),{inventoryReads:1,frameReads:1,externalRequests:0});
    assert.deepEqual(f.requests,['/']);assert.ok(Date.now()-start<5000);
  } finally {await f.close();}
});

for(const source of ['text','aria_labelledby'] as const) test(`${source} name retains normal positive source and document provenance`,{timeout:15000},async()=>{
  const f=await fixture(source==='text'?svg(`<a href="/choices"><text y="25">${label}</text></a>`):`${refs}<button aria-labelledby=" a b c choice-name "></button>`);
  const root=await mkdtemp(path.join(tmpdir(),'certscore-name-proof-'));
  try {
    const start=Date.now(),result=await policySurfaceScanner({url:f.url,normalizedUrl:f.url,scanStartedAtMs:start,
      internalBudgetMs:6000,absoluteDeadlineAtMs:start+10000,discoveryMode:'fast',browser:f.browser,
      artifactWriter:await createArtifactWriter(root),enableNanoPolicyAssist:false,
      nanoAssistProvider:{async classifyLinks(){throw new Error('No model calls authorized in offline fixture');}}});
    const choice=result.policySurfaceObservations.find(row=>row.surfaceType==='do_not_sell_or_share'&&row.linkVisibility==='visible');
    assert.ok(choice);assert.equal(choice.linkText,label);assert.equal(choice.accessibleNameSource,source);
    assert.equal(choice.linkSourcePageUrl,f.url);assert.equal(choice.normalizedUrl,source==='text'?f.url+'choices':f.url);
    assert.equal(result.privacyChoiceInspection?.unnamedControlCount,0);
    assert.equal(f.counts().externalRequests,0);
  }finally{await f.close();await rm(root,{recursive:true,force:true});}
});

test('SVG fallback cap leaves unresolved controls unknown',{timeout:12000},async()=>{
  const f=await fixture(svg(Array.from({length:9},(_,i)=>`<a href="/home-${i}"><text y="${5+i*5}">Home ${i}</text></a>`).join('')));
  try {
    const start=Date.now(),result=await capturePassivePrivacyChoiceDiagnostic({url:f.url,normalizedUrl:f.url,
      scanStartedAtMs:start,internalBudgetMs:4000,absoluteDeadlineAtMs:start+5000,browser:f.browser} as Parameters<typeof capturePassivePrivacyChoiceDiagnostic>[0]);
    assert.ok((result.privacyChoiceInspection?.unnamedControlCount??0)>=1);
    assert.equal(result.privacyChoiceInspection?.coverage,'limited');
    assert.ok(result.privacyChoiceInspection?.limitationKeys.includes('unnamed_controls'));
    assert.deepEqual(f.counts(),{inventoryReads:1,frameReads:1,externalRequests:0});
  }finally{await f.close();}
});

test('SVG fallback time limit leaves later controls unknown',{timeout:12000},async()=>{
  const f=await fixture(svg('<a href="/first"><text y="20">Home</text></a><a href="/second"><text y="45">Menu</text></a>'),3);
  try {
    const start=Date.now(),result=await capturePassivePrivacyChoiceDiagnostic({url:f.url,normalizedUrl:f.url,
      scanStartedAtMs:start,internalBudgetMs:4000,absoluteDeadlineAtMs:start+5000,browser:f.browser} as Parameters<typeof capturePassivePrivacyChoiceDiagnostic>[0]);
    assert.equal(result.privacyChoiceInspection?.unnamedControlCount,1);
    assert.equal(result.privacyChoiceInspection?.coverage,'limited');
    assert.deepEqual(f.counts(),{inventoryReads:1,frameReads:1,externalRequests:0});
  }finally{await f.close();}
});

test('hidden SVG text and metadata do not acquire visible choice proof',{timeout:15000},async()=>{
  const f=await fixture(svg(`<a href="/choices"><text y="25" visibility="hidden">${label}</text></a><a href="/metadata"><metadata>${label}</metadata><rect width="30" height="25"/></a>`));
  const root=await mkdtemp(path.join(tmpdir(),'certscore-name-negative-'));
  try {
    const start=Date.now(),result=await policySurfaceScanner({url:f.url,normalizedUrl:f.url,scanStartedAtMs:start,
      internalBudgetMs:6000,absoluteDeadlineAtMs:start+10000,discoveryMode:'fast',browser:f.browser,
      artifactWriter:await createArtifactWriter(root),enableNanoPolicyAssist:false,
      nanoAssistProvider:{async classifyLinks(){throw new Error('No model calls authorized in offline fixture');}}});
    assert.equal(result.policySurfaceObservations.some(row=>row.surfaceType==='do_not_sell_or_share'&&row.linkVisibility==='visible'&&row.accessibleNameSource&&row.accessibleNameSource!=='none'),false,
      JSON.stringify(result.policySurfaceObservations.filter(row=>row.surfaceType==='do_not_sell_or_share').map(row=>({label:row.linkText,visibility:row.linkVisibility,source:row.accessibleNameSource}))));
    assert.equal(result.privacyChoiceInspection?.coverage,'limited');
  }finally{await f.close();await rm(root,{recursive:true,force:true});}
});
