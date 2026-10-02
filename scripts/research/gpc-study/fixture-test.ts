import {createServer} from 'node:http';import {captureVisit} from './visit.ts';import fs from 'node:fs';
async function main(){
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<html><title>Local measurement fixture</title><body>Known research fixture. No public target.<script>
 document.cookie='fixture_cookie=1; path=/';localStorage.setItem('fixture','safe');
 const gpc=navigator.globalPrivacyControl===true;
 window.__gpp=(command,cb)=>cb({gppVersion:'1.1',cmpStatus:'loaded',signalStatus:'ready',applicableSections:[8],sectionList:[8],parsedSections:{usca:[{Version:1,SaleOptOutNotice:1,SharingOptOutNotice:1,SaleOptOut:gpc?1:2,SharingOptOut:gpc?1:2},{GpcSegmentType:1,Gpc:gpc}]}},true);
 if(location.pathname!='/positive'||!gpc){setTimeout(()=>fetch('/collect?fixture=1'),1500);}
 </script></body></html>`);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const port=(server.address() as any).port;
 const results=[];
 try{for(const target of ['positive','negative'])for(const condition of ['absent','enabled']){
  const result=await captureVisit({visit_id:`fixture_${target}_${condition}`,site_id:target,block:1,condition,assigned_order:'AB',position:condition==='absent'?1:2,url:`http://127.0.0.1:${port}/${target}`,ua_profile:'chromium'}, {fixture:true,endpointsMs:[1000,5000,10000],navigationTimeoutMs:20000,visitTimeoutMs:45000,maxRequests:20000,maxBytes:20*1024*1024});
  results.push(result);
 }}finally{server.close();}
 const out=process.argv[2]??'artifacts/research/gpc-controlled-study-2026/private/fixture-results.json';fs.writeFileSync(out,JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(r=>({id:r.visit.visit_id,status:r.status,limits:r.coverage.limitations,windows:r.derived.windows.map((w:any)=>({h:w.horizonMs,n:w.requests,trackers:w.trackers.services.length,complete:w.complete})),browser:r.provenance.chromiumVersion})),null,2));
 if(results.some(r=>r.status!=='complete'||r.coverage.limitations.length||r.observed.snapshots.some((s:any)=>s.semantic?.gppStatus!=='observed')))process.exitCode=1;
 const counts=results.map(r=>r.derived.windows.find((w:any)=>w.horizonMs===10000)?.requests);
 if(JSON.stringify(counts)!==JSON.stringify([1,0,1,1]))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
