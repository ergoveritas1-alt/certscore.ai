import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
const ns=await import('../../packages/certscore-scan-core/src/action-request-retention.ts');
const {createActionRequestRetention,classifyActionRequestRetention}=ns.default??ns;
const root='artifacts/ar-request-retention-20261009';
const make=(url:string,type:string,id:string)=>({id,request:{url:()=>url,resourceType:()=>type}});
const inspection=[];
for(const action of ['accept','reject']){
 const file=`artifacts/ar-onetrust-confirmation-20261009/visits-smoke/fullstory.com/candidate-1/${action}/${action==='accept'?'PostAcceptEvidencePacket':'PostRefusalEvidencePacket'}.json`;
 const p=JSON.parse(await readFile(file,'utf8'));const counts:Record<string,number>={};
 for(const r of p.network.requests){const kind=classifyActionRequestRetention(r.sanitizedUrl,r.resourceType).kind;counts[kind]=(counts[kind]??0)+1;}
 inspection.push({action,retained:p.network.requests.length,missing:p.captureCoverage.requestsDroppedAfterAction,classifications:counts,censored:true,note:'Missing rows cannot be reconstructed; inspection is not recovery measurement.'});
}
const stream=Array.from({length:220},(_,i)=>make(`https://images.ctfassets.net/${i}.png`,'image',`cdn${i}`));
stream.push(make('https://unknown.test/pixel.gif','image','unknown'),make('https://www.google-analytics.com/collect','image','tracking_pixel'),make('https://bat.bing.com/action/0','image','second_tracker'));
const rows:typeof stream=[];const retention=createActionRequestRetention(rows,192);for(const row of stream)retention.offer(row);
const fifo=stream.slice(0,192);
const benchmark=[];
for(const size of [320,1000,10000]){
 const inputs=Array.from({length:size},(_,i)=>make(`https://images.ctfassets.net/${i}.png`,'image',String(i)));
 const durations=[];
 for(let repeat=0;repeat<7;repeat++){const rows:typeof inputs=[];const capture=createActionRequestRetention(rows,192);const start=performance.now();for(const r of inputs)capture.offer(r);durations.push(performance.now()-start);}
 benchmark.push({requests:size,medianMs:[...durations].sort((a,b)=>a-b)[3],maxMs:Math.max(...durations),durationsMs:durations});
}
const out={censoredTraceInspection:inspection,completeDeterministicStream:{observed:stream.length,cap:192,fifoLateRows:fifo.filter(r=>!r.id.startsWith('cdn')).map(r=>r.id),priorityLateRows:rows.filter(r=>!r.id.startsWith('cdn')).map(r=>r.id),summary:retention.summary(),note:'Synthetic complete stream; not FullStory missing traffic.'},benchmark,note:'Local warm-loop CPU timings; not measured Lambda latency/cost. No browser wait or storage capacity added.'};
await writeFile(`${root}/replay-results.json`,JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
