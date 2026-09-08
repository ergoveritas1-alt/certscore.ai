import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer, request} from 'node:http';
import {createProxyDestinationCapture,enrichBeforeDeadline} from './proxy-destination-capture.js';

test('optional proxy capture preserves ordinary HTTP requests and cleans up', async () => {
 const keys=['CERTSCORE_PROXY_DESTINATION_ENABLED','CERTSCORE_PROXY_RECORDS_URL','CERTSCORE_PROXY_RECORDS_KEY'];
 const prior=keys.map(k=>process.env[k]);
 const upstream=createServer((q,s)=>{assert.equal(q.url,'http://example.com/plain');s.end('preserved');});
 await new Promise<void>(r=>upstream.listen(0,'127.0.0.1',r));
 const address=upstream.address();assert(address&&typeof address!=='string');
 process.env.CERTSCORE_PROXY_DESTINATION_ENABLED='1';
 process.env.CERTSCORE_PROXY_RECORDS_URL=`http://127.0.0.1:${address.port}/records`;
 process.env.CERTSCORE_PROXY_RECORDS_KEY='a'.repeat(64);
 const capture=await createProxyDestinationCapture({proxy:{server:`http://127.0.0.1:${address.port}`}});
 try{
  assert(capture);
  const result=await new Promise<string>((resolve,reject)=>{
   const q=request(capture.launch.proxy!.server,{path:'http://example.com/plain'},s=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>resolve(b));});q.on('error',reject);q.end();
  });
  assert.equal(result,'preserved');
  assert.equal((await capture.resolve(Date.now()-1)).size,0);
 }finally{
  await capture?.close();await new Promise<void>(r=>upstream.close(()=>r()));
  keys.forEach((k,i)=>{if(prior[i]===undefined)delete process.env[k];else process.env[k]=prior[i];});
 }
});


test('slow enrichment retains the verified proxy address at the existing deadline', async () => {
 const observed={ip:'8.8.8.8',source:'proxy_connect' as const,locationLabel:'server location (may be CDN edge)' as const,
  proxyConnection:{version:'chromium_connection.v1' as const,connectionId:1,tunnelId:'12345678-1234-4234-8234-123456789012',authority:'example.com:443',recordHash:'a'.repeat(64)}};
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),10);
 try {
  const result=await enrichBeforeDeadline(observed,controller.signal,()=>new Promise(()=>{}));
  assert.deepEqual(result,observed);
  assert.deepEqual(await enrichBeforeDeadline(observed,controller.signal),observed);
 }finally{clearTimeout(timer);}
});
