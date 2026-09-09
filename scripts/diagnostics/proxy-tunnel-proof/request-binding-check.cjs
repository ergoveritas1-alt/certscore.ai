// Read-only localhost fixture: verify whether Playwright timing can bind CDP responses.
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');
const fields = ['startTime','domainLookupStart','domainLookupEnd','connectStart','secureConnectionStart','connectEnd','requestStart','responseStart'];
const signature = (url,status,t) => JSON.stringify([url,status,...fields.map(f=>t[f])]);
(async()=>{
 const server=http.createServer((q,s)=>{
  if(q.url==='/'){s.setHeader('Content-Type','text/html');s.end(`<script>window.done=Promise.all(Array.from({length:30},()=>fetch('/same').then(r=>r.text())));</script>`);}
  else {s.setHeader('Cache-Control','no-store');s.end('ok');}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true, executablePath:process.env.CERTSCORE_CHROMIUM_EXECUTABLE_PATH});
 try {
  const page=await browser.newPage(), cdp=await page.context().newCDPSession(page);
  const requests=new Map(), cdpRows=[], pwRows=[], exactAddresses=[];
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent',e=>requests.set(e.requestId,e));
  cdp.on('Network.responseReceived',e=>{
   const q=requests.get(e.requestId), p=e.response.timing;
   if(!q||!p)return;
   const t={startTime:(p.requestTime-q.timestamp+q.wallTime)*1000,domainLookupStart:p.dnsStart,domainLookupEnd:p.dnsEnd,connectStart:p.connectStart,secureConnectionStart:p.sslStart,connectEnd:p.connectEnd,requestStart:p.sendStart,responseStart:p.receiveHeadersEnd};
   cdpRows.push({key:signature(e.response.url,e.response.status,t),id:e.requestId,connectionId:e.response.connectionId});
  });
  page.on('response',r=>{pwRows.push(signature(r.url(),r.status(),r.request().timing()));exactAddresses.push(r.serverAddr());});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.evaluate(()=>window.done);
  assert.equal(pwRows.length,31);assert.equal(cdpRows.length,31);
  console.log(JSON.stringify({samplePlaywright:JSON.parse(pwRows[0]),sampleCdp:JSON.parse(cdpRows[0].key)}));
  const matches=pwRows.map(key=>cdpRows.filter(r=>r.key===key).length);
  console.log(JSON.stringify({chromium:browser.version(),responses:pwRows.length,uniquelyBound:matches.filter(n=>n===1).length,missing:matches.filter(n=>n===0).length,ambiguous:matches.filter(n=>n>1).length}));
  const exact=await Promise.all(exactAddresses);
  assert.equal(exact.length,31);
  assert(exact.every(a=>Number.isSafeInteger(a?.certscoreConnectionId)&&a.certscoreConnectionId>0),'Exact response IDs must be exposed');
  assert.deepEqual(exact.map(a=>a.certscoreConnectionId).sort((a,b)=>a-b),cdpRows.map(r=>r.connectionId).sort((a,b)=>a-b));
  console.log(JSON.stringify({exactConnectionIdsVerified:exact.length,timingMatchingUsed:false}));
 } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
